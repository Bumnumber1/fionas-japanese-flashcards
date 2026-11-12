"""Play a Japanese fixture through the simulator microphone during a native Safari test."""

import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import wave
from pathlib import Path


SETUP_ERRORS = (OSError, RuntimeError, ValueError, wave.Error, subprocess.TimeoutExpired)
PERMISSION_ERRORS = SETUP_ERRORS + (KeyError,)


class NativeAudio:
    def __init__(self, udid):
        self.env = {**os.environ, "IDB_UDID": udid}
        self.transport = None
        self.voice = None
        self.vision = None
        self.vision_error = None

    def run(self, args, timeout):
        result = subprocess.run(args, env=self.env, capture_output=True, encoding="utf-8",
                                errors="replace", timeout=timeout)
        if result.returncode:
            detail = (result.stderr or result.stdout).strip().splitlines()
            raise RuntimeError(f"{args[0]} exited {result.returncode}: " + " ".join(detail[-2:])[-500:])
        return result.stdout

    def prepare(self):
        """Call after booting the simulator and before opening the WebDriver session."""
        if shutil.which("xcrun"):
            # Build before requesting the microphone. Compiling Vision on a
            # fresh runner should never consume a child's first speaking window.
            self.tools_dir = tempfile.TemporaryDirectory(prefix="dojo-ipad-permission-")
            binary = str(Path(self.tools_dir.name, "screen-text"))
            try:
                self.run(["xcrun", "--sdk", "macosx", "swiftc", str(Path(__file__).with_name("ipad_screen_text.swift")),
                          "-o", binary], 90)
                self.vision = binary
            except SETUP_ERRORS as error:
                self.vision_error = str(error)
        try:
            failures = []
            # Verify an actual Japanese utterance before opening the mic. Querying
            # the macOS voice catalogue can stall on a freshly booted runner.
            with tempfile.TemporaryDirectory(prefix="dojo-ipad-voice-probe-") as tmp:
                wav = Path(tmp, "probe.wav")
                if shutil.which("espeak-ng"):
                    try:
                        self.synthesize("espeak-ng/ja", "あ", wav)
                        self.voice = "espeak-ng/ja"
                    except SETUP_ERRORS as error:
                        failures.append(str(error))
                if not self.voice and shutil.which("say"):
                    try:
                        voices = self.run(["say", "-v", "?"], 15)
                        match = re.search(r"^(.+?)\s+ja[_-]JP\s", voices, flags=re.MULTILINE)
                        if match:
                            name = match.group(1).strip()
                            self.synthesize(name, "あ", wav)
                            self.voice = name
                    except SETUP_ERRORS as error:
                        failures.append(str(error))
            if not self.voice:
                raise RuntimeError("No usable Japanese voice: " + ("; ".join(failures) or "none installed"))

            if shutil.which("SwitchAudioSource") and shutil.which("afplay"):
                try:
                    routes = [self.run(["SwitchAudioSource", "-c", "-t", kind], 8).strip()
                              for kind in ("input", "output")]
                except SETUP_ERRORS as error:
                    failures.append(str(error))
                    routes = ["", ""]
                if routes[0] == routes[1] and "blackhole" in routes[0].lower():
                    self.transport = "Core Audio loopback"
                    return {"ok": True, "transport": self.transport, "route": routes[0], "voice": self.voice}

            if not shutil.which("idb"):
                raise RuntimeError("No selected Core Audio loopback or idb command. " + "; ".join(failures))
            # idb v1.7.8 prepares microphone injection in the app launch environment.
            # Launch before safaridriver attaches. Its injection command reports
            # when a recording process actually claims and consumes the WAV.
            self.run(["idb", "launch", "com.apple.mobilesafari"], 35)
            self.transport = "idb audio inject"
            return {"ok": True, "transport": self.transport, "voice": self.voice}
        except SETUP_ERRORS as error:
            return {"ok": False, "reason": str(error)}

    def synthesize(self, voice, kana, wav):
        if voice == "espeak-ng/ja":
            self.run(["espeak-ng", "-v", "ja", "-s", "135", "-w", str(wav), kana], 8)
        else:
            aiff = wav.with_suffix(".aiff")
            self.run(["say", "-v", voice, "-r", "140", "-o", str(aiff), kana], 10)
            self.run(["afconvert", "-f", "WAVE", "-d", "LEI16", str(aiff), str(wav)], 8)
        with wave.open(str(wav), "rb") as audio:
            count = audio.getnframes()
            if audio.getsampwidth() != 2 or count < 1 or not any(audio.readframes(count)):
                raise RuntimeError("The synthesized sound did not contain 16-bit PCM audio")
            return round(count / audio.getframerate(), 3)

    def inject(self, kana):
        """Return transport evidence only. The caller verifies a fresh game result."""
        if not self.transport or not self.voice:
            return {"ok": False, "reason": "Audio preparation did not complete"}
        if not re.fullmatch(r"[ぁ-ゖァ-ヺー]{1,20}", kana or ""):
            return {"ok": False, "reason": "The prompt is not a kana reading"}
        try:
            with tempfile.TemporaryDirectory(prefix="dojo-ipad-speech-") as tmp:
                wav = Path(tmp, "card.wav")
                seconds = self.synthesize(self.voice, kana, wav)
                command = ["afplay"] if self.transport == "Core Audio loopback" else ["idb", "audio", "inject"]
                self.run([*command, str(wav)], 48)
            return {"ok": True, "transport": self.transport, "durationSeconds": seconds, "voice": self.voice}
        except (OSError, RuntimeError, ValueError, wave.Error, subprocess.TimeoutExpired) as error:
            return {"ok": False, "transport": self.transport, "reason": str(error)}

    def allow_prompt(self, stop=None, screen=None, delay_first=0):
        """Observe real permission sheets concurrently with the tap and readiness checks."""
        if not shutil.which("idb"):
            return {"tapped": [], "reason": "idb accessibility controls unavailable"}
        stop = stop or threading.Event()
        result = {"tapped": [], "observations": []}
        if self.vision_error:
            result["visionSetup"] = self.vision_error
        start = time.monotonic()
        deadline = start + 85
        if screen and (len(screen) != 2 or not all(isinstance(n, (int, float)) and 0 < n < 4000 for n in screen)):
            raise ValueError("Expected the simulator screen dimensions in points")
        with tempfile.TemporaryDirectory(prefix="dojo-ipad-consent-") as tmp:
            shot = Path(tmp, "screen.png")
            while not stop.is_set() and time.monotonic() < deadline and len(result["tapped"]) < 4:
                found = None
                if self.vision and screen:
                    try:
                        shot.unlink(missing_ok=True)
                        self.run(["xcrun", "simctl", "io", self.env["IDB_UDID"], "screenshot", str(shot)], 9)
                        rows = json.loads(self.run([self.vision, str(shot)], 7))
                        found = _screen_permission(rows, screen)
                    except SETUP_ERRORS as error:
                        result["lastScreenError"] = str(error)
                if not found and not stop.is_set():
                    try:
                        tree = json.loads(self.run(["idb", "ui", "describe-all", "--nested"], 3))
                        button = _permission_button(tree)
                        if button:
                            frame = button["frame"]
                            found = ("speech/microphone", button["AXLabel"], frame["x"] + frame["width"]/2,
                                     frame["y"] + frame["height"]/2, "accessibility")
                    except PERMISSION_ERRORS as error:
                        result["lastAccessibilityError"] = str(error)
                if not found or stop.is_set():
                    stop.wait(.25)
                    continue
                kind, label, x, y, method = found
                result["observations"].append({"kind": kind, "label": label, "method": method,
                                               "atSeconds": round(time.monotonic()-start, 2)})
                if method == "screen" and shot.is_file():
                    evidence = Path("artifacts/ipad-safari")
                    evidence.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(shot, evidence / f"permission-{kind}.png")
                if delay_first:
                    stop.wait(delay_first)
                    delay_first = 0
                    continue  # Reconfirm the exact sheet before tapping after a delay.
                try:
                    self.run(["idb", "ui", "tap", str(round(x)), str(round(y))], 8)
                    result["tapped"].append(label)
                except SETUP_ERRORS as error:
                    result["lastTapError"] = str(error)
                stop.wait(.5)
        return result


def _screen_permission(rows, screen):
    """Require a grant/decline pair and the Safari/fixture origin's permission question above it."""
    plausible = [r for r in rows if r["confidence"] >= .35 and 0 < r["x"] < 1 and 0 < r["y"] < 1]
    normalize = lambda s: s.lower().replace("’", "'").strip()
    for positive in plausible:
        label = normalize(positive["text"])
        if label not in ("allow", "ok", "allow once") or not .12 < positive["x"] < .88:
            continue
        peers = [r for r in plausible if normalize(r["text"]) in ("don't allow", "deny", "cancel") and
                 ((abs(r["y"] - positive["y"]) < .035 and .015 < positive["x"] - r["x"] < .42) or
                  (abs(r["x"] - positive["x"]) < .035 and .015 < abs(r["y"] - positive["y"]) < .09))]
        if not peers:
            continue
        mid = (peers[0]["x"] + positive["x"])/2
        lines = sorted((r for r in plausible if abs(r["x"]-mid) < .23 and
                        .008 < positive["y"]-r["y"] < .25), key=lambda r: r["y"])
        question = normalize(" ".join(r["text"] for r in lines))
        if not re.search(r"safari|127\.0\.0\.1|localhost|bumnumber1\.github\.io", question):
            continue
        if not re.search(r"would like (?:to )?(?:access|use)|want(?:s)? to (?:access|use)|allow .{0,80} to (?:access|use)", question):
            continue
        if re.search(r"camera|notification|location", question):
            continue
        kind = "speech" if "speech recognition" in question else "microphone" if "microphone" in question else None
        if kind:
            return kind, positive["text"], positive["x"]*screen[0], positive["y"]*screen[1], "screen"
    return None


def _nodes(root):
    if isinstance(root, list):
        for child in root:
            yield from _nodes(child)
    elif isinstance(root, dict):
        yield root
        yield from _nodes(root.get("children", []))


def _permission_button(snapshot):
    for alert in _nodes(snapshot):
        if alert.get("type") not in ("Alert", "Sheet"):
            continue
        descendants = list(_nodes(alert))
        message = " ".join(str(n.get("AXLabel") or "") for n in descendants).lower()
        if not re.search(r"safari|127\.0\.0\.1|localhost|bumnumber1\.github\.io", message):
            continue
        if re.search(r"camera|notification|location", message):
            continue
        if not re.search(r"microphone|speech recognition", message):
            continue
        if not re.search(r"would like|wants to|allow|permission", message):
            continue
        for node in descendants:
            if node.get("type") == "Button" and node.get("AXLabel") in (
                    "Allow", "Allow Once", "OK", "Allow While Using App") and node.get("frame"):
                return node
    return None

"""Play a Japanese fixture through the simulator microphone during a native Safari test."""

import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import wave
from pathlib import Path


SETUP_ERRORS = (OSError, RuntimeError, ValueError, wave.Error, subprocess.TimeoutExpired)


class NativeAudio:
    def __init__(self, udid):
        self.env = {**os.environ, "IDB_UDID": udid}
        self.transport = None
        self.voice = None

    def run(self, args, timeout):
        result = subprocess.run(args, env=self.env, capture_output=True, encoding="utf-8",
                                errors="replace", timeout=timeout)
        if result.returncode:
            detail = (result.stderr or result.stdout).strip().splitlines()
            raise RuntimeError(f"{args[0]} exited {result.returncode}: " + " ".join(detail[-2:])[-500:])
        return result.stdout

    def prepare(self):
        """Call after booting the simulator and before opening the WebDriver session."""
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

    def allow_prompt(self):
        """Accept only a simulator dialog specifically requesting speech or microphone access."""
        if not shutil.which("idb"):
            return {"tapped": [], "reason": "idb accessibility controls unavailable"}
        tapped = []
        deadline = time.monotonic() + 5
        try:
            while len(tapped) < 3 and time.monotonic() < deadline:
                snapshot = json.loads(self.run(["idb", "ui", "describe-all", "--nested"], 4))
                button = _permission_button(snapshot)
                if button:
                    frame = button["frame"]
                    x = round(frame["x"] + frame["width"] / 2)
                    y = round(frame["y"] + frame["height"] / 2)
                    self.run(["idb", "ui", "tap", str(x), str(y)], 4)
                    tapped.append(button["AXLabel"])
                time.sleep(0.3)
            return {"tapped": tapped}
        except (OSError, RuntimeError, ValueError, KeyError, subprocess.TimeoutExpired) as error:
            return {"tapped": tapped, "reason": str(error)}


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
        if not re.search(r"microphone|speech recognition", message):
            continue
        if not re.search(r"would like|wants to|allow|permission", message):
            continue
        for node in descendants:
            if node.get("type") == "Button" and node.get("AXLabel") in (
                    "Allow", "Allow Once", "OK", "Allow While Using App") and node.get("frame"):
                return node
    return None

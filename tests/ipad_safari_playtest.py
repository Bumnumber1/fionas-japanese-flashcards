"""Exercise the deployed dojo in Mobile Safari on the specified booted iPad Simulator."""
import json
import os
import atexit
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import subprocess
import threading
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from ipad_audio import NativeAudio


UDID = os.environ["IPAD_UDID"]
URL = os.environ["DOJO_URL"]
DRIVER = os.environ.get("SAFARIDRIVER_URL", "http://127.0.0.1:4444").rstrip("/")
OUT = Path("artifacts/ipad-safari")
OUT.mkdir(parents=True, exist_ok=True)
REPORT = {"native": {}, "controlled": {}, "passed": False}
ELEMENT = "element-6066-11e4-a52e-4f735466cecf"


def save(label):
    (OUT / "results.json").write_text(json.dumps(REPORT, indent=2), encoding="utf-8")
    print(label, flush=True)


screenshots = []


def screenshot(name):
    proc = subprocess.Popen(["xcrun", "simctl", "io", UDID, "screenshot", str(OUT / (name + ".png"))])
    screenshots.append(proc)


@atexit.register
def finish_screenshots():
    deadline = time.monotonic() + 12
    for proc in screenshots:
        try:
            proc.wait(timeout=max(0, deadline - time.monotonic()))
        except subprocess.TimeoutExpired:
            proc.kill()


def command(method, path, body=None, timeout=25):
    data = json.dumps(body).encode() if body is not None else None
    request = Request(DRIVER + path, method=method, data=data,
                      headers={"Content-Type": "application/json;charset=utf-8"})
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.load(response)["value"]
    except HTTPError as error:
        detail = json.load(error).get("value", {})
        raise RuntimeError(f"{method} {path.rsplit('/', 1)[-1]}: {detail.get('error')}: {detail.get('message','')[:300]}") from error


def wait_for(fn, label, timeout=15):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = fn()
        if result:
            return result
        time.sleep(.25)
    raise RuntimeError("Timed out waiting for " + label)


class Safari:
    def __enter__(self):
        value = command("POST", "/session", {"capabilities": {"alwaysMatch": {
            "browserName": "Safari", "platformName": "ios", "safari:useSimulator": True,
            "safari:deviceUDID": UDID, "pageLoadStrategy": "eager"}}}, timeout=110)
        self.path = "/session/" + value["sessionId"]
        caps = value["capabilities"]
        assert str(caps.get("platformName", "")).lower() in ("ios", "ipados"), caps
        assert caps.get("browserName", "").lower() == "safari", caps
        REPORT["webdriver"] = {k: caps[k] for k in ("platformName", "browserName", "browserVersion",
                                                   "safari:platformVersion", "safari:deviceName") if k in caps}
        self.call("POST", "/timeouts", {"pageLoad": 45000, "script": 15000})
        return self

    def call(self, method, path, data=None, timeout=25):
        return command(method, self.path + path, data, timeout=timeout)

    def __exit__(self, typ, value, tb):
        try:
            self.call("DELETE", "", timeout=15)
        except Exception as error:
            print("Session cleanup:", str(error)[:180], flush=True)

    def js(self, script, *args):
        return self.call("POST", "/execute/sync", {"script": script, "args": list(args)})

    def tap(self, selector):
        element = self.call("POST", "/element", {"using": "css selector", "value": selector})
        self.js("""
            const el=arguments[0]; el.scrollIntoView({block:'nearest'});
            window.dojoTapReceipt=null;
            el.addEventListener('click', e=>window.dojoTapReceipt={id:el.id,trusted:e.isTrusted}, {once:true,capture:true});
        """, element)
        seq = [{"type":"pointerMove", "origin": element, "x":0, "y":0, "duration":0},
               {"type":"pointerDown","button":0},{"type":"pause","duration":90},{"type":"pointerUp","button":0}]
        try:
            self.call("POST","/actions",{"actions":[{"type":"pointer","id":"finger",
                      "parameters":{"pointerType":"touch"},"actions":seq}]},timeout=25)
        except RuntimeError as error:
            print("Using WebDriver element click:", str(error)[:160], flush=True)
        receipt = self.js("return window.dojoTapReceipt")
        if not receipt:
            self.call("POST", f"/element/{element[ELEMENT]}/click", {}, timeout=25)
            receipt = self.js("return window.dojoTapReceipt")
        if not receipt and self.js("return !!window.dojoTestSpeech"):
            self.js("arguments[0].click()", element)
            receipt = self.js("return window.dojoTapReceipt")
        REPORT.setdefault("tapEvidence", []).append({"requested":selector,"receipt":receipt})

    def enter_game(self):
        self.call("POST", "/url", {"url": URL}, timeout=55)
        wait_for(lambda: self.js("return document.documentElement.dataset.dojoReady === 'true'"),
                 "published dojo controller", 35)
        if "lobbyStartVisible" not in REPORT:
            REPORT["lobbyStartVisible"] = self.visible("#start-button")
        self.js("""
            window.dojoTestEvents = [];
            for(const t of ['click','pointerdown','pointerup','error','unhandledrejection'])
              window.addEventListener(t,e => {
                if(dojoTestEvents.length<60) dojoTestEvents.push([t,e.target?.id||e.target?.nodeName||'',e.isTrusted,
                  e.message||String(e.reason||''), e.error?.stack?.slice(0,600)||'']);
              },true);
        """)
        def entered():
            return self.js("return !document.querySelector('#challenge-panel').hidden")
        self.tap("#start-button")
        if not entered():
            time.sleep(1)
        evidence = {"events": self.js("return dojoTestEvents"), "entered": entered()}
        REPORT.setdefault("matchEntry", []).append(evidence)
        save("Observed Safari match entry: "+json.dumps(evidence, ensure_ascii=False)[:1200])
        if not evidence["entered"]:
            # Continue probing the microphone even if WebDriver's touch missed.
            evidence["setupFallback"] = "DOM click for match entry"
            self.js("document.querySelector('#start-button').click()")
            time.sleep(.5)
            evidence["events"] = self.js("return dojoTestEvents")
            save("Observed match-entry fallback: "+json.dumps(evidence,ensure_ascii=False)[:1600])
        wait_for(entered, "first card")

    def visible(self, selector):
        return self.js("""
            const el=document.querySelector(arguments[0]), r=el.getBoundingClientRect();
            return r.width>0 && r.height>0 && r.left>=-1 && r.right<=innerWidth+1 &&
                   r.top>=-1 && r.bottom<=innerHeight+1;
        """, selector)

    def state(self):
        return self.js("""
            const b = document.querySelector('#handsfree-toggle');
            const save = JSON.parse(localStorage.getItem(DojoGame.SAVE_VERSION));
            const micReport = window.DojoMicDiagnostics?.getSavedReport();
            return {button:b.textContent, enabled:!b.disabled, on:b.getAttribute('aria-pressed')==='true',
                cue:document.querySelector('#voice-status').textContent,
                capture:document.querySelector('#mic-session-controls').dataset.captureState,
                fault:micReport?.snapshot?.errorCode||'', phase:save.phase,
                turns:save.fight.journal.length, card:save.question.id, kana:save.question.prompt,
                hp:save.fight.playerHp, opponent:save.fight.opponentHp,
                starts:window.dojoTestSpeech?.starts || 0};
        """)


def same_turn(a, b):
    assert all(a[key] == b[key] for key in ("card", "turns", "hp", "opponent")), (a, b)


def try_native_answers(driver, audio, state):
    attempts = REPORT["native"]["spokenAttempts"] = []
    if state["capture"] != "on" or not REPORT["native"]["audioSetup"].get("ok"):
        return state
    for _ in range(3):
        before = state
        attempt = {"kana": before["kana"], "injection": audio.inject(before["kana"])}
        attempts.append(attempt)
        if not attempt["injection"].get("ok"):
            break
        deadline = time.monotonic() + 9
        while time.monotonic() < deadline:
            state = driver.state()
            if state["turns"] != before["turns"] or not state["on"]:
                break
            time.sleep(.3)
        attempt.update(turnsBefore=before["turns"], turnsAfter=state["turns"], cue=state["cue"],
                       correctAttack=state["turns"] == before["turns"]+1 and state["opponent"] < before["opponent"])
        if not attempt["correctAttack"]:
            save("Native audio produced no verified correct attack for this card")
            break
        save("Native Japanese audio scored a correct attack in Mobile Safari")
        if len(attempts) < 3:
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                state = driver.state()
                if state["phase"] == "question" and state["capture"] == "on" and state["cue"].startswith("Listening"):
                    break
                time.sleep(.2)
            if state["phase"] != "question" or not state["cue"].startswith("Listening"):
                break
    return state


def native_probe(driver, audio):
    driver.enter_game()
    env = driver.js("""
        return {ua:navigator.userAgent,platform:navigator.platform,touch:navigator.maxTouchPoints,
          width:innerWidth,height:innerHeight,secure:isSecureContext,
          screenWidth:screen.width,screenHeight:screen.height,
          recognition:typeof (window.SpeechRecognition || window.webkitSpeechRecognition),
          tapHeight:document.querySelector('#handsfree-toggle').getBoundingClientRect().height};
    """)
    REPORT["native"]["environment"] = env
    REPORT["native"]["firstCardVisible"] = driver.visible("#question-glyph")
    REPORT["native"]["primaryVisible"] = driver.visible("#handsfree-toggle")
    assert env["touch"] > 0 and "Safari/" in env["ua"] and env["secure"], env
    assert env["tapHeight"] >= 44, env
    before = driver.state()
    screenshot("01-first-card")
    driver.tap("#pause-button")
    if driver.js("return document.querySelector('#pause-dialog').open"):
        driver.tap("#resume-button")
        closed = not driver.js("return document.querySelector('#pause-dialog').open")
        REPORT["native"]["pauseResumeVerified"] = closed
        if not closed:
            driver.js("document.querySelector('#resume-button').click()")
        same_turn(before, driver.state())
    else:
        REPORT["native"]["pauseResumeVerified"] = False
    save("Mobile Safari loaded the deployed reading card")
    native = REPORT["native"]
    native["states"] = []
    if not before["enabled"]:
        native["outcome"] = "microphone start disabled in this simulator"
        return
    try:
        # Safari can hold the WebDriver click until its native consent sheet closes.
        stop_watcher = threading.Event()
        with ThreadPoolExecutor(max_workers=1) as executor:
            approval = executor.submit(audio.allow_prompt, stop_watcher, (env["screenWidth"], env["screenHeight"]))
            try:
                try:
                    driver.tap("#handsfree-toggle")
                except (OSError, RuntimeError) as error:
                    native["startCommand"] = str(error)[:260]
                deadline = time.monotonic() + 94
                while True:
                    state = driver.state()
                    observation = {k: state[k] for k in ("cue", "capture", "fault", "on", "turns")}
                    if not native["states"] or observation != native["states"][-1]:
                        native["states"].append(observation)
                        save("Observed native capture " + state["capture"] + " / " + state["cue"])
                    if not state["on"] or state["capture"] == "on" or time.monotonic() >= deadline:
                        break
                    time.sleep(.4)
                stop_watcher.set()
                state = try_native_answers(driver, audio, state)
            finally:
                stop_watcher.set()
                native["permission"] = approval.result()
        screenshot("02-native-microphone")
        native["outcome"] = "native final observed" if state["turns"] > before["turns"] else (
            "native capture ready, no spoken answer verified" if state["capture"] == "on" else
            "native microphone did not become ready during observation")
        if state["on"] and state["capture"] == "on":
            current = wait_for(lambda: listening_card(driver), "next ready native card", 8)
            native["appSwitch"] = {}
            app_switch(driver, lambda: listening_card(driver), current, native["appSwitch"], already_on=True)
        elif state["on"]:
            driver.tap("#handsfree-toggle")
        if state["turns"] == before["turns"]:
            same_turn(before, driver.state())
    except (OSError, RuntimeError) as error:
        # The system's microphone prompt can prevent WebDriver from reaching the
        # page. Record this unverified path separately from controlled grading.
        native["outcome"] = "native interaction blocked"
        native["detail"] = str(error)[:380]
        screenshot("02-native-blocked")


FIXTURE = """
    const lab = window.dojoTestSpeech = {starts:0, instances:[]};
    class ControlledRecognition {
        constructor(){this.history=[]; lab.instances.push(this);}
        start(){
            lab.starts++; this.active=true;
            setTimeout(()=>{if(this.active){this.onstart?.();this.onaudiostart?.();}},80);
        }
        finish(){if(!this.active)return;this.active=false;this.onaudioend?.();this.onend?.();}
        abort(){setTimeout(()=>this.finish(),10);}
        stop(){setTimeout(()=>this.finish(),10);}
        final(word){
            this.history.push(Object.assign([{transcript:word,confidence:1}],{isFinal:true}));
            this.onresult?.({resultIndex:this.history.length-1,results:this.history});
        }
    }
    window.SpeechRecognition=window.webkitSpeechRecognition=ControlledRecognition;
"""


def listening_card(driver):
    state = driver.state()
    return state if state["on"] and state["phase"] == "question" and state["capture"] == "on" and state["cue"].startswith("Listening") else False


def app_switch(driver, ready, before, detail, already_on=False):
    if not already_on:
        driver.tap("#handsfree-toggle")
    active = wait_for(ready, "active session before switching apps")
    driver.js("""
        window.dojoObservedVisibility=[];
        document.addEventListener('visibilitychange',e => {
          dojoObservedVisibility.push({hidden:document.hidden,trusted:e.isTrusted});
        });
    """)
    try:
        for app in ("com.apple.Preferences", "com.apple.mobilesafari"):
            result = subprocess.run(["xcrun","simctl","launch",UDID,app], capture_output=True,
                                    timeout=20, text=True, check=False)
            if result.returncode:
                detail["result"] = "simulator could not launch " + app
                return
            time.sleep(1)
        events = driver.js("return window.dojoObservedVisibility || []")
        detail["visibilityEvents"] = events
        if not any(ev["hidden"] and ev["trusted"] for ev in events):
            detail["result"] = "Safari automation window did not report entering the background"
            return
        returned = driver.state()
        same_turn(before, returned)
        assert not returned["on"] and returned["capture"]=="off" and active["starts"]==returned["starts"], returned
        driver.tap("#handsfree-toggle")
        restarted = wait_for(ready, "first tap after app switching")
        same_turn(before, restarted)
        if not already_on:
            assert restarted["starts"]==active["starts"]+1, restarted
        driver.tap("#handsfree-toggle")
        detail["result"] = "real app switch stopped capture; one tap resumed the same card"
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
        detail["result"] = "Safari automation session could not verify app switching"
        detail["detail"] = str(error)[:260]


def controlled_game(driver):
    driver.enter_game()
    if driver.state()["enabled"]:
        driver.js(FIXTURE)
    else:
        # The game checks for a provider during initialization. If Safari did
        # not expose one, load the deployed HTML with a page-local test prelude.
        markup = driver.js("""
            const r=new XMLHttpRequest(); r.open('GET',location.href,false);r.send();
            if(r.status!==200)throw new Error('Could not load deployed HTML');
            return r.responseText;
        """)
        driver.js("""
            const source=arguments[0].replace('<head>', '<head><script>'+arguments[1]+'</script>');
            document.open();document.write(source);document.close();
        """, markup, FIXTURE)
        wait_for(lambda: driver.js("return document.documentElement.dataset.dojoReady==='true'"),
                 "controller initialized with controlled speech")
        driver.tap("#start-button")
    state = driver.state()
    assert state["turns"] == 0 and state["starts"] == 0, state
    driver.tap("#handsfree-toggle")
    ready = lambda: (lambda s: s if s["on"] and s["capture"] == "on" and s["cue"].startswith("Listening") else False)(driver.state())
    before = wait_for(ready, "first controlled listening cue")
    assert before["starts"] == 1, before
    result = REPORT["controlled"]
    result["finals"] = []
    for turn in range(1, 4):
        driver.js("dojoTestSpeech.instances.at(-1).final(arguments[0]);", before["kana"])
        def next_card():
            s = ready()
            return s if s and s["phase"] == "question" and s["turns"] == turn else False
        after = wait_for(next_card, f"next card after controlled final {turn}")
        assert after["hp"] == before["hp"] and after["opponent"] < before["opponent"], (before, after)
        assert after["starts"] == 1, after
        result["finals"].append({"turn": turn, "opponentEnergy": after["opponent"]})
        before = after
    save("Three controlled Japanese finals scored once each in one Safari session")
    driver.js("""
        const old=dojoTestSpeech.instances.at(-1);
        dojoTestSpeech.stale=old.onresult;
        old.onerror({error:'network'});old.finish();
    """)
    def retry():
        s = driver.state()
        return s if s["button"] == "Try microphone again" and not s["on"] else False
    failed = wait_for(retry, "child's retry button")
    same_turn(before, failed)
    driver.tap("#handsfree-toggle")
    recovered = wait_for(ready, "recovered card")
    assert recovered["starts"] == 2, recovered
    same_turn(before, recovered)
    driver.js("dojoTestSpeech.stale({resultIndex:0,results:[Object.assign([{transcript:arguments[0]}],{isFinal:true})]})", before["kana"])
    same_turn(before, driver.state())
    driver.js("dojoTestSpeech.instances.at(-1).final(arguments[0]);", before["kana"])
    def recovered_score():
        s = ready()
        return s if s and s["phase"]=="question" and s["turns"]==4 else False
    fourth = wait_for(recovered_score, "one recovered final")
    assert fourth["opponent"] < before["opponent"] and fourth["hp"] == before["hp"], fourth
    driver.tap("#handsfree-toggle")
    wait_for(lambda: driver.state()["capture"]=="off", "explicit microphone stop")
    time.sleep(.9)
    stopped = driver.state()
    same_turn(fourth, stopped)
    assert not stopped["on"] and stopped["starts"]==2, stopped
    result.update(retrySavedCard=True, staleFinalIgnored=True, recoveredFinalScored=True, explicitStop=True)
    screenshot("04-controlled-stop")
    save("Controlled failure, first-tap retry, late final rejection and explicit Stop passed")
    driver.tap("#hint-button")
    assert driver.js("return !document.querySelector('#hint-text').hidden")
    same_turn(stopped, driver.state())
    result["hintVisible"] = True
    result["appSwitch"] = {}
    app_switch(driver, ready, stopped, result["appSwitch"])
    save("iPad foreground/background observation: " + result["appSwitch"]["result"])


if __name__ == "__main__":
    try:
        devices = json.loads(subprocess.check_output(["xcrun", "simctl", "list", "devices", "--json"]))["devices"]
        runtime, device = next((r, d) for r, ds in devices.items() for d in ds if d["udid"] == UDID)
        assert device["state"]=="Booted" and "iPad" in device["deviceTypeIdentifier"], device
        REPORT["simulator"] = {"name": device["name"], "type": device["deviceTypeIdentifier"], "runtime": runtime}
        save("Testing " + device["name"] + " / " + runtime)
        audio = NativeAudio(UDID)
        REPORT["native"]["audioSetup"] = audio.prepare()
        save("Simulator audio setup attempted")
        try:
            with Safari() as driver:
                native_probe(driver, audio)
        except Exception as error:
            REPORT["native"]["outcome"] = "native playthrough interrupted"
            REPORT["native"]["detail"] = str(error)[:600]
        save("Native microphone probe: " + REPORT["native"]["outcome"])
        with Safari() as driver:
            controlled_game(driver)
        REPORT["passed"] = True
        save("iPad Safari playtest completed")
    except Exception as error:
        REPORT["failure"] = str(error)[:600]
        save("iPad Safari test failed: " + REPORT["failure"])
        screenshot("failure")
        raise

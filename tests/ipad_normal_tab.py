"""Play the checked-out dojo using native iPad taps in an ordinary Mobile Safari tab."""
import functools
import json
import os
from concurrent.futures import ThreadPoolExecutor
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import secrets
import subprocess
import threading
import time
from urllib.parse import urlsplit

from ipad_audio import NativeAudio, _nodes


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "artifacts/ipad-safari"
UDID = os.environ["IPAD_UDID"]
TOKEN = secrets.token_hex(16)
REPORT = {"test": "ordinary Mobile Safari, native recognition, loopback origin", "taps": [],
          "captureEvents": [], "nativeAnswers": [], "completed": False}
latest = {}

# The observer samples the game's existing controls, save and trusted input events.
# It never calls a game API, requests a microphone, changes controls, or emits speech.
OBSERVER = r"""
<script>
(() => {
  const ids = ['start-button','handsfree-toggle','pause-button','resume-button'];
  let serial = 0, lastTap = null, lastTouch = null;
  const errors = [];
  window.addEventListener('error', e => { if (errors.length<8) errors.push([e.message,e.error?.stack?.slice(0,600)]); });
  function observeInput(event) {
    if (!event.isTrusted) return;
    const pointer = event.changedTouches?.[0] || event;
    const previous = event.type === 'click' ? lastTap : lastTouch;
    const evidence = {number:(previous?.number || 0)+1,type:event.type,
      id:event.target.closest?.('button')?.id || '',x:pointer.clientX,y:pointer.clientY};
    if(event.type === 'click') lastTap=evidence; else lastTouch=evidence;
  }
  for(const type of ['touchstart','pointerdown','click'])
    document.addEventListener(type, observeInput, {capture:true,passive:true});
  function tick() {
    const el = id => document.getElementById(id);
    const viewport = window.visualViewport;
    const controls = {};
    for (const id of ids) {
      const button = el(id);
      if (!button || button.disabled || !button.getClientRects().length) continue;
      const r = button.getBoundingClientRect(), x = r.x+r.width/2, y = r.y+r.height/2;
      if (document.elementFromPoint(x,y)?.closest('button') === button)
        controls[id] = {x,y,label:button.textContent.trim()};
    }
    let saved, diagnostics;
    try { saved = JSON.parse(localStorage.getItem(window.DojoGame?.SAVE_VERSION)); } catch (_) {}
    try { diagnostics = JSON.parse(localStorage.getItem(window.DojoMicDiagnostics?.STORAGE_KEY)); } catch (_) {}
    const nativeEvents=(diagnostics?.events||[]).filter(e=>e.stage.startsWith('live-')).slice(-60)
      .map(e=>({ms:e.ms,stage:e.stage,...(e.code?{code:e.code}:{})}));
    const chrome = Math.max(0,screen.height-(viewport?.height||innerHeight));
    let neutral = null;
    // An initial native touch on this corridor cannot hit a link or form control
    // anywhere between the fully expanded and collapsed Safari toolbar positions.
    for (let y = chrome+28; !neutral && y < innerHeight-chrome-28; y += 24) {
      for (const x of [innerWidth*.50,innerWidth*.30,innerWidth*.70]) {
        let safe = true;
        for (let dy = -chrome-12; dy <= 12; dy += 3) {
          const node = document.elementFromPoint(x,y+dy);
          if (!node?.closest('main, dialog[open]') ||
              node.closest('button,a,input,select,textarea,summary,[role=button],#writing-canvas')) {
            safe = false; break;
          }
        }
        if (safe) {neutral={x,y};break;}
      }
    }
    const state = {serial:++serial,ready:document.documentElement.dataset.dojoReady==='true',
      ua:navigator.userAgent,touchPoints:navigator.maxTouchPoints,provider:typeof(window.SpeechRecognition||window.webkitSpeechRecognition),
      secure:isSecureContext,controls,neutral,lastTap,lastTouch,scale:viewport?.scale||1,
      screenWidth:screen.width,screenHeight:screen.height,viewportHeight:viewport?.height||innerHeight,
      pause:el('pause-dialog')?.open,cue:el('voice-status')?.textContent,
      mic:el('mic-session-controls')?.dataset.captureState,on:el('handsfree-toggle')?.getAttribute('aria-pressed')==='true',
      fault:diagnostics?.errorCode||window.DojoMicDiagnostics?.getSavedReport()?.snapshot?.errorCode||'',
      build:diagnostics?.build,nativeEvents,timeMs:Math.round(performance.now()),
      errors,phase:saved?.phase,card:saved?.question?.id,kana:saved?.question?.prompt,
      turns:saved?.fight?.journal?.length,hp:saved?.fight?.playerHp,opponent:saved?.fight?.opponentHp};
    fetch('/__observe/__TOKEN__',{method:'POST',body:JSON.stringify(state)}).catch(()=>{});
  }
  setInterval(tick,400);
})()
</script>"""


class ObserverServer(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        if urlsplit(self.path).path != "/taekwondo.html":
            return super().do_GET()
        html = (ROOT / "taekwondo.html").read_text(encoding="utf-8")
        body = html.replace("</body>", OBSERVER.replace("__TOKEN__", TOKEN) + "</body>").encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        global latest
        n = int(self.headers.get("Content-Length") or 0)
        if self.path != "/__observe/" + TOKEN or not 0 < n < 15000:
            self.send_error(404)
            return
        state = json.loads(self.rfile.read(n))
        if state["serial"] > latest.get("serial", 0):
            latest = state
            if state.get("errors"):
                REPORT["pageErrors"] = state["errors"]
            evidence = REPORT.setdefault("nativeEvents", [])
            for event in state.get("nativeEvents", []):
                if event not in evidence:
                    evidence.append(event)
            summary = {k:state.get(k) for k in ("mic","cue","fault","on","turns")}
            events = REPORT["captureEvents"]
            if not events or any(events[-1].get(k) != v for k,v in summary.items()):
                events.append({**summary, "timeMs": state.get("timeMs")})
        self.send_response(204)
        self.end_headers()


def save(message):
    OUTPUT.mkdir(exist_ok=True, parents=True)
    (OUTPUT / "normal-tab.json").write_text(json.dumps(REPORT, indent=2, ensure_ascii=False), encoding="utf-8")
    print(message, flush=True)


def wait_for(predicate, label, timeout=20):
    end = time.monotonic()+timeout
    while time.monotonic() < end:
        s = latest
        if s and predicate(s):
            return s
        time.sleep(.15)
    raise RuntimeError("No observation of " + label)


class Touch:
    def __init__(self, audio):
        self.audio = audio
        self.offset = None
        self.viewport_height = None

    def send(self, x, y, kind):
        previous = (latest.get(kind) or {}).get("number", 0)
        item = {"point":[round(x),round(y)],"await":kind}
        REPORT.setdefault("nativeInput",[]).append(item)
        proc = subprocess.Popen(["idb","ui","tap",str(round(x)),str(round(y))],
                                env=self.audio.env, stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,text=True)
        try:
            def received(state):
                if proc.poll() not in (None,0):
                    raise RuntimeError("idb tap exited " + str(proc.returncode) + ": " + proc.stderr.read()[-500:])
                return (state.get(kind) or {}).get("number",0)>previous
            event = wait_for(received, "trusted "+kind, 23)[kind]
            item["received"] = event
            self.offset = (x-event["x"], y-event["y"])
            self.viewport_height = latest["viewportHeight"]
            return event
        finally:
            try:
                _, stderr=proc.communicate(timeout=2)
            except subprocess.TimeoutExpired:
                proc.kill()
                _, stderr=proc.communicate()
            item.update(exit=proc.returncode,stderr=stderr[-500:],lastTouch=latest.get("lastTouch"))

    def ax_point(self, control, label):
        status = {"requested":control}
        REPORT.setdefault("accessibility",[]).append(status)
        try:
            tree = json.loads(self.audio.run(["idb","ui","describe-all","--nested"],40))
            nodes=list(_nodes(tree))
            buttons=[n for n in nodes if n.get("type")=="Button" and n.get("frame")]
            status.update(elements=len(nodes),buttons=[n.get("AXLabel","") for n in buttons][:60])
            def clean(s):
                return (s or "").strip(" →←›●■").casefold()
            for n in buttons:
                if n.get("AXIdentifier")==control or clean(n.get("AXLabel"))==clean(label):
                    f=n["frame"]
                    if f.get("width",0)>0 and f.get("height",0)>0:
                        return f["x"]+f["width"]/2,f["y"]+f["height"]/2
        except (OSError,ValueError,RuntimeError,subprocess.TimeoutExpired) as error:
            status["error"]=str(error)[:500]
        return None

    def tap(self, control):
        state = wait_for(lambda s:control in s["controls"], "visible " + control)
        point = state["controls"][control]
        if self.offset is None or abs(state["viewportHeight"]-self.viewport_height)>1:
            if abs(state["scale"]-1)>.01:
                raise RuntimeError("Native screen calibration requires a 1x viewport")
            point_on_screen = self.ax_point(control, point["label"])
            if point_on_screen:
                self.offset = (point_on_screen[0]-point["x"],point_on_screen[1]-point["y"])
            else:
                neutral = latest.get("neutral")
                if not neutral:
                    raise RuntimeError("No safe coordinate calibration or accessible button for " + control)
                for attempt in range(2):
                    try:
                        event=self.send(neutral["x"],neutral["y"],"lastTouch")
                        break
                    except RuntimeError:
                        if attempt:
                            raise
                if event["id"]:
                    raise RuntimeError("Expected a neutral touch during screen calibration")
        state = wait_for(lambda s:control in s["controls"], control)
        point = state["controls"][control]
        event = self.send(point["x"]+self.offset[0],point["y"]+self.offset[1],"lastTap")
        if event["id"] != control:
            raise RuntimeError(f"Expected {control}; trusted click reached {event['id']!r}")
        REPORT["taps"].append(control)


def turn(state):
    return [state.get(key) for key in ("card","turns","hp","opponent")]


def listening(state):
    return (state.get("phase")=="question" and state["on"] and state["mic"]=="on" and
            state["cue"].startswith("Listening") and state.get("kana"))


def retry_button(state):
    return not state["on"] and state["controls"].get("handsfree-toggle",{}).get("label","").startswith("Try")


def play_native_cards(audio, state):
    answers=REPORT["nativeAnswers"]
    for _ in range(3):
        before=state
        answer={"card":before["card"], "kana":before["kana"], "before":turn(before)}
        answers.append(answer)
        answer["injection"]=audio.inject(before["kana"])
        if not answer["injection"].get("ok"):
            break
        try:
            state=wait_for(lambda s:s["turns"]>before["turns"] or retry_button(s),
                           "a native graded answer or retry", 14)
        except RuntimeError:
            state=latest
        answer["after"]=turn(state)
        if state["turns"]==before["turns"]:
            assert turn(before)==turn(state), (turn(before),turn(state))
            answer["outcome"]="no graded response; same card and energy"
            break
        correct=(state["turns"]==before["turns"]+1 and state["opponent"]<before["opponent"]
                 and state["hp"]==before["hp"])
        answer["outcome"]="correct" if correct else "graded without a correct attack"
        save("Native Japanese audio graded: "+answer["outcome"])
        if not correct or len(answers)==3:
            break
        try:
            state=wait_for(lambda s:s["turns"]==before["turns"]+1 and listening(s),
                           "next card ready for Japanese audio", 12)
        except RuntimeError:
            REPORT["nextCardCue"]=latest.get("cue")
            break
    return answers


def main():
    audio = NativeAudio(UDID)
    REPORT["audioSetup"] = audio.prepare()
    server = ThreadingHTTPServer(("127.0.0.1",0), functools.partial(ObserverServer,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}/taekwondo.html"
    subprocess.Popen(["xcrun","simctl","openurl",UDID,url])
    state = wait_for(lambda s:s["ready"], "ordinary Safari loading the dojo", 120)
    REPORT["environment"] = {k:state[k] for k in ("ua","screenWidth","screenHeight","touchPoints","secure","provider")}
    assert state["touchPoints"]>0 and "Safari/" in state["ua"] and state["secure"], REPORT["environment"]
    device_list=json.loads(subprocess.check_output(["xcrun","simctl","list","devices","--json"]))["devices"]
    runtime,device=next((r,d) for r,ds in device_list.items() for d in ds if d["udid"]==UDID)
    assert "iPad" in device["deviceTypeIdentifier"] and device["state"]=="Booted", device
    REPORT["device"]={"model":device["name"],"runtime":runtime}
    save("Ordinary iPad Safari loaded the local dojo")
    touch = Touch(audio)
    touch.tap("start-button")
    card = wait_for(lambda s:s.get("phase")=="question" and s.get("card"),"first reading card")
    touch.tap("pause-button")
    wait_for(lambda s:s["pause"],"pause dialog")
    touch.tap("resume-button")
    assert turn(card)==turn(wait_for(lambda s:not s["pause"],"resumed card"))
    REPORT["pauseResume"]=True
    save("Start, Pause and Resume verified by trusted native clicks")
    if not state["provider"] or state["provider"]=="undefined":
        raise RuntimeError("Ordinary Safari did not expose a speech recognition provider")
    for attempt in range(2):
        card=latest
        if attempt and not retry_button(card):
            break
        stop_monitor=threading.Event()
        delay=int(os.environ.get("IPAD_CONSENT_DELAY","20")) if not attempt else 0
        starts=lambda:sum(e["stage"]=="live-request" for e in REPORT.get("nativeEvents",[]))
        baseline=starts()
        with ThreadPoolExecutor(max_workers=1) as pool:
            touch.tap("handsfree-toggle")
            permission=pool.submit(audio.allow_prompt,stop_monitor,(card["screenWidth"],card["screenHeight"]),
                                   delay_first=delay)
            try:
                state=wait_for(lambda s:s["serial"]>card["serial"] and (listening(s) or retry_button(s)),
                               "native readiness or retry cue",90)
                stop_monitor.set()
                save("Trusted microphone tap observed: "+state["cue"])
                if listening(state):
                    if REPORT["audioSetup"].get("ok"):
                        play_native_cards(audio,state)
                    if latest["on"]:
                        touch.tap("handsfree-toggle")
                    # Persistence of the built-in diagnostics is debounced.
                    time.sleep(.8)
                    attempts=REPORT["nativeAnswers"]
                    correct=sum(a.get("outcome")=="correct" for a in attempts)
                    REPORT["nativeReading"]={"correct":correct,"nativeRequests":starts()-baseline,
                                              "threeOnOneStream":correct==3 and starts()-baseline==1}
                    break
            finally:
                stop_monitor.set()
                REPORT.setdefault("permissions",[]).append(permission.result())
        assert turn(state)==turn(card), (turn(card),turn(state))
        REPORT["retryKeptCard"]=True
    REPORT["completed"]=True
    save("Finished ordinary-tab microphone playtest")


if __name__=="__main__":
    try:
        main()
    except Exception as error:
        REPORT["failure"]=str(error)[:500]
        save("Ordinary-tab playtest stopped: "+REPORT["failure"])
        raise
    finally:
        try:
            subprocess.run(["xcrun","simctl","io",UDID,"screenshot",str(OUTPUT/"normal-tab.png")],
                           timeout=30,check=False)
        except (OSError,subprocess.TimeoutExpired):
            pass

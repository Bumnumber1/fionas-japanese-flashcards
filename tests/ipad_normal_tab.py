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
  let serial = 0, lastTap = null, eventCount = 0;
  document.addEventListener('click', event => {
    if (event.isTrusted) {
      lastTap = {number: ++eventCount, id: event.target.closest?.('button')?.id || '',
                 x:event.clientX, y:event.clientY};
    }
  }, true);
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
    let saved;
    try { saved = JSON.parse(localStorage.getItem(window.DojoGame?.SAVE_VERSION)); } catch (_) {}
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
      secure:isSecureContext,controls,neutral,lastTap,scale:viewport?.scale||1,
      screenWidth:screen.width,screenHeight:screen.height,viewportHeight:viewport?.height||innerHeight,
      pause:el('pause-dialog')?.open,cue:el('voice-status')?.textContent,
      mic:el('mic-session-controls')?.dataset.captureState,on:el('handsfree-toggle')?.getAttribute('aria-pressed')==='true',
      fault:window.DojoMicDiagnostics?.getSavedReport()?.snapshot?.errorCode||'',
      phase:saved?.phase,card:saved?.question?.id,kana:saved?.question?.prompt,
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
            summary = {k:state.get(k) for k in ("mic","cue","fault","on","turns")}
            events = REPORT["captureEvents"]
            if not events or events[-1] != summary:
                events.append(summary)
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

    def send(self, x, y, previous):
        # The native command may finish after the actual touch. The browser's
        # subsequent trusted click is the authoritative delivery receipt.
        proc = subprocess.Popen(["idb","ui","tap",str(round(x)),str(round(y))],
                                env=self.audio.env, stdout=subprocess.DEVNULL)
        try:
            event = wait_for(lambda s:(s.get("lastTap") or {}).get("number",0)>previous, "trusted tap", 25)["lastTap"]
            self.offset = (x-event["x"], y-event["y"])
            self.viewport_height = latest["viewportHeight"]
            return event
        finally:
            if proc.poll() is None:
                try:
                    proc.wait(timeout=1)
                except subprocess.TimeoutExpired:
                    proc.terminate()

    def tap(self, control):
        state = wait_for(lambda s:control in s["controls"], "visible " + control)
        point = state["controls"][control]
        count = (state.get("lastTap") or {}).get("number", 0)
        if self.offset is None or abs(state["viewportHeight"]-self.viewport_height)>1:
            if abs(state["scale"]-1)>.01:
                raise RuntimeError("Native screen calibration requires a 1x viewport")
            neutral = state.get("neutral")
            if neutral:
                event = self.send(neutral["x"],neutral["y"],count)
                if event["id"]:
                    raise RuntimeError("Expected a neutral touch during screen calibration")
                count = event["number"]
            else:
                tree = json.loads(self.audio.run(["idb","ui","describe-all","--nested"],15))
                node = next((n for n in _nodes(tree) if n.get("type")=="Button" and
                             n.get("AXLabel","").strip()==point["label"] and n.get("frame")), None)
                if not node:
                    raise RuntimeError("No safe coordinate calibration or accessible button for " + control)
                frame = node["frame"]
                self.offset = (frame["x"]+frame["width"]/2-point["x"],frame["y"]+frame["height"]/2-point["y"])
        state = wait_for(lambda s:control in s["controls"], control)
        point = state["controls"][control]
        event = self.send(point["x"]+self.offset[0],point["y"]+self.offset[1],count)
        if event["id"] != control:
            raise RuntimeError(f"Expected {control}; trusted click reached {event['id']!r}")
        REPORT["taps"].append(control)


def turn(state):
    return [state.get(key) for key in ("card","turns","hp","opponent")]


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
        if attempt and not card["controls"].get("handsfree-toggle",{}).get("label","").startswith("Try"):
            break
        before = card["serial"]
        with ThreadPoolExecutor(max_workers=1) as pool:
            permission = pool.submit(audio.allow_prompt)
            touch.tap("handsfree-toggle")
            REPORT.setdefault("permissions",[]).append(permission.result())
        state=wait_for(lambda s:s["serial"]>before and (s["mic"]=="on" or
                   not s["on"] and s["controls"].get("handsfree-toggle",{}).get("label","").startswith("Try")),
                   "native readiness or retry cue",35)
        save("Trusted microphone tap observed: "+state["cue"])
        if state["mic"]=="on":
            if REPORT["audioSetup"].get("ok"):
                injected=audio.inject(state["kana"])
                record={"kana":state["kana"],"injection":injected}
                REPORT["nativeAnswers"].append(record)
                if injected.get("ok"):
                    try:
                        after=wait_for(lambda s:s["turns"]>state["turns"],"a native graded answer",12)
                        record["correct"]=after["opponent"]<state["opponent"] and after["hp"]==state["hp"]
                    except RuntimeError:
                        record["correct"]=False
            if latest["on"]:
                touch.tap("handsfree-toggle")
            break
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

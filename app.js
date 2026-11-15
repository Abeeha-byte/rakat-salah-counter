import { PRAYERS, classify, Tracker } from './salah.js';
const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const $ = s => document.querySelector(s), app = $('#app'), v = $('#v');
const S = { theme: localStorage.theme || 'light', voice: localStorage.voice !== 'off' };
const POS = { QIYAM: 'Standing', RUKU: 'Ruku', SIT: 'Sitting', SUJOOD: 'Sujood', unknown: '—' };
let prayer = 'Fajr', stream, pl, wl, tr, raf, last = 0, running = false, lastWarn = 0;
const setTheme = t => { S.theme = localStorage.theme = t; document.documentElement.dataset.theme = t; };
setTheme(S.theme);
const head = (right = '<button class="ghost" id="gear" aria-label="Settings">⚙</button>') => `<div class="top"><h1><span class="gold">☾</span> RAKAT</h1>${right}</div>`;

function home() {
  app.className = ''; v.className = 'hid';
  app.innerHTML = `${head()}<p class="sub">Pray naturally. Your phone quietly keeps count.</p><div>
  ${Object.entries(PRAYERS).map(([p, n]) => `<button class="opt" data-p="${p}" aria-pressed="${p === prayer}"><span>${p}</span><span class="sub">${n} rakats</span></button>`).join('')}</div>
  <button class="btn" id="go">START</button>`;
  app.querySelectorAll('.opt').forEach(b => b.onclick = () => { prayer = b.dataset.p; home(); });
  $('#go').onclick = check; $('#gear').onclick = settings;
}

function settings() {
  app.innerHTML = `${head('<button class="ghost" id="x">Close</button>')}
  <div class="row"><span>Theme</span><button id="th" class="ghost">${S.theme}</button></div>
  <div class="row"><span>Voice warnings</span><button id="vo" class="ghost">${S.voice ? 'on' : 'off'}</button></div>
  <p class="small"><b>Camera &amp; privacy.</b> The camera only runs during a session you start. Pose detection runs on your device; video is never recorded, stored or uploaded, and there is no account. The pose model and its runtime are downloaded once from public CDNs. To grant access, allow Camera in your browser's site settings. Stopping a session releases the camera immediately.</p>
  <p class="small">Language: English only for now.</p>`;
  $('#x').onclick = home; $('#th').onclick = () => { setTheme(S.theme === 'light' ? 'dark' : 'light'); settings(); };
  $('#vo').onclick = () => { S.voice = !S.voice; localStorage.voice = S.voice ? 'on' : 'off'; settings(); };
}

async function loadPose() {
  if (pl) return;
  const { PoseLandmarker, FilesetResolver } = await import(`${CDN}/vision_bundle.mjs`);
  const fs = await FilesetResolver.forVisionTasks(`${CDN}/wasm`);
  const mk = d => PoseLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: MODEL, delegate: d }, runningMode: 'VIDEO', numPoses: 1 });
  try { pl = await mk('GPU'); } catch { pl = await mk('CPU'); }
}
function stopCamera() { cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop()); stream = null; v.srcObject = null; }
function loop(cb) {
  const f = () => { raf = requestAnimationFrame(f); const n = performance.now();
    if (n - last < 90 || v.readyState < 2) return; last = n;
    const lm = pl.detectForVideo(v, n).landmarks[0]; cb(n, lm ? classify(lm) : { pos: 'unknown', vis: 0 }); };
  raf = requestAnimationFrame(f);
}

async function check() {
  app.className = '';
  if (!navigator.mediaDevices?.getUserMedia) return fail('This browser cannot access the camera. Try a current Chrome, Edge, Safari or Firefox over HTTPS.');
  app.innerHTML = `${head('<button class="ghost" id="back">Back</button>')}<p class="sub">Loading detection model…</p>`;
  $('#back').onclick = () => { stopCamera(); home(); };
  try {
    await loadPose();
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false });
  } catch (e) { return fail(e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow Camera for this site in your browser settings, then try again.' : 'Could not start detection: ' + e.message); }
  v.srcObject = stream; await v.play();
  app.innerHTML = `${head('<button class="ghost" id="back">Back</button>')}
  <p class="sub">Place the device a few metres away, propped up, so you appear <b>from the side</b> with your whole body in frame.</p>
  <div id="slot"></div><p><span class="dot" id="d"></span><span id="st">Looking for you…</span></p>
  <p class="small" id="wlmsg">${'wakeLock' in navigator ? 'Screen will be kept awake during the session.' : '⚠ This browser cannot keep the screen awake. Turn off auto-lock in device settings before starting.'}</p>
  <button class="btn" id="go" disabled>START SALAH — ${prayer.toUpperCase()}</button>`;
  $('#slot').replaceWith(v); v.className = '';
  let ok = 0;
  $('#back').onclick = () => { stopCamera(); v.className = 'hid'; document.body.append(v); home(); };
  loop((n, o) => { ok = o.vis >= 0.6 ? Math.min(ok + 1, 10) : 0; const good = ok >= 8;
    $('#d').className = 'dot ' + (good ? 'ok' : 'bad'); $('#go').disabled = !good;
    $('#st').textContent = good ? 'Full body visible — ready' : o.vis > 0 ? 'Move back / show full body from the side' : 'Looking for you…'; });
  $('#go').onclick = start;
}

const speak = () => { if (!S.voice || performance.now() - lastWarn < 20000) return; lastWarn = performance.now();
  const u = new SpeechSynthesisUtterance('Please check your Rakat count.'); u.volume = .6; u.rate = .85; speechSynthesis.speak(u); };
async function lock() { try { wl = await navigator.wakeLock.request('screen'); } catch { $('#wl') && ($('#wl').textContent = 'Screen could not be kept awake — check auto-lock settings.'); } }
document.addEventListener('visibilitychange', () => { if (running && document.visibilityState === 'visible' && 'wakeLock' in navigator) lock(); });

function start() {
  if (S.voice && 'speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance('')); // unlock audio while the user taps Start
  document.body.append(v); v.className = 'hid'; running = true; lastWarn = -1e5;
  tr = new Tracker(PRAYERS[prayer], speak);
  if ('wakeLock' in navigator) lock();
  app.className = 'session'; app.style.background = '';
  app.innerHTML = `<div class="sub">${prayer}</div><div class="big" id="r">0</div><div class="sub" id="of">of ${tr.expected} rakats</div>
  <div>Sujood <b id="s">0</b></div><div id="p">—</div><div class="small"><span class="dot" id="d"></span><span id="c">Waiting…</span></div>
  <div class="small" id="wl">${'wakeLock' in navigator ? '' : 'Screen keep-awake unsupported on this browser.'}</div><button class="ghost" id="end">End session</button>`;
  $('#end').onclick = finish;
  loop((n, o) => { tr.push(n, o); if (tr.done) return finish();
    $('#r').textContent = tr.rakats; $('#s').textContent = tr.sujoods; $('#p').textContent = POS[tr.cur] || '—';
    const st = tr.status; $('#d').className = 'dot ' + (st === 'tracking' ? 'ok' : 'bad');
    $('#c').textContent = st === 'tracking' ? 'Tracking' : st === 'lost' ? 'Cannot see you — count may be uncertain' : 'Waiting…'; });
}

function finish() {
  running = false; stopCamera(); wl?.release().catch(() => {}); wl = null; app.className = ''; const s = tr.summary();
  app.innerHTML = `${head('')}<div><div class="row"><span>Prayer</span><span>${prayer}</span></div>
  <div class="row"><span>Detected rakats</span><span>${s.rakats} / ${s.expected}</span></div>
  <div class="row"><span>Detected sujoods</span><span>${s.sujoods} / ${s.expected * 2}</span></div></div>
  ${s.issues.length ? `<div><b>Possible discrepancies</b><ul>${s.issues.map(i => `<li>${i}</li>`).join('')}</ul></div>` : ''}
  ${s.uncertain.length ? `<div><b>Uncertain</b><ul>${s.uncertain.map(i => `<li>${i}</li>`).join('')}</ul><p class="small">The camera could not confirm these; it does not mean they didn't happen.</p></div>` : ''}
  <p class="small">AI-assisted counting aid only. It is not a religious authority and does not validate your Salah.</p><button class="btn" id="h">DONE</button>`;
  $('#h').onclick = home;
}
function fail(m) { stopCamera(); app.innerHTML = `${head('')}<p>${m}</p><button class="btn" id="h">Back</button>`; $('#h').onclick = home; }

home();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

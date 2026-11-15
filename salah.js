// Pure logic: posture classification + sequence tracking. No DOM, testable in Node.
export const PRAYERS = { Fajr: 2, Dhuhr: 4, Asr: 4, Maghrib: 3, Isha: 4 }; // obligatory rakats
const deg = (a, b) => Math.atan2(Math.abs(b.x - a.x), b.y - a.y) * 180 / Math.PI; // angle from straight-down
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Expects MediaPipe landmarks from a SIDE view. Uses whichever body side is more visible.
export function classify(lm) {
  const sides = [[11, 23, 25, 27], [12, 24, 26, 28]].map(ix => ({
    p: ix.map(i => lm[i]), v: ix.reduce((s, i) => s + (lm[i].visibility ?? 0), 0) / 4 }));
  const s = sides.sort((a, b) => b.v - a.v)[0];
  if (s.v < 0.5) return { pos: 'unknown', vis: s.v };
  const [sh, hip, kn, an] = s.p, nose = lm[0];
  const torso = deg(sh, hip), shank = deg(kn, an), L = dist(sh, hip) || 1;
  let pos = 'unknown';
  if (shank < 35) { if (torso < 25) pos = 'QIYAM'; else if (torso >= 50 && torso <= 120) pos = 'RUKU'; }
  else if (shank >= 50) {
    if (torso < 40) pos = 'SIT';
    else if (torso >= 45 && nose.y >= sh.y - 0.05 * L) pos = 'SUJOOD';
  }
  return { pos, vis: s.v };
}

const MIN_HOLD = 350, LOST_MS = 2000, FINISH_MS = 15000;
export class Tracker {
  constructor(expected, onWarn = () => {}) {
    Object.assign(this, { expected, onWarn, rakats: 0, sujoods: 0, cur: null, cand: null, candT: 0,
      lostSince: null, lost: false, dirty: false, stood: true, lastDone: null, done: false,
      issues: [], uncertain: [], log: [] });
    this.r = { ruku: 0, sujood: 0 };
  }
  get status() { return this.lost ? 'lost' : this.cur ? 'tracking' : 'waiting'; }
  push(t, o) {
    if (this.done) return;
    if (this.rakats >= this.expected && this.lastDone != null && t - this.lastDone > FINISH_MS && this.cur !== 'SUJOOD') { this.done = true; return; }
    if (o.vis < 0.5) {
      this.lostSince ??= t;
      if (!this.lost && t - this.lostSince > LOST_MS) { this.lost = true; this.dirty = true; this.unsure(`Tracking lost during Rakat ${this.rakats + 1}`); }
      return;
    }
    this.lostSince = null;
    if (o.pos === 'unknown') return;
    if (o.pos !== this.cand) { this.cand = o.pos; this.candT = t; return; }
    if (t - this.candT >= MIN_HOLD && o.pos !== this.cur) { this.lost = false; this.enter(o.pos, t, o.vis); }
  }
  unsure(m) { if (!this.uncertain.includes(m)) this.uncertain.push(m); }
  flag(m, t, sure) {
    const high = sure && !this.dirty;
    this.issues.push(m); if (high) this.onWarn(m, t); else this.unsure(m + ' (low confidence)');
  }
  enter(pos, t, vis) {
    const prev = this.cur, r = this.r; this.cur = pos; this.log.push(pos);
    const final = this.rakats >= this.expected;
    if (pos === 'RUKU') r.ruku++;
    if (pos === 'QIYAM') {
      if (prev === 'SIT' && r.sujood === 1) { this.flag(`Rakat ${this.rakats + 1}: second sujood not observed`, t, vis >= 0.65); this.complete(t); }
      else if (prev === 'SUJOOD' && r.sujood === 1) { this.unsure(`Rakat ${this.rakats + 1}: sujoods may have merged`); this.complete(t); }
      else if (prev === 'SUJOOD' && r.sujood === 2) this.complete(t);
      else if (prev === 'SIT' && r.sujood === 2) this.complete(t);
      this.stood = true;
    }
    if (pos === 'SIT' && prev === 'SUJOOD' && r.sujood === 2) this.complete(t);
    if (pos === 'SUJOOD') {
      this.sujoods++; r.sujood++;
      if (!this.stood && prev === 'SIT' && r.sujood === 1) {
        if (final) this.unsure('Extra sujood after final Rakat (may be sujood as-sahw)');
        else this.flag('Sujood sequence repeated without standing', t, vis >= 0.65);
      }
      if (r.sujood === 1 && r.ruku === 0 && this.stood) this.unsure(`Rakat ${this.rakats + 1}: ruku not observed`);
    }
  }
  complete(t) {
    this.rakats++; this.lastDone = t; this.r = { ruku: 0, sujood: 0 }; this.dirty = false;
    this.stood = this.rakats >= this.expected ? true : false;
    if (this.rakats > this.expected) this.flag('Detected more Rakats than expected', t, true);
  }
  summary() { return { rakats: this.rakats, sujoods: this.sujoods, expected: this.expected, issues: this.issues, uncertain: this.uncertain }; }
}

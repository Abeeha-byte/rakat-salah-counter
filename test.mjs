import { Tracker, PRAYERS } from './salah.js';
import assert from 'node:assert';
function run(exp, seq, vis = 0.9) { let warns = []; const tr = new Tracker(exp, m => warns.push(m)); let t = 0;
  for (const [pos, sec, v = vis] of seq) for (let i = 0; i < sec * 10; i++) { tr.push(t, { pos, vis: v }); t += 100; }
  return { tr, warns }; }
const rk = (first) => [['QIYAM', 1.5], ['RUKU', 1], ['QIYAM', 1], ['SUJOOD', 1.5], ['SIT', 1], ['SUJOOD', 1.5], [first, 1.5]];
for (const [p, n] of Object.entries(PRAYERS)) {
  const seq = []; for (let i = 1; i <= n; i++) seq.push(...rk(i === n || i % 2 === 0 ? 'SIT' : 'QIYAM'));
  seq.push(['SIT', 20]);
  const { tr, warns } = run(n, seq);
  assert.equal(tr.rakats, n, p); assert.equal(tr.sujoods, 2 * n, p); assert.equal(warns.length, 0, p); assert(tr.done, p + ' autofinish');
  console.log('ok', p, tr.summary().rakats, 'rakats', tr.summary().sujoods, 'sujoods');
}
// missing second sujood, clean tracking -> warns once
let { warns } = run(2, [['QIYAM', 1.5], ['RUKU', 1], ['QIYAM', 1], ['SUJOOD', 1.5], ['SIT', 1], ['QIYAM', 1.5]]); assert.equal(warns.length, 1); console.log('ok missing sujood warns');
// same but camera lost mid-rakat -> no speech, uncertain only
({ warns } = run(2, [['QIYAM', 1.5], ['RUKU', 1], ['QIYAM', 1], ['SUJOOD', 1.5], ['SIT', 0.5, 0.2], ['SIT', 3, 0.2], ['SIT', 1], ['QIYAM', 1.5]])); assert.equal(warns.length, 0); console.log('ok lost tracking -> no warning');
// extra rakat in a 2-rakat prayer
({ warns } = run(2, [...rk('QIYAM'), ...rk('QIYAM'), ...rk('SIT')])); assert(warns.length >= 1); console.log('ok extra rakat warns');

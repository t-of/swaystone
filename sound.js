// 効果音。音声ファイルは使わず Web Audio で作る。設定は 'swaystone.sound' に覚える。
import { migrateKey } from './logic.js';
const KEY = 'swaystone.sound';
migrateKey(null, 'yurazumi.sound', KEY);  // 旧名「ゆらづみ」からの引き継ぎ

// iPhone のマナーモードでも鳴らす（Safari 16.4 以降）。
// 'playback' にすると音楽アプリの曲が止まるので、アプリの音がオンのときだけにする。
function setAudioSession(soundOn) {
  try { if (navigator.audioSession) navigator.audioSession.type = soundOn ? 'playback' : 'auto'; } catch { /* 対応していない */ }
}

let on = true;
try { on = localStorage.getItem(KEY) !== '0'; } catch { /* 読めなければオン */ }
setAudioSession(on);

let ctx = null, master = null, noise = null;
const last = {};   // 同じ音が続けて重ならないように、最後に鳴らした時刻

// 触ったときに呼ぶ（ブラウザは触る前の音を止めるので、ここで AudioContext を作る・起こす）
export function unlock() {
  if (!on) return;
  setAudioSession(true);
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export const isOn = () => on;
export function setOn(v) {
  on = v;
  try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* 保存できなくても鳴る */ }
  setAudioSession(v);
  if (v) unlock();
}

// name ごとに gap 秒あけないと鳴らさない
function ready(name, gap) {
  if (!on || !ctx || ctx.state !== 'running') return false;
  const t = ctx.currentTime;
  if (t - (last[name] ?? -1) < gap) return false;
  last[name] = t;
  return true;
}

function tone(freq, { at = 0, dur = 0.2, type = 'sine', gain = 0.1, to } = {}) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function knock(freq, { dur = 0.08, q = 3, gain = 0.2 } = {}) {
  const t = ctx.currentTime;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise;
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t);
  s.stop(t + dur + 0.05);
}

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);

export const sfx = {
  tap() { if (ready('tap', 0.05)) tone(900, { dur: 0.04, type: 'triangle', gain: 0.05 }); },
  rotate() { if (ready('rotate', 0.06)) tone(1400, { dur: 0.03, type: 'triangle', gain: 0.035 }); },
  drop() { if (ready('drop', 0.1)) tone(520, { dur: 0.09, type: 'sine', gain: 0.05, to: 300 }); },
  // 落としたブロックが最初に当たったとき。材質で音を変え、強さ（0〜1）で大きさを変える
  land(material, power) {
    if (!ready('land', 0.07)) return;
    const k = 0.4 + 0.6 * Math.min(1, power);
    if (material === 'stone') { knock(260, { dur: 0.12, q: 2, gain: 0.32 * k }); tone(110, { dur: 0.12, gain: 0.12 * k }); }
    else if (material === 'ice') { knock(3200, { dur: 0.05, q: 6, gain: 0.14 * k }); tone(2100, { dur: 0.18, gain: 0.035 * k }); }
    else { knock(700, { dur: 0.08, q: 4, gain: 0.26 * k }); tone(330, { dur: 0.06, type: 'triangle', gain: 0.06 * k }); }
  },
  over() {
    if (!ready('over', 1)) return;
    [67, 63, 60, 55].forEach((n, i) => tone(NOTE(n), { at: i * 0.14, dur: 0.4, type: 'triangle', gain: 0.07 }));
  },
  best() {
    if (!ready('best', 1)) return;
    [72, 76, 79, 84].forEach((n, i) => tone(NOTE(n), { at: 0.1 + i * 0.08, dur: 0.4, gain: 0.07 }));
  },
};

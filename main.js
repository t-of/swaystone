// SWAYSTONE 本体。決まりごと（数値・形・記録）は logic.js、ここは画面・操作・物理のつなぎ。
import {
  WORLD_W, BASE, BASE_FROM_BOTTOM, NEXT_DELAY, OVER_DELAY, KEY_MOVE, ROT_STEP, ROT_SPEED, ROT_HOLD,
  MATERIALS, PHYSICS, makeBody, pickBlock, clampX, standHeight, followHeight, allStill, updateRecord, isOver, spawnYFor, cameraLift,
  viewScale, toU, heightText, shareText, readBest, writeBest, mergeBest,
  otherTurn, matchResult, isValidCode, randomCode, peerIdFor, parseMsg,
} from './logic.js';
import { unlock, isOn, setOn, sfx } from './sound.js';

const { Engine, Runner, Bodies, Body, Composite, Events } = Matter;

WebAppKit.init({ title: 'SWAYSTONE', text: '木・石・氷のブロックを落として、土台の上に高く積み上げる。材質で重さとすべりやすさが違い、物理でゆれて崩れる。' });

// https と localhost（開発・audit）で登録する。それ以外の http では serviceWorker がない
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');

const $ = (id) => document.getElementById(id);
let best = readBest();

// ---- 見た目（色は材質で決める。形では決めない） ----
const LOOK = {
  wood:  { fill: '#d9a466', edge: '#6e4320' },
  stone: { fill: '#a1a5ab', edge: '#484c53' },
  ice:   { fill: '#b8e1ef', edge: '#eefaff' },
};

// 材質の模様を、ブロックの向きに合わせて描く関数を作る（r = 中心からいちばん遠い点までの長さ）
function makeMarks(material, r) {
  const rnd = (a, b) => a + Math.random() * (b - a);
  if (material === 'wood') {   // 木目
    const lines = [];
    for (let y = -r; y < r; y += rnd(3.5, 5.5)) lines.push({ y, amp: rnd(0.4, 1.4), ph: rnd(0, 6) });
    return (c) => {
      c.strokeStyle = 'rgba(110, 67, 32, 0.42)';
      c.lineWidth = 0.8;
      c.beginPath();
      for (const l of lines) {
        for (let x = -r; x <= r; x += 4) {
          const y = l.y + Math.sin(x / 9 + l.ph) * l.amp;
          if (x === -r) c.moveTo(x, y); else c.lineTo(x, y);
        }
      }
      c.stroke();
    };
  }
  if (material === 'stone') {  // 点々
    const dots = Array.from({ length: Math.round((r * r) / 22) }, () => ({
      x: rnd(-r, r), y: rnd(-r, r), s: rnd(0.5, 1.5), light: Math.random() < 0.35,
    }));
    return (c) => {
      for (const d of dots) {
        c.fillStyle = d.light ? 'rgba(255, 255, 255, 0.3)' : 'rgba(55, 58, 64, 0.45)';
        c.beginPath();
        c.arc(d.x, d.y, d.s, 0, Math.PI * 2);
        c.fill();
      }
    };
  }
  return (c) => {              // 氷: ななめのつや
    c.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    c.lineCap = 'round';
    c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(-r * 0.55, -r * 0.05); c.lineTo(-r * 0.15, -r * 0.45); c.stroke();
    c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(-r * 0.35, r * 0.15); c.lineTo(r * 0.05, -r * 0.25); c.stroke();
  };
}

function newBlock(shape, material, x, y) {
  const body = makeBody(Matter, shape, material, x, y);
  const r = Math.max(...body.vertices.map((v) => Math.hypot(v.x - body.position.x, v.y - body.position.y)));
  body.look = { material, marks: makeMarks(material, r) };
  return body;
}

function drawBlock(c, body) {
  const look = LOOK[body.look.material];
  const parts = body.parts.length > 1 ? body.parts.slice(1) : [body];
  c.beginPath();
  for (const p of parts) {
    const v = p.vertices;
    c.moveTo(v[0].x, v[0].y);
    for (let i = 1; i < v.length; i++) c.lineTo(v[i].x, v[i].y);
    c.closePath();
  }
  // 太い線を先に引いてから塗ると、正方形を組み合わせた形でも外側だけにふちが出る（マスの境目は描かない）
  c.lineJoin = 'round';
  c.lineWidth = 2.6;
  c.strokeStyle = look.edge;
  c.stroke();
  c.fillStyle = look.fill;
  c.fill();
  c.save();
  c.clip();
  // ふちの内側に光。部品を組み合わせた形は、部品の境目まで光ってしまうので外側のふちだけにする
  if (body.look.material === 'ice' && parts.length === 1) {
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    c.stroke();
  }
  c.translate(body.position.x, body.position.y);
  c.rotate(body.angle);
  body.look.marks(c);
  c.restore();
}

// 宙に浮いた平たい岩。当たり判定は上の板（BASE）だけで、下のでこぼこは飾り
function drawBase(c) {
  const l = (WORLD_W - BASE.w) / 2, r = l + BASE.w;
  c.fillStyle = '#4a4039';
  c.beginPath();
  c.moveTo(l, 6);
  c.lineTo(l + 12, 22); c.lineTo(l + 40, 36); c.lineTo(l + 78, 46); c.lineTo(l + 118, 42);
  c.lineTo(r - 30, 32); c.lineTo(r - 8, 20); c.lineTo(r, 6);
  c.closePath();
  c.fill();
  c.fillStyle = '#6b5e53';
  c.beginPath();
  c.roundRect(l, 0, BASE.w, BASE.h, 3);
  c.fill();
  c.fillStyle = '#8c7e70';
  c.fillRect(l + 2, 0, BASE.w - 4, 3);
}

// ---- タイトルの見本の塔（動かない絵） ----
function drawSample() {
  const cv = $('sample');
  const w = cv.clientWidth, h = cv.clientHeight, dpr = devicePixelRatio || 1;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const c = cv.getContext('2d');
  const k = (w / 250) * dpr;   // 世界の x 55〜305 を映す。土台の上面から 54 下を絵の下の端に
  c.setTransform(k, 0, 0, k, -55 * k, cv.height - 54 * k);
  drawBase(c);
  let top = 0;
  for (const [shape, material, x, angle] of [
    ['I5', 'wood', 180, 0], ['U5', 'stone', 176, 0], ['L3', 'ice', 184, 0],
    ['T5', 'wood', 178, Math.PI], ['P5', 'stone', 182, 0],
  ]) {
    const b = newBlock(shape, material, x, 0);
    Body.setAngle(b, angle);
    Body.setPosition(b, { x, y: b.position.y + top - b.bounds.max.y });
    top = b.bounds.min.y;
    drawBlock(c, b);
  }
}

// ---- 遊ぶ ----
const canvas = $('stage');
const ctx = canvas.getContext('2d');
const view = { h: 600, ox: 0, scale: 1, dpr: 1 };   // h は見える世界の高さ、ox は世界を左右中央に置くためのずれ
let sky = null;
let engine = null, runner = null, game = null;
let screen = 'title';
const keys = { left: false, right: false, up: false, down: false };
let hold = null;   // ↺ ↻ を押し続けているとき { dir, at }
let drag = null;   // なぞっている指 { id, x }

// ---- 対戦モード ----
// mode: 'solo' | 'local'（この端末で交代） | 'online'（PeerJS）
// role: online だけ 'host' | 'guest'。番のトークンは 'a'（1P・ホスト）/ 'b'（2P・ゲスト）
let mode = 'solo', role = null;
let peer = null, conn = null, roomCode = null;
let myAgain = false, peerAgain = false, inputTimer = null;
const selfToken = () => (role === 'guest' ? 'b' : 'a');
const canControl = () => !!(game && !game.over && !game.awaitingDrop && (mode !== 'online' || game.turn === selfToken()));
const send = (msg) => { try { if (conn && conn.open) conn.send(msg); } catch { /* 送れなくても続ける */ } };

function turnLabel(t) {
  if (mode === 'local') return t === 'a' ? '1P の番' : '2P の番';
  return t === selfToken() ? 'あなたの番' : '相手の番';
}
function resultTitle(winner) {
  if (mode === 'local') return winner === 'a' ? '1P の勝ち' : '2P の勝ち';
  return winner === selfToken() ? 'あなたの勝ち' : 'あなたの負け';
}
function updateTurnBanner() {
  const el = $('turnBanner');
  if (mode === 'solo' || !game) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = turnLabel(game.turn);
  el.classList.toggle('turn--you', mode === 'online' && game.turn === selfToken());
}

function stopOnline() {
  clearInterval(inputTimer);
  inputTimer = null;
  try { if (conn) conn.close(); } catch { /* もう閉じている */ }
  try { if (peer) peer.destroy(); } catch { /* もう壊れている */ }
  conn = null; peer = null; role = null; roomCode = null;
}

function resize() {
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return;
  view.dpr = devicePixelRatio || 1;
  canvas.width = Math.round(r.width * view.dpr);
  canvas.height = Math.round(r.height * view.dpr);
  view.scale = viewScale(r.width, r.height);   // ふつうは幅 360 に合わせる。横長の画面では高さに合わせる
  view.h = r.height / view.scale;
  view.ox = (r.width / view.scale - WORLD_W) / 2;
  sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, '#1b2230');
  sky.addColorStop(0.55, '#26324a');
  sky.addColorStop(0.82, '#3a4763');
  sky.addColorStop(1, '#1b2230');
}
new ResizeObserver(resize).observe(canvas);

const now = () => (engine ? engine.timing.timestamp : performance.now());
const camTop = () => BASE_FROM_BOTTOM - view.h - game.lift;   // 画面の上の端の y

// 画面の切り替え（隠すのは hidden = display: none）
function show(s) {
  screen = s;
  $('title').hidden = s !== 'title';
  $('online').hidden = s !== 'online';
  $('play').hidden = s === 'title' || s === 'online';
  $('result').hidden = s !== 'over';
  $('play').classList.toggle('is-over', s === 'over');
  if (s === 'title') $('titleBest').textContent = `${best.count} 個 ・ ${heightText(best.height)}`;
}

// 対戦の 1 局を始める。turn は最初の番（'a'/'b'。solo では使わない）
function start(turn = 'a') {
  if (runner) Runner.stop(runner);
  engine = Engine.create({ positionIterations: 10, velocityIterations: 10, enableSleeping: PHYSICS.sleeping });
  engine.gravity.y = PHYSICS.gravity;
  Composite.add(engine.world, Bodies.rectangle(WORLD_W / 2, BASE.h / 2, BASE.w, BASE.h,
    { isStatic: true, friction: 1, chamfer: { radius: 3 } }));
  Events.on(engine, 'afterUpdate', step);
  Events.on(engine, 'collisionStart', landed);
  game = {
    held: null, blocks: [], count: 0, nextAt: 0, overAt: 0, over: false,
    stand: 0,                                  // 塔の今の上端の高さ
    cam: 0,                                    // 画面が追いかける高さ
    rec: { stillSince: null, height: 0 },      // 高さの記録（全部が止まったときだけ更新）
    height: 0,                                 // 表示と保存に使う高さ（u）
    lift: 0, cardBottom: 0,
    turn, lastDropper: null, lastStateAt: 0,   // 二人対戦だけで使う
  };
  myAgain = false; peerAgain = false;
  show('play');
  resize();
  hud();
  updateTurnBanner();
  runner = Runner.run(Runner.create(), engine);
  runner.enabled = mode === 'online' && role === 'host' ? true : !document.hidden;
  if (mode === 'online' && role === 'host') send({ type: 'start', first: turn });
}

// ゲスト（オンラインの入る側）は物理を動かさず、ホストから届く値をそのまま描くだけ
function startGuestView(turn) {
  if (runner) Runner.stop(runner);
  engine = null; runner = null;
  game = {
    held: null, blocks: [], count: 0, over: false,
    height: 0, lift: 0, cardBottom: 0,
    turn, lastDropper: null,
  };
  myAgain = false; peerAgain = false;
  show('play');
  resize();
  hud();
  updateTurnBanner();
}

function toTitle() {
  if (runner) Runner.stop(runner);
  if (mode === 'online') stopOnline();
  mode = 'solo';
  show('title');
}

function onlineShow(step) {
  show('online');
  $('onlinePick').hidden = step !== 'pick';
  $('onlineJoinBox').hidden = step !== 'join';
  $('onlineHostBox').hidden = step !== 'host';
}

// 出てくるブロックは、落とすまで物理の世界に入れない（重力を受けず、何にもぶつからない）
function spawn() {
  const { shape, material } = pickBlock();
  showHeld(shape, material, spawnYFor(game.stand));
  if (mode === 'online' && role === 'host') send({ type: 'block', shape, material });
}

// held のブロックを画面に出す（表示だけ。ゲスト側でも host からの 'block' で同じことをする）
function showHeld(shape, material, y) {
  game.held = newBlock(shape, material, WORLD_W / 2, y);
  const m = MATERIALS[material];
  $('mat').textContent = `${m.name}・${m.note}`;
  $('mat').dataset.material = material;
}

function rotate(a) {
  if (!game?.held || !canControl()) return;
  Body.rotate(game.held, a);
  sfx.rotate();
}

// 落としたブロックが最初に何かに当たったら、材質の音を 1 回だけ鳴らす
function landed(e) {
  for (const { bodyA, bodyB } of e.pairs) {
    for (const p of [bodyA, bodyB]) {
      const b = p.parent;
      if (!b.look || b.look.landed) continue;
      b.look.landed = true;
      sfx.land(b.look.material, b.speed / 10);
    }
  }
}

// ボタン・キーから呼ぶ。自分の番でなければ何もしない
function drop() {
  const b = game?.held;
  if (!b || game.over || !canControl()) return;
  if (mode === 'online' && role === 'guest') { game.awaitingDrop = true; send({ type: 'drop' }); return; }   // 物理はホストだけ動かす
  performDrop();
}

// 実際に物理の世界へ落とす。ホストは自分の番でも、ゲストの 'drop' メッセージを受けたときも呼ぶ
function performDrop() {
  const b = game.held;
  Body.setVelocity(b, { x: 0, y: 0 });
  Body.setAngularVelocity(b, 0);
  Composite.add(engine.world, b);
  game.blocks.push({ body: b, droppedAt: now() });
  game.count++;
  game.held = null;
  game.nextAt = now() + NEXT_DELAY;
  if (mode !== 'solo') { game.lastDropper = game.turn; game.turn = otherTurn(game.turn); }
  sfx.drop();
  hud();
  updateTurnBanner();
}

// 物理の 1 歩（1/60 秒）ごと
function step() {
  const t = now();
  const b = game.held;
  if (b) {
    if (canControl()) {
      const dx = (keys.right - keys.left) * KEY_MOVE;
      if (dx) Body.setPosition(b, { x: clampX(b.position.x + dx), y: b.position.y });
      let da = ((keys.down - keys.up) * ROT_SPEED) / 60;
      if (hold && t - hold.at > ROT_HOLD) da += (hold.dir * ROT_SPEED) / 60;
      if (da) Body.rotate(b, da);
    }
  } else if (!game.over && t >= game.nextAt) spawn();

  const snap = game.blocks.map(({ body, droppedAt }) => ({
    droppedAt, landed: !!body.look.landed, speed: body.speed, spin: Math.abs(body.angularVelocity), top: body.bounds.min.y, y: body.position.y,
  }));
  game.stand = standHeight(snap);
  game.cam = followHeight(game.cam, game.stand, allStill(snap, t));
  game.rec = updateRecord(game.rec, snap, t);
  if (toU(game.rec.height) !== game.height) { game.height = toU(game.rec.height); hud(); }

  // 画面は追いかける高さに合わせて上下する。結果のカードが塔に重なるときは、塔の上端がカードの下に来るまで上げる
  let lift = cameraLift(view.h, game.cam);
  if (game.cardBottom) lift = Math.max(lift, BASE_FROM_BOTTOM - view.h + game.stand + game.cardBottom);
  game.lift += (lift - game.lift) * 0.06;
  // 塔が伸びて近づいたら、持っているブロックも上げる（下げはしない）
  if (game.held) {
    const y = spawnYFor(game.stand);
    if (y < game.held.position.y) Body.setPosition(game.held, { x: game.held.position.x, y });
  }

  if (!game.over && isOver(snap)) {
    game.over = true;
    game.held = null;
    game.overAt = t + OVER_DELAY;
    sfx.over();
  }
  if (game.over && screen === 'play' && t >= game.overAt) finish();

  // ホストは全ブロック（と持っているブロック）の位置・角度を毎秒 20〜30 回、ゲストに送る
  if (mode === 'online' && role === 'host' && t - game.lastStateAt >= 35) {
    game.lastStateAt = t;
    const r = mode !== 'solo' ? matchResult(snap, game.lastDropper) : null;
    send({
      type: 'state', turn: game.turn, over: !!r, loser: r ? r.loser : null, lift: game.lift,
      blocks: game.blocks.map(({ body }) => ({ x: body.position.x, y: body.position.y, angle: body.angle })),
      held: game.held ? { x: game.held.position.x, y: game.held.position.y, angle: game.held.angle } : null,
    });
  }
}

function hud() {
  $('count').textContent = game.count;
  $('height').textContent = heightText(game.height);
}

function resetResultUI() {
  $('rScore').hidden = false;
  $('rMsg').hidden = true;
  $('rWaitMsg').hidden = true;
  $('again').hidden = false;
}

function finish() {
  if (mode === 'solo') return finishSolo();
  return showMultiResult(game.lastDropper);
}

function finishSolo() {
  resetResultUI();
  const r = mergeBest(best, game.count, game.height);
  best = r.best;
  writeBest(best);
  $('rTitle').textContent = 'くずれた！';
  $('rCount').textContent = game.count;
  $('rHeight').textContent = heightText(game.height);
  const news = [r.newCount && '個数', r.newHeight && '高さ'].filter(Boolean);
  $('rNew').hidden = !news.length;
  if (news.length) sfx.best();
  $('rNew').textContent = `ベスト更新（${news.join('・')}）`;
  $('rBest').hidden = false;
  $('rBest').textContent = `ベスト ${best.count} 個 ・ ${heightText(best.height)}`;
  placeResultCard();
}

// 二人対戦（同じ端末・オンライン共通）の結果。自己ベストは更新しない
function showMultiResult(loser) {
  if (!loser || game.shownResult) return;
  game.over = true;
  game.shownResult = true;
  resetResultUI();
  const winner = otherTurn(loser);
  $('rTitle').textContent = resultTitle(winner);
  $('rCount').textContent = game.count;
  $('rHeight').textContent = heightText(game.height);
  $('rNew').hidden = true;
  $('rBest').hidden = true;
  placeResultCard();
}

function showNetError(msg) {
  if (runner) Runner.stop(runner);
  game.over = true;
  $('rTitle').textContent = 'つながりが切れました';
  $('rScore').hidden = true;
  $('rNew').hidden = true;
  $('rBest').hidden = true;
  $('rWaitMsg').hidden = true;
  $('rMsg').hidden = false;
  $('rMsg').textContent = msg;
  $('again').hidden = true;
  show('over');
}

// カードが世界の列（幅 360）と左右で重なっていれば、カードの下の端（世界の長さ）を覚えておく
function placeResultCard() {
  show('over');
  const cr = document.querySelector('.result__card').getBoundingClientRect();
  const vr = canvas.getBoundingClientRect();
  const colL = vr.left + view.ox * view.scale, colR = colL + WORLD_W * view.scale;
  game.cardBottom = cr.left < colR && cr.right > colL ? (cr.bottom - vr.top) / view.scale + 16 : 0;
}

function render() {
  requestAnimationFrame(render);
  if (screen === 'title' || !game || !sky) return;
  const c = ctx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = sky;
  c.fillRect(0, 0, canvas.width, canvas.height);
  const k = view.scale * view.dpr;
  c.setTransform(k, 0, 0, k, view.ox * k, -camTop() * k);
  drawBase(c);
  const b = game.held;
  if (b) {   // 落ちる位置の目安は細い縦の点線だけ。落ちた先の形（影）は描かない
    c.save();
    c.setLineDash([2, 6]);
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(236, 238, 243, 0.4)';
    c.beginPath();
    c.moveTo(b.position.x, b.bounds.max.y + 4);
    c.lineTo(b.position.x, camTop() + view.h);
    c.stroke();
    c.restore();
  }
  for (const { body } of game.blocks) drawBlock(c, body);
  if (b) drawBlock(c, b);
}
requestAnimationFrame(render);

// ---- 操作 ----
// ステージのどこでもなぞれば、指の動いた分だけ動く
canvas.addEventListener('pointerdown', (e) => {
  drag = { id: e.pointerId, x: e.clientX };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  const dx = (e.clientX - drag.x) / view.scale;
  drag.x = e.clientX;
  const b = game?.held;
  if (b && canControl()) Body.setPosition(b, { x: clampX(b.position.x + dx), y: b.position.y });
});
for (const t of ['pointerup', 'pointercancel']) canvas.addEventListener(t, () => { drag = null; });

// ↺ ↻: 1 回押すと 15°、押し続けると回り続ける
for (const [id, dir] of [['rotL', -1], ['rotR', 1]]) {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    rotate(dir * ROT_STEP);
    hold = { dir, at: now() };
  });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, () => { hold = null; });
  el.addEventListener('click', (e) => { if (e.detail === 0) rotate(dir * ROT_STEP); });   // キーボードで押したとき
}
$('drop').addEventListener('click', drop);

const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
addEventListener('keydown', (e) => {
  if (screen !== 'play') return;
  if (KEYS[e.key]) { keys[KEYS[e.key]] = true; e.preventDefault(); }
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) drop(); }
});
addEventListener('keyup', (e) => { if (KEYS[e.key]) keys[KEYS[e.key]] = false; });

// 画面が隠れたら物理を止める。オンラインのホストは相手を待たせないので止めない
document.addEventListener('visibilitychange', () => {
  if (runner) runner.enabled = (mode === 'online' && role === 'host') ? true : !document.hidden;
  for (const k in keys) keys[k] = false;
  hold = null;
});

// 最初の音は触ったときに鳴らせるよう、どこを触っても音の準備をする
addEventListener('pointerdown', unlock, true);
addEventListener('keydown', unlock, true);
for (const id of [
  'startSolo', 'startLocal', 'startOnline', 'again', 'toTitle', 'shareResult',
  'roomCreate', 'roomJoinOpen', 'roomJoin', 'onlineBack', 'joinBack', 'hostCancel', 'hostShare',
]) $(id).addEventListener('click', () => sfx.tap());

// 音のオン・オフ
function syncSound() {
  $('sound').setAttribute('aria-pressed', isOn());
  $('sound').textContent = isOn() ? '音 オン' : '音 オフ';
}
$('sound').addEventListener('click', () => { setOn(!isOn()); syncSound(); sfx.tap(); });
syncSound();

$('startSolo').addEventListener('click', () => { mode = 'solo'; role = null; start(); });
$('startLocal').addEventListener('click', () => { mode = 'local'; role = null; start(); });
$('startOnline').addEventListener('click', () => onlineShow('pick'));
$('toTitle').addEventListener('click', toTitle);
$('shareResult').addEventListener('click', () => WebAppKit.share({ text: shareText(game.count, game.height) }));

$('again').addEventListener('click', () => {
  if (mode !== 'online') { start(); return; }
  if (role === 'guest') {
    myAgain = true;
    $('rWaitMsg').hidden = false;
    send({ type: 'again' });
    return;
  }
  myAgain = true;
  $('rWaitMsg').hidden = false;
  send({ type: 'again' });
  tryRestartOnline();
});
function tryRestartOnline() {
  if (role === 'host' && myAgain && peerAgain) start('a');
}

// ---- オンライン対戦（PeerJS）: 部屋を作る・入る ----
function netMsg(id, text) { $(id).textContent = text; }
const CONN_FAIL = 'つながりませんでした。会社や学校の回線などでは、つながらないことがあります。';

function newPeer(id) {
  if (typeof Peer === 'undefined') return null;
  try { return id ? new Peer(id) : new Peer(); } catch { return null; }
}

$('roomCreate').addEventListener('click', () => {
  onlineShow('host');
  $('hostCode').textContent = '・・・・';
  netMsg('hostMsg', '');
  hostCreate(randomCode(), 0);
});

function hostCreate(code, tries) {
  stopOnline();
  peer = newPeer(peerIdFor(code));
  if (!peer) { netMsg('hostMsg', CONN_FAIL); return; }
  peer.on('open', () => {
    roomCode = code;
    $('hostCode').textContent = code;
  });
  peer.on('error', (err) => {
    if (err && err.type === 'unavailable-id' && tries < 5) { hostCreate(randomCode(), tries + 1); return; }
    if (screen === 'play' || screen === 'over') showNetError(CONN_FAIL); else netMsg('hostMsg', CONN_FAIL);
  });
  peer.on('connection', (c) => {
    if (conn) { c.close(); return; }   // 3 人目以降は断る
    conn = c;
    role = 'host';
    conn.on('open', () => { mode = 'online'; start('a'); });
    conn.on('data', onData);
    conn.on('close', onConnLost);
  });
  peer.on('disconnected', onConnLost);
}

$('hostShare').addEventListener('click', () => {
  const url = `${location.origin}${location.pathname}?room=${roomCode ?? ''}`;
  WebAppKit.share({ text: `SWAYSTONE で対戦しよう（合言葉 ${roomCode ?? ''}）`, url });
});
$('hostCancel').addEventListener('click', () => { stopOnline(); onlineShow('pick'); });
$('onlineBack').addEventListener('click', () => { stopOnline(); show('title'); });
$('joinBack').addEventListener('click', () => { stopOnline(); onlineShow('pick'); });

$('roomJoinOpen').addEventListener('click', () => { netMsg('joinMsg', ''); onlineShow('join'); $('roomCode').focus(); });
$('roomJoin').addEventListener('click', () => joinRoom($('roomCode').value.trim()));
$('roomCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom($('roomCode').value.trim()); });

function joinRoom(code) {
  if (!isValidCode(code)) { netMsg('joinMsg', '4 桁の数字を入れてください'); return; }
  netMsg('joinMsg', 'つないでいます…');
  stopOnline();
  peer = newPeer();
  if (!peer) { netMsg('joinMsg', CONN_FAIL); return; }
  peer.on('open', () => {
    conn = peer.connect(peerIdFor(code), { reliable: true });
    role = 'guest';
    mode = 'online';
    conn.on('open', () => {
      inputTimer = setInterval(sendInput, 50);   // 手元のブロックの x と角度を毎秒 20 回ほど送る
    });
    conn.on('data', onData);
    conn.on('close', onConnLost);
    conn.on('error', () => (screen === 'play' || screen === 'over') ? showNetError(CONN_FAIL) : netMsg('joinMsg', CONN_FAIL));
  });
  peer.on('error', () => (screen === 'play' || screen === 'over') ? showNetError(CONN_FAIL) : netMsg('joinMsg', CONN_FAIL));
  peer.on('disconnected', onConnLost);
}

function sendInput() {
  if (role !== 'guest' || !game?.held || !canControl()) return;
  send({ type: 'input', x: game.held.position.x, y: game.held.position.y, angle: game.held.angle });
}

function onConnLost() {
  if (screen === 'play' || screen === 'over') showNetError(CONN_FAIL);
}

// 受け取った値は信用しない。壊れている・知らない type は logic.js の parseMsg が捨てる
function onData(raw) {
  const msg = parseMsg(raw);
  if (!msg) return;
  if (msg.type === 'start' && role === 'guest') startGuestView(msg.first);
  else if (msg.type === 'block' && role === 'guest') onBlockMsg(msg);
  else if (msg.type === 'state' && role === 'guest') onState(msg);
  else if (msg.type === 'input' && role === 'host') onRemoteInput(msg);
  else if (msg.type === 'drop' && role === 'host') onRemoteDrop();
  else if (msg.type === 'again') { peerAgain = true; tryRestartOnline(); }
}

function onRemoteInput(msg) {
  if (!game?.held || game.turn !== 'b') return;
  Body.setPosition(game.held, { x: clampX(msg.x), y: msg.y });
  Body.setAngle(game.held, msg.angle);
}

function onRemoteDrop() {
  if (!game?.held || game.over || game.turn !== 'b') return;
  performDrop();
}

function onBlockMsg(msg) {
  if (!game) return;
  game.awaitingDrop = false;
  showHeld(msg.shape, msg.material, spawnYFor(game.stand || 0));
}

function onState(msg) {
  if (!game) return;
  game.turn = msg.turn;
  while (game.blocks.length < msg.blocks.length) {
    if (!game.held) break;   // 届く前に見た目が壊れていたら、これ以上は増やさない
    game.blocks.push({ body: game.held });
    game.held = null;
  }
  msg.blocks.forEach((p, i) => {
    const body = game.blocks[i]?.body;
    if (!body) return;
    Body.setPosition(body, { x: p.x, y: p.y });
    Body.setAngle(body, p.angle);
  });
  game.stand = standHeight(game.blocks.map(({ body }) => ({ landed: true, top: body.bounds.min.y })));
  if (msg.held) {
    if (game.held && game.turn !== selfToken()) {
      Body.setPosition(game.held, { x: msg.held.x, y: msg.held.y });
      Body.setAngle(game.held, msg.held.angle);
    }
  } else {
    game.held = null;
  }
  // 塔が伸びて近づいたら、持っているブロックも上げる（下げはしない。自分の番のときだけ）
  if (game.held && game.turn === selfToken()) {
    const y = spawnYFor(game.stand);
    if (y < game.held.position.y) Body.setPosition(game.held, { x: game.held.position.x, y });
  }
  game.lift = msg.lift;
  game.count = game.blocks.length;
  hud();
  updateTurnBanner();
  if (msg.over) showMultiResult(msg.loser);
}

// ?room=1234 で開いたら、合言葉が入った状態で入る画面を出す
const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam && isValidCode(roomParam)) {
  onlineShow('join');
  $('roomCode').value = roomParam;
} else {
  show('title');
}
drawSample();

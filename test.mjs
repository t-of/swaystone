// node test.mjs — 画面を使わない部分のテスト（形・高さ・終わり・記録）
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as L from './logic.js';

const Matter = createRequire(import.meta.url)('./vendor/matter.min.js');
let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`ok ${name}`); };

test('形は 6 種、どれも面積が 4u² 前後、重さ = 密度 × 面積', () => {
  assert.equal(Object.keys(L.SHAPES).length, 6);
  for (const shape of Object.keys(L.SHAPES)) {
    for (const [mat, m] of Object.entries(L.MATERIALS)) {
      const b = L.makeBody(Matter, shape, mat, 100, 50);
      const area = b.parts.length > 1 ? b.parts.slice(1).reduce((s, p) => s + p.area, 0) : b.area;
      const u2 = area / (L.U * L.U);
      assert.ok(u2 > 3.2 && u2 < 4.6, `${shape} の面積 ${u2.toFixed(2)}u²`);
      assert.ok(Math.abs(b.mass - m.density * area) < 1e-6, `${shape}/${mat} の重さ`);
      assert.equal(b.friction, m.friction);
      assert.equal(b.frictionStatic, m.frictionStatic);
      assert.equal(b.restitution, 0);
      assert.ok(Math.abs(b.position.x - 100) < 1 && Math.abs(b.position.y - 50) < 20, `${shape} の位置`);
    }
  }
});

test('凹んだ形はない（ほねは凸の部品 3 つ）', () => {
  for (const shape of Object.keys(L.SHAPES)) {
    const b = L.makeBody(Matter, shape, 'wood', 0, 0);
    const parts = b.parts.length > 1 ? b.parts.slice(1) : [b];
    if (shape === 'hone') assert.equal(parts.length, 3);
    for (const p of parts) assert.ok(Matter.Vertices.isConvex(p.vertices), shape);
  }
  assert.equal(L.ellipse(1, 1, 16).length, 16);
  const half = L.halfDisc(10, 12);
  assert.equal(half.length, 12);
  assert.ok(half.every((p) => p.y <= 1e-9), 'はんげつは平らな面が下');
});

test('くさびは下 3u・上 1u', () => {
  const b = L.makeBody(Matter, 'kusabi', 'wood', 0, 0);
  const w = b.bounds.max.x - b.bounds.min.x;
  assert.ok(Math.abs(w - 3 * L.U) < 3, `下の幅 ${w.toFixed(1)}`);  // 角の丸めで少し細くなる
  const topXs = b.vertices.filter((v) => v.y < b.bounds.min.y + 1).map((v) => v.x);
  assert.ok(Math.max(...topXs) - Math.min(...topXs) < 1.2 * L.U, '上がせまい');
});

test('形は等確率、材質は 5:3:2', () => {
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const shapes = {}, mats = {};
  const N = 60000;
  for (let i = 0; i < N; i++) {
    const { shape, material } = L.pickBlock(rand);
    shapes[shape] = (shapes[shape] || 0) + 1;
    mats[material] = (mats[material] || 0) + 1;
  }
  for (const id of Object.keys(L.SHAPES)) assert.ok(Math.abs(shapes[id] / N - 1 / 6) < 0.01, id);
  for (const [id, m] of Object.entries(L.MATERIALS)) assert.ok(Math.abs(mats[id] / N - m.rate) < 0.01, id);
  assert.equal(L.pickBlock(() => 0.999999).material, 'ice');
  assert.equal(L.pickBlock(() => 0).material, 'wood');
});

test('左右は端から 20 の内側', () => {
  assert.equal(L.clampX(-50), 20);
  assert.equal(L.clampX(999), 340);
  assert.equal(L.clampX(123), 123);
});

test('塔の今の高さ（落ちている途中のものは数えない）', () => {
  const now = 5000;
  assert.equal(L.standHeight([], now), 0);
  assert.equal(L.standHeight([
    { droppedAt: 1000, top: -44 },
    { droppedAt: 4800, top: -300 },   // 落としたばかり
  ], now), 44);
  assert.equal(L.standHeight([{ droppedAt: 0, top: 30 }], now), 0, '土台より下は 0');
  assert.equal(L.toU(44), 2);
  assert.equal(L.heightText(34.2), '3.4 m');
  assert.equal(L.heightText(0), '0.0 m');
  assert.equal(L.shareText(23, 34.2), 'ゆらづみで 23 個つんだ（高さ 3.4 m）');
});

test('高さの記録は、全部が止まって一定時間たったときだけ', () => {
  const still = (top) => ({ droppedAt: 0, speed: 0, spin: 0, top, y: top / 2 });
  let rec = { stillSince: null, height: 0 };
  // 止まっていても、STILL_TIME たつまでは記録しない
  rec = L.updateRecord(rec, [still(-40)], 1000);
  assert.equal(rec.height, 0);
  rec = L.updateRecord(rec, [still(-40)], 1000 + L.STILL_TIME);
  assert.equal(rec.height, 40);

  // 板を立てて落とす: 一瞬止まって見えても、すぐ動けば記録しない
  const t0 = 3000;
  const upright = { droppedAt: t0 - L.SETTLE_TIME, speed: 0.1, spin: 0.002, top: -140, y: -70 };
  rec = L.updateRecord(rec, [still(-40), upright], t0);
  assert.equal(rec.height, 40);
  rec = L.updateRecord(rec, [still(-40), { ...upright, speed: 3, spin: 0.08, top: -120 }], t0 + 200);   // 倒れはじめる
  assert.equal(rec.stillSince, null);
  rec = L.updateRecord(rec, [still(-40), { ...upright, top: -60 }], t0 + 400);   // 倒れて止まった
  rec = L.updateRecord(rec, [still(-40), { ...upright, top: -60 }], t0 + 400 + L.STILL_TIME);
  assert.equal(rec.height, 60, '倒れたあとの高さ');

  // ゆっくり回り続けているもの（速さは小さい）は止まっていない
  assert.equal(L.allStill([{ ...still(-40), spin: 0.05 }], 9999), false);
  // 落として SETTLE_TIME たっていないものがあれば止まっていない
  assert.equal(L.allStill([{ ...still(-40), droppedAt: 9500 }], 9999), false);
  assert.equal(L.allStill([], 9999), false);
  // 崩れて低くなっても、記録は下がらない
  rec = L.updateRecord(rec, [still(-10)], 20000);
  rec = L.updateRecord(rec, [still(-10)], 20000 + L.STILL_TIME);
  assert.equal(rec.height, 60);
});

test('中心が土台の上面より 80 下で終わり', () => {
  const at = (y) => ({ y });
  assert.equal(L.isOver([]), false);
  assert.equal(L.isOver([at(-20), at(79.9)]), false);
  assert.equal(L.isOver([at(-20), at(80.1)]), true);
  assert.equal(L.isOver([at(5000)]), true, '速く落ちてもすり抜けない');
});

test('出てくる位置は塔の上端の少し上、画面は今の高さに合わせて上がり下がりする', () => {
  assert.equal(L.spawnYFor(0), -L.SPAWN_GAP);
  assert.equal(L.spawnYFor(200), -200 - L.SPAWN_GAP);
  const viewH = 600;   // 上げていない画面の上端 = 90 - 600 = -510
  assert.equal(L.cameraLift(viewH, 0), 0);
  const need = 510 - L.SPAWN_GAP - L.SPAWN_FROM_TOP;   // この高さを超えたら上げはじめる
  assert.equal(L.cameraLift(viewH, need), 0);
  assert.equal(L.cameraLift(viewH, need + 30), 30);
  assert.equal(L.cameraLift(viewH, 10), 0, '崩れて低くなれば戻る');
  // 出てくる位置はいつも画面の中
  for (const h of [0, 100, 400, 2000]) {
    const camTop = L.BASE_FROM_BOTTOM - viewH - L.cameraLift(viewH, h);
    assert.ok(L.spawnYFor(h) - camTop >= L.SPAWN_FROM_TOP - 1e-9);
  }
});

test('縮尺: 横画面でも見える世界の高さは MIN_VIEW_H 以上', () => {
  assert.equal(L.viewScale(390, 698), 390 / 360, '縦画面は幅に合わせる');
  const s = L.viewScale(844, 244);
  assert.ok(244 / s >= L.MIN_VIEW_H - 1e-9);
  // 土台と、何も積んでいないときの出てくる位置が画面に入る
  assert.ok(L.BASE_FROM_BOTTOM + L.SPAWN_GAP + L.SPAWN_FROM_TOP <= L.MIN_VIEW_H);
});

test('自己ベストの読み書き', () => {
  const mem = (init) => { const d = { ...init }; return { getItem: (k) => d[k] ?? null, setItem: (k, v) => { d[k] = v; }, d }; };
  assert.deepEqual(L.readBest(mem()), { v: 1, count: 0, height: 0 });
  assert.deepEqual(L.readBest(mem({ 'yurazumi.best': '{壊れた' })), { v: 1, count: 0, height: 0 });
  assert.deepEqual(L.readBest(mem({ 'yurazumi.best': '{"v":2,"count":9}' })), { v: 1, count: 0, height: 0 });
  assert.deepEqual(L.readBest(mem({ 'yurazumi.best': '{"v":1,"count":"x","height":-3}' })), { v: 1, count: 0, height: 0 });
  const throwing = { getItem() { throw new Error('private'); }, setItem() { throw new Error('full'); } };
  assert.deepEqual(L.readBest(throwing), { v: 1, count: 0, height: 0 });
  L.writeBest({ v: 1, count: 1, height: 1 }, throwing);  // 例外を外に出さない

  const s = mem();
  const r = L.mergeBest(L.readBest(s), 23, 34.2);
  assert.equal(r.newCount && r.newHeight, true);
  L.writeBest(r.best, s);
  assert.equal(Object.keys(s.d)[0], 'yurazumi.best');
  assert.deepEqual(L.readBest(s), { v: 1, count: 23, height: 34.2 });
  const r2 = L.mergeBest(L.readBest(s), 10, 40);
  assert.deepEqual(r2, { best: { v: 1, count: 23, height: 40 }, newCount: false, newHeight: true });
});

test('物理で実際に積める（木のいたを土台に落とすと止まる）', () => {
  const engine = Matter.Engine.create({ positionIterations: 10, velocityIterations: 10 });
  const base = Matter.Bodies.rectangle(L.WORLD_W / 2, L.BASE.h / 2, L.BASE.w, L.BASE.h, { isStatic: true, friction: 1 });
  const b = L.makeBody(Matter, 'ita', 'wood', L.WORLD_W / 2, -100);
  Matter.Composite.add(engine.world, [base, b]);
  for (let i = 0; i < 180; i++) Matter.Engine.update(engine, 1000 / 60);
  assert.ok(b.speed < L.SETTLE_SPEED, '止まった');
  assert.ok(Math.abs(b.bounds.max.y) < 2, `土台の上にのった（${b.bounds.max.y.toFixed(1)}）`);
  assert.equal(L.isOver([{ y: b.position.y }]), false);
});

test('物理で: 板を立てて落としても、倒れる前の高さは記録に入らない', () => {
  const engine = Matter.Engine.create({ positionIterations: 10, velocityIterations: 10 });
  const base = Matter.Bodies.rectangle(L.WORLD_W / 2, L.BASE.h / 2, L.BASE.w, L.BASE.h, { isStatic: true, friction: 1 });
  const b = L.makeBody(Matter, 'ita', 'wood', L.WORLD_W / 2 + 3, -80);
  Matter.Body.rotate(b, Math.PI / 2 - 0.2);   // ほぼ立てる（高さ 4.5u = 99）。少し傾けてあるので倒れる
  Matter.Composite.add(engine.world, [base, b]);
  let rec = { stillSince: null, height: 0 }, maxTop = 0;
  for (let i = 0; i < 60 * 8; i++) {
    Matter.Engine.update(engine, 1000 / 60);
    const t = engine.timing.timestamp;
    rec = L.updateRecord(rec, [{ droppedAt: 0, speed: b.speed, spin: Math.abs(b.angularVelocity), top: b.bounds.min.y, y: b.position.y }], t);
    if (t > 300) maxTop = Math.max(maxTop, -b.bounds.min.y);
  }
  assert.ok(maxTop > 80, `立った姿勢を通った（${maxTop.toFixed(0)}）`);
  assert.ok(rec.height > 0 && rec.height < 40, `記録は倒れたあとの高さ（${rec.height.toFixed(1)}）`);
});

console.log(`\n${n} 件すべて合格`);

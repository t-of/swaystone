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

test('高さは止まっているものだけ数える', () => {
  const now = 5000;
  assert.equal(L.towerHeight([], now), 0);
  assert.equal(L.towerHeight([
    { droppedAt: 1000, speed: 0.1, top: -44 },   // 数える
    { droppedAt: 4500, speed: 0, top: -300 },    // 落としたばかり
    { droppedAt: 1000, speed: 2, top: -200 },    // 動いている
  ], now), 44);
  assert.equal(L.towerHeight([{ droppedAt: 0, speed: 0, top: 30 }], now), 0, '土台より下は 0');
  assert.equal(L.toU(44), 2);
  assert.equal(L.heightText(34.2), '3.4 m');
  assert.equal(L.heightText(0), '0.0 m');
  assert.equal(L.shareText(23, 34.2), 'ゆらづみで 23 個つんだ（高さ 3.4 m）');
});

test('中心が土台の上面より 80 下で終わり', () => {
  assert.equal(L.isOver([]), false);
  assert.equal(L.isOver([-20, 79.9]), false);
  assert.equal(L.isOver([-20, 80.1]), true);
  assert.equal(L.isOver([5000]), true, '速く落ちてもすり抜けない');
});

test('画面の追いかけは上にだけ', () => {
  const viewH = 600;  // 出てくる位置 = 90 - 600 + 40 = -470、その 180 下 = -290
  assert.equal(L.followLift(0, viewH, 0), 0);
  assert.equal(L.followLift(0, viewH, -289), 0);
  assert.equal(L.followLift(0, viewH, -300), 10);
  assert.equal(L.followLift(50, viewH, -300), 50, '下には戻さない');
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
  assert.equal(L.isOver([b.position.y]), false);
});

console.log(`\n${n} 件すべて合格`);

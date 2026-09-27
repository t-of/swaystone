// SWAYSTONE の決まりごと。画面（DOM）に触らない部分をここに集める。
// main.js（ブラウザ）と test.mjs（node）の両方から読む。
// 物理の体を作る makeBody だけは Matter を引数でもらう（node のテストでも同じ形を作れるように）。

// ---- 大きさと時間（世界の座標。幅 360 に固定し、画面に合わせて拡大・縮小して描く） ----
export const U = 22;                  // 長さの単位。表示では 1u = 10cm
export const WORLD_W = 360;
export const BASE = { w: 180, h: 16 };  // 土台。上面を y = 0 とする（下が +）
export const BASE_FROM_BOTTOM = 90;   // 初めの画面で、土台の上面は画面の下から 90
export const SPAWN_FROM_TOP = 40;     // 出てくるブロックは、画面の上から 40 より内側に
export const EDGE = 20;               // ブロックの左右は端から 20 の内側まで
export const FALL_LIMIT = 80;         // 中心が土台の上面より 80 下に来たら終わり
export const SPAWN_GAP = 110;         // 出てくるブロックの中心は、塔の上端から 110 上（立てた板でもぶつからない）
export const NEXT_DELAY = 650;        // ms。落としてから次が出るまで
export const OVER_DELAY = 400;        // ms。落ちてから結果を出すまで
export const SETTLE_TIME = 800;       // ms。高さに数えるのは落として 0.8 秒たち、
export const SETTLE_SPEED = 0.3;      //     速さが 0.3 未満、回る速さが SETTLE_SPIN 未満のものだけ
export const SETTLE_SPIN = 0.01;
export const STILL_TIME = 500;        // ms。全部がこれだけ止まっていたら高さを記録する
export const KEY_MOVE = 5;            // ← → で 1 フレームに動く量
export const ROT_STEP = Math.PI / 12; // ↺ ↻ を 1 回押すと 15°
export const ROT_SPEED = (120 * Math.PI) / 180;  // 押し続けると 1 秒に 120°
export const ROT_HOLD = 300;          // ms。これより長く押したら回り続ける

// ---- 材質と物理（遊んで調整する数値はここだけ） ----
// 本物より崩れにくくしてある: 摩擦を強く、空気の抵抗を大きく、重力を弱く、回りにくく（慣性 ×INERTIA）、止まったら眠らせる
export const MATERIALS = {
  wood:  { name: '木', note: 'ふつう', rate: 0.5, density: 0.0016, friction: 0.95, frictionStatic: 2.0 },
  stone: { name: '石', note: '重い',   rate: 0.3, density: 0.0024, friction: 1.00, frictionStatic: 3.0 },
  ice:   { name: '氷', note: 'すべる', rate: 0.2, density: 0.0011, friction: 0.45, frictionStatic: 0.9 },
};
const COMMON = { restitution: 0, frictionAir: 0.03, slop: 0.02 };
export const PHYSICS = { gravity: 0.6, inertia: 6, sleeping: true };

// ---- 形（ポリオミノ。正方形 3〜5 つをつないだ形） ----
// 当たり判定は正方形の部品を組むが、描くときは外側のふちだけにして一つの塊に見せる（マス目に見せない。docs/DECISIONS.md）
export const CELL = 20;
export const SHAPES = {
  I3: [[0, 0], [1, 0], [2, 0]],
  L3: [[0, 0], [1, 0], [0, 1]],
  I4: [[0, 0], [1, 0], [2, 0], [3, 0]],
  O4: [[0, 0], [1, 0], [0, 1], [1, 1]],
  T4: [[0, 0], [1, 0], [2, 0], [1, 1]],
  S4: [[1, 0], [2, 0], [0, 1], [1, 1]],
  L4: [[0, 0], [0, 1], [0, 2], [1, 2]],
  I5: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
  L5: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3]],
  Y5: [[0, 1], [1, 0], [1, 1], [1, 2], [1, 3]],
  N5: [[0, 0], [0, 1], [1, 1], [1, 2], [1, 3]],
  P5: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]],
  T5: [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]],
  U5: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
  V5: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]],
  W5: [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]],
  X5: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]],
  Z5: [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2]],
  F5: [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]],
};

// 正方形を部品にした 1 つの体。中心（重心）が (x, y) に来る
export function makeBody(M, shape, material, x, y) {
  const cells = SHAPES[shape];
  if (!cells) throw new Error(`知らない形: ${shape}`);
  const m = MATERIALS[material];
  const opt = () => ({ ...COMMON, density: m.density, friction: m.friction, frictionStatic: m.frictionStatic });
  const body = M.Body.create({
    ...opt(),
    parts: cells.map(([cx, cy]) => M.Bodies.rectangle(cx * CELL, cy * CELL, CELL, CELL, opt())),
  });
  M.Body.setInertia(body, body.inertia * PHYSICS.inertia);
  M.Body.setPosition(body, { x, y });
  return body;
}

// 形は等確率、材質は割合で、それぞれ独立に選ぶ
export function pickBlock(rand = Math.random) {
  const ids = Object.keys(SHAPES);
  const shape = ids[Math.min(ids.length - 1, Math.floor(rand() * ids.length))];
  let r = rand(), material = 'wood';
  for (const [id, m] of Object.entries(MATERIALS)) {
    material = id;
    if ((r -= m.rate) < 0) break;
  }
  return { shape, material };
}

export const clampX = (x) => Math.min(WORLD_W - EDGE, Math.max(EDGE, x));

// ---- 高さ・終わり・画面の追いかけ ----
// blocks: [{ droppedAt, speed, spin, top, y }]
//   top = 体のいちばん上の y、y = 中心の y、speed = 速さ、spin = 回る速さ（土台の上面が y = 0、上が −）

// 塔の今の上端の高さ（落として NEXT_DELAY たったものだけ。落ちている途中のものは数えない）
export function standHeight(blocks, now) {
  let h = 0;
  for (const b of blocks) if (now - b.droppedAt >= NEXT_DELAY) h = Math.max(h, -b.top);
  return h;
}

// 全部が止まっているか
export const allStill = (blocks, now) => blocks.length > 0 && blocks.every((b) =>
  now - b.droppedAt >= SETTLE_TIME && b.speed < SETTLE_SPEED && b.spin < SETTLE_SPIN);

// 高さの記録。全部が止まったまま STILL_TIME たったときの上端だけを数える
// （崩れる途中の一瞬の姿勢や、立てて落とした板が倒れる前の高さは記録しない）
// rec = { stillSince, height }。height は世界の長さ
export function updateRecord(rec, blocks, now) {
  if (!allStill(blocks, now)) return { stillSince: null, height: rec.height };
  // 止まりはじめたのは、いちばん新しいブロックが落ち着いた時より前にはならない
  const stillSince = Math.max(rec.stillSince ?? now, ...blocks.map((b) => b.droppedAt + SETTLE_TIME));
  if (now - stillSince < STILL_TIME) return { stillSince, height: rec.height };
  return { stillSince, height: Math.max(rec.height, ...blocks.map((b) => -b.top)) };
}

export const isOver = (blocks) => blocks.some((b) => b.y > FALL_LIMIT);

// 出てくる位置は、今の塔の上端から SPAWN_GAP 上（落ちる距離を短くして、ぶつかる勢いを弱める）
export const spawnYFor = (height) => -height - SPAWN_GAP;

// 画面を上げる量。出てくる位置が画面の上から SPAWN_FROM_TOP より内側に入るように。
// 今の高さから決めるので、塔が崩れて低くなれば下がる
export function cameraLift(viewH, height) {
  const camTop0 = BASE_FROM_BOTTOM - viewH;   // 上げていないときの画面の上端
  return Math.max(0, camTop0 - (spawnYFor(height) - SPAWN_FROM_TOP));
}

// 見える世界の高さがこれより小さくならないように縮尺を決める（横画面でも土台と出てくる位置が入る）
export const MIN_VIEW_H = 440;
export const viewScale = (cssW, cssH) => Math.min(cssW / WORLD_W, cssH / MIN_VIEW_H);

export const toU = (len) => Math.round((len / U) * 10) / 10;
export const heightText = (u) => `${(u / 10).toFixed(1)} m`;
export const shareText = (count, u) => `SWAYSTONE で ${count} 個つんだ（高さ ${heightText(u)}）`;

// ---- 自己ベスト（localStorage はほかのアプリと共有なので、キーは 'swaystone.' で始める） ----
export const BEST_KEY = 'swaystone.best';
// 旧名「ゆらづみ」からの引き継ぎ。新しいキーがまだなく、古いキーがあれば読んで書き写す（古いキーは消さない）
const OLD_BEST_KEY = 'yurazumi.best';
const num = (v) => (Number.isFinite(v) && v > 0 ? v : 0);

export function migrateKey(store, oldKey, newKey) {
  try {
    const s = store || localStorage;
    if (s.getItem(newKey) == null) {
      const old = s.getItem(oldKey);
      if (old != null) s.setItem(newKey, old);
    }
  } catch { /* 読み書きできなくても遊べる */ }
}

export function readBest(store) {
  migrateKey(store, OLD_BEST_KEY, BEST_KEY);
  try {
    const b = JSON.parse((store || localStorage).getItem(BEST_KEY));
    if (b && b.v === 1) return { v: 1, count: num(b.count), height: num(b.height) };
  } catch { /* 読めなければ 0 から */ }
  return { v: 1, count: 0, height: 0 };
}

export function writeBest(best, store) {
  try { (store || localStorage).setItem(BEST_KEY, JSON.stringify(best)); } catch { /* 保存できなくても遊べる */ }
}

// 1 回分の結果を記録に合わせる。newCount / newHeight は更新したかどうか
export function mergeBest(best, count, height) {
  return {
    best: { v: 1, count: Math.max(best.count, count), height: Math.max(best.height, height) },
    newCount: count > best.count,
    newHeight: height > best.height,
  };
}

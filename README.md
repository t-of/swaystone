# SWAYSTONE — 木と石と氷を積むタワー

（読み: スウェイストーン。旧名 ゆらづみ）

木・石・氷のブロックを落として、土台の上に高く積み上げる。材質で重さとすべりやすさが違い、物理でゆれて崩れる。

## 🔗 リンク

- 遊ぶ: https://t-of.github.io/swaystone/
- 制作: [T.OF...](https://t-of.github.io/)

## 遊び方

1. 上にブロックが 1 つ出る。画面をなぞって左右に動かし、↺ ↻ で回して、「落とす」で落とす。
2. ブロックは物理で転がったり、すべったり、傾いたりする。**木**はふつう、**石**は重くて止まりやすい、**氷**は軽くてすべる。
3. 1 つでも土台から落ちたら終わり。落とした数と高さ（m）が記録になる。

形は いた・まるいし・くさび・はんげつ・ろっかく・ほね の 6 種類。

| 操作 | スマホ | PC |
|---|---|---|
| 左右に動かす | ステージをなぞる | ← → |
| 回す | ↺ ↻（押し続けると回り続ける） | ↑ ↓ |
| 落とす | 「落とす」 | Space / Enter |

## アプリとして入れる（PWA）

- iPhone / iPad: Safari で開き、共有 → 「ホーム画面に追加」
- Android / PC の Chrome・Edge: 画面の「アプリにする」ボタン、またはアドレスバーのインストールボタン

一度開けば、オフラインでも遊べます。

## 開発

ビルド不要。フォルダをそのまま静的サーバで開く。

```sh
python3 -m http.server 8000   # → http://localhost:8000/
node test.mjs                 # 形・高さ・終わりの判定・記録のテスト（Node 22 以降）
```

| ファイル | 中身 |
|---|---|
| `logic.js` | 数値・材質・形の作り方・高さと終わりの判定・記録の読み書き（DOM に触らない） |
| `main.js` | 画面・操作・描画、物理とのつなぎ |
| `vendor/matter.min.js` | 物理エンジン [Matter.js](https://brm.io/matter-js/) 0.20.0（npm のビルド済みファイル） |

- 材質の重さ・すべりやすさは `logic.js` の `MATERIALS` にまとめてある。
- 記録は端末内の `localStorage` の `swaystone.best`（`{ v: 1, count, height }`、height は 1u = 22 の単位）。
  旧名「ゆらづみ」時代の `yurazumi.best` / `yurazumi.sound` があれば、初回起動時に読んで新しいキーに引き継ぐ（`logic.js` の `migrateKey`）。

## ライセンス表記

- 物理に Matter.js（MIT）を使用。Copyright (c) Liam Brummitt and contributors. 全文は [`vendor/matter-js-LICENSE.txt`](vendor/matter-js-LICENSE.txt)。

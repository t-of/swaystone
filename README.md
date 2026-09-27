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

タイトルで 3 つから選べる。

- **ひとりで**: 今までどおり。1 つでも土台から落ちたら終わり、記録が自己ベストになる。
- **ふたりで（この端末）**: 同じ塔に交互に 1 個ずつ落とす。落としたブロックが原因で 1 つでも落ちたら、最後に落とした人の負け。端末を回して交代するだけで、確認画面はない。
- **オンライン（合言葉）**: 「部屋を作る」で出る 4 桁の合言葉を、遠くにいる相手に伝えて対戦する。「部屋に入る」で合言葉を入れるか、共有されたリンク（`?room=1234`）を開く。
  相手の端末と直接つながる（相手にこちらの IP アドレスが伝わる）。会社や学校の回線などでは、つながらないことがある。

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
| `logic.js` | 数値・材質・形の作り方・高さと終わりの判定・記録の読み書き・二人対戦のメッセージの形（DOM に触らない） |
| `main.js` | 画面・操作・描画、物理とのつなぎ、PeerJS のオンライン対戦 |
| `vendor/matter.min.js` | 物理エンジン [Matter.js](https://brm.io/matter-js/) 0.20.0（npm のビルド済みファイル） |
| `vendor/peerjs.min.js` | オンライン対戦の通信 [PeerJS](https://peerjs.com/) 1.5.5（npm のビルド済みファイル） |

- 材質の重さ・すべりやすさは `logic.js` の `MATERIALS` にまとめてある。
- 記録は端末内の `localStorage` の `swaystone.best`（`{ v: 1, count, height }`、height は 1u = 22 の単位）。二人対戦では自己ベストを更新しない。
  旧名「ゆらづみ」時代の `yurazumi.best` / `yurazumi.sound` があれば、初回起動時に読んで新しいキーに引き継ぐ（`logic.js` の `migrateKey`）。
- オンライン対戦は物理をホストの端末だけで動かし、ゲストの端末には位置・角度を送って描くだけにしている（`main.js`）。
  シグナリングは PeerJS の公開サーバ（既定の `0.peerjs.com`）、STUN も既定のまま、TURN は使わない。部屋の peer id は `tof-swaystone-<4 桁の合言葉>`。
  送り合うメッセージの形とチェックは `logic.js` の `parseMsg`（型が違う・知らない値は捨てる）。

## ライセンス表記

- 物理に Matter.js（MIT）を使用。Copyright (c) Liam Brummitt and contributors. 全文は [`vendor/matter-js-LICENSE.txt`](vendor/matter-js-LICENSE.txt)。
- オンライン対戦の通信に PeerJS（MIT）を使用。Copyright (c) 2015 Michelle Bu and Eric Zhang, http://peerjs.com 。全文は [`vendor/peerjs-LICENSE.txt`](vendor/peerjs-LICENSE.txt)。

# 星星守護號

親子向直向射擊遊戲原型。玩家駕駛可愛玩具科幻飛船，在 3 分鐘內自動鎖定敵人、發射多枚飛彈、使用向前方照射的雷射光束，並靠 12 邊形半透明防護罩保護自己。

這個版本沒有死亡、沒有 Game Over，適合小孩子玩樂。結束時會顯示分數與獎章。

背景使用流動星系與星雲帶，讓飛船有持續向前飛行的速度感。

## 遊玩方式

- 方向鍵：移動飛機
- `A`：向前方發射雷射光束，光束上的敵人會被消滅
- `S`：發射鎖定飛彈
- 敵人接近時：自動展開 12 邊形防護罩
- 子彈靠近時：自動展開 12 邊形防護罩格擋

## 本機開始

需要先安裝 Node.js。

```bash
npm install
npm run dev
```

打開終端機顯示的網址，通常是：

```text
http://127.0.0.1:5173
```

如果網站打不開，通常是 dev server 沒有在跑。請重新執行：

```bash
npm run dev
```

在 Windows PowerShell 如果 `npm` 被執行政策擋住，可以改用：

```bash
npm.cmd run dev
```

## 打包

```bash
npm run build
```

輸出會放在 `dist/`。

## GitHub Pages

這個專案已包含 GitHub Pages workflow。推到 GitHub 後，到 repo 的：

```text
Settings -> Pages -> Build and deployment -> Source
```

選擇 `GitHub Actions`。之後每次 push 到 `main` 都會自動部署。

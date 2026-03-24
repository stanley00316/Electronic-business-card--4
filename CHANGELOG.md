# 變更紀錄

## 2026-03-24

### 清理與部署

- 移除未納入導覽與 Service Worker 的 `debug_jwt.html`（JWT 驗證請改以 Supabase Dashboard 或本機工具處理，避免多一處金鑰相關靜態頁）。
- `CACHE_VERSION` 遞增至 `v1.21.1`；重新執行 `npm run build:static` 產出 `cloud.js` / `common.js`。

### 前端模組化（每個原始 .js 檔 ≤900 行）

- **雲端模組**：新增 `js/cloud/`（常數、HTTP、客戶端、JWT、Session、LINE/LIFF、Google/Apple OAuth、名片與推薦、管理員、搜尋與儲存、合規／匯出／診斷、訂閱與金流），由 `js/cloud/index.js` 組裝 `window.UVACO_CLOUD`；公開 API 補上 `setCustomJwt` 以相容 `auth.html`。
- **部署用 bundle**：根目錄 `cloud.js`、`common.js` 改由 **esbuild** 自模組入口打包為 IIFE（`npm run build:static`），維持既有 `<script src>` 同步載入與內聯 `onclick` 行為。
- **共用模組**：新增 `js/common/`（SW 更新監聽、底部導覽觸覺回饋、Sentry、Analytics、主題／語言、懶載入、圖片壓縮、編輯頁聯絡版型、名片主題初始化）；**修正**無 `.bottom-nav` 時每 500ms 無限 `setTimeout` 重試改為僅在存在導覽列時綁定，並加一次延遲重試。
- **頁面腳本**：`index`、`auth`、`settings`、`my-card` 改為 `type="module"` 入口 `js/pages/*/main.js`；`directory` 拆為 `directory-a.js` / `directory-b.js`（經典腳本、維持全域 `onclick`）；`card.html` 外置 `card-page.js` 並改為**點選 QR 時**才動態載入 qrcodejs；`edit.html` 主樣式抽出為 `css/edit-head.css`、精靈樣式為 `css/edit-wizard.css`，主邏輯拆為 `edit-chunk-1.js`～`5` 與 `wizard.js`、`goto-my-card.js`。
- **Service Worker**：`CACHE_VERSION` 遞增至 `v1.21.0`；`STATIC_ASSETS` 增補 `my-card.html`、`subscription.html`、`admin.html`、`company-admin.html` 與編輯頁 CSS；`isStaticAsset` 納入 `/js/cloud/`、`/js/common/`、`/js/pages/` 與 `/css/edit-` 路徑以利離線快取。

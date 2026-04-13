# 變更紀錄


## 2026-04-13

### 修正（通訊錄腳本編碼）

- **平台通訊錄**：修正 `js/pages/directory/directory-a.js` 與 `directory-b.js` 因 `safeSlug` 被拆成兩個檔案而各自無法解析的問題；並清理註解中因編碼損壞導致的亂碼與語法錯誤。已在 `directory-a.js` 補齊完整 `safeSlug`，移除 `directory-b.js` 開頭重複片段，並重新執行 `npm run build:static` 產出 `cloud.js`。

- **通訊錄列表**：雲端名片搜尋結果（仍排除本人，避免與上方「我的名片」重複）合併「+ 新增好友」寫入 localStorage（directoryFriends）的本機聯絡人；列表顯示電話、Email，並標示為手動儲存（無線上名片預覽）。
- **空狀態說明**：若平台上只有自己一張名片且無本機聯絡人，改為清楚說明原因（非資料消失），透過 emptyHint 與 directory-b.js 的 updateDirectoryResults 搭配。
- **程式結構**：getStoredFriends / setStoredFriends 集中於 directory-a.js（先載入），directory-b.js 移除重複定義；directory.html 腳本版本改為 v=20260413a。
- **預覽按鈕**：修正誤用 Python 格式 `\\U0001f440`（JavaScript 不支援）導致畫面顯示 `U0001f440` 文字而非圖示；改為 ES6 `\\u{1F440}` 以正確顯示眼睛圖示。
- **編碼設定**：新增 `.editorconfig`與 `.vscode/settings.json`，統一以 UTF-8 開啟與儲存檔案，降低 Cursor 或其他編輯器誤判編碼導致的亂碼。
## 2026-03-24

### 偵錯

- `auth.html` 登入／註冊流程加入執行期追蹤，量測 `bootstrap -> LIFF 自動登入 -> LINE callback code 交換 -> session 判定` 各階段耗時，並在登入頁顯示臨時 timing 面板，供手機端直接觀察慢點位置。

### 清理與部署

- 移除未納入導覽與 Service Worker 的 `debug_jwt.html`（JWT 驗證請改以 Supabase Dashboard 或本機工具處理，避免多一處金鑰相關靜態頁）。
- `CACHE_VERSION` 遞增至 `v1.21.1`；重新執行 `npm run build:static` 產出 `cloud.js` / `common.js`。

### 前端模組化（每個原始 .js 檔 ≤900 行）

- **雲端模組**：新增 `js/cloud/`（常數、HTTP、客戶端、JWT、Session、LINE/LIFF、Google/Apple OAuth、名片與推薦、管理員、搜尋與儲存、合規／匯出／診斷、訂閱與金流），由 `js/cloud/index.js` 組裝 `window.UVACO_CLOUD`；公開 API 補上 `setCustomJwt` 以相容 `auth.html`。
- **部署用 bundle**：根目錄 `cloud.js`、`common.js` 改由 **esbuild** 自模組入口打包為 IIFE（`npm run build:static`），維持既有 `<script src>` 同步載入與內聯 `onclick` 行為。
- **共用模組**：新增 `js/common/`（SW 更新監聽、底部導覽觸覺回饋、Sentry、Analytics、主題／語言、懶載入、圖片壓縮、編輯頁聯絡版型、名片主題初始化）；**修正**無 `.bottom-nav` 時每 500ms 無限 `setTimeout` 重試改為僅在存在導覽列時綁定，並加一次延遲重試。
- **頁面腳本**：`index`、`auth`、`settings`、`my-card` 改為 `type="module"` 入口 `js/pages/*/main.js`；`directory` 拆為 `directory-a.js` / `directory-b.js`（經典腳本、維持全域 `onclick`）；`card.html` 外置 `card-page.js` 並改為**點選 QR 時**才動態載入 qrcodejs；`edit.html` 主樣式抽出為 `css/edit-head.css`、精靈樣式為 `css/edit-wizard.css`，主邏輯拆為 `edit-chunk-1.js`～`5` 與 `wizard.js`、`goto-my-card.js`。
- **Service Worker**：`CACHE_VERSION` 遞增至 `v1.21.0`；`STATIC_ASSETS` 增補 `my-card.html`、`subscription.html`、`admin.html`、`company-admin.html` 與編輯頁 CSS；`isStaticAsset` 納入 `/js/cloud/`、`/js/common/`、`/js/pages/` 與 `/css/edit-` 路徑以利離線快取。

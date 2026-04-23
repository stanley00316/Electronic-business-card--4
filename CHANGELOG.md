# 變更紀錄

## 2026-04-23

### 修正（編輯頁聯絡方式刪除按鈕）

- **`js/pages/edit/edit-chunk-1.js`**：刪除按鈕事件改為「先呼叫既有 `deleteContactButton`，若函式不存在就直接走內建刪除流程」，避免出現 `deleteContactButton is not defined` 後無法刪除。
- **除錯追蹤**：補上 `run-3 / H11~H13` 執行期日誌，記錄「啟用備援、刪除前數量、刪除後數量」，方便快速確認部署站行為。


## 2026-04-14

### 調整（名片開啟統計：本人開啟也計入）

- **`getCardPublic`（`js/cloud/cards-referrals-nfc.js`）**：啟用 `trackView` 時，本人預覽自己的名片也會寫入 `card_views`，後台「最後開啟／次數」與訪客開啟一併統計。
- **`admin.html`**：姓名下方文案由「最後開啟（他人）」改為「最後開啟」；`cloud.js` 查詢參數改為 `?v=20260414b`。
- **資料庫註解**：`card_view_summaries_admin_rpc.sql` 頂部說明已改為與上述語意一致（RPC 本體無需重跑）。
- **快取**：已執行 `npm run build:cloud` 更新根目錄 `cloud.js`；`service-worker.js` 的 `CACHE_VERSION` 為 `v1.21.8`。

### 新增（後台姓名可直接開啟名片）

- **`admin.html`**：名片管理列表的「姓名」改為可點擊連結，管理員可直接開啟該人的 `card.html?id=<user_id>`，不必再先按「複製連結」。
- **互動樣式**：補上姓名連結的滑過與鍵盤焦點樣式，桌機與手機窄版都更容易辨識可點擊區塊。
- **顯示安全性**：姓名文字先做基本字元轉換，避免特殊符號破壞畫面結構。

### 修正（後台模式切換：名片管理 / 訂閱管理）

- **`admin.html`**：修正切回「📋 名片管理」時可能出現「表頭已回名片、但列表仍停留訂閱資料」的問題。主因是 `reloadData` 內使用未定義的 `list` 導致重載中斷，現在已改為安全使用 `rows` 並正常渲染名片列表。
- **除錯保護**：在 `reloadData` 包裝流程補上錯誤追蹤，若切回名片時重載失敗，會留下可追蹤日誌，方便快速定位問題。
- **持續追查（欄位對不上）**：加上 `reloadData` 內「名片開啟統計 RPC 呼叫前/後/失敗」與 `loadSubscriptions` 入口日誌，用來確認是否因統計 RPC 失敗或非預期流程導致表頭與列資料不同步。

### 移除（設定頁：名片瀏覽統計區塊）

- **settings.html**：已移除「名片瀏覽統計」區塊（`viewStatsItem`）。
- **腳本**：`js/pages/settings/main.js` 已移除 `loadViewStats`、`phraseSinceLastView` 及對 `getCardViewStats` 的呼叫（雲端仍保留 `getCardViewStats` 供後台等用途）。
- **註解**：`cards-referrals-nfc.js` 中 `lastViewedAt` 查詢說明改為供後台或報表使用。
- **快取**：`settings.html` 腳本版本 `?v=20260413f`；`service-worker.js` 的 `CACHE_VERSION` 為 `v1.21.7`。

### 新增（後台名片列表：他人開啟時間與次數）

- **管理表格**：`admin.html` 在每位使用者姓名下方顯示開啟時間與「次數」（初版文案為「最後開啟（他人）」；後續已改為含本人開啟，見同日「調整（名片開啟統計：本人開啟也計入）」）。
- **前端**：`js/cloud/admin-operations.js` 新增 `getCardViewSummariesForAdmin`，呼叫 RPC `get_card_view_summaries_for_admin`；`js/cloud/index.js` 掛載並已執行 `npm run build:cloud` 更新 `cloud.js`。
- **資料庫**：新增腳本 [card_view_summaries_admin_rpc.sql](card_view_summaries_admin_rpc.sql)，請在 Supabase SQL Editor 執行後，後台統計才會有正確數據（未執行前 RPC 失敗時畫面仍顯示次數 0、尚無紀錄）。
- **快取**：`admin.html` 的 `cloud.js` 查詢參數改為 `?v=20260414a`。


## 2026-04-13

### 調整（統一 JSON 為 UTF-8 宣告）

- **Edge Functions**：Stripe、LINE Pay 等支付與核查相關函式的 JSON 回應，`Content-Type` 一律為 `application/json; charset=utf-8`；Google、Apple、LINE 授權相關函式對 Supabase 的 POST 亦同。
- **前端**：`js/cloud/subscription.js`、`subscription.html` 送出 JSON 時同步標明 `charset=utf-8`。
- **雲端模組**：`line-liff.js`、`search-storage.js`、`oauth-google-apple.js` 對 Supabase／外部 API 的 JSON 請求標頭同步加上 `charset=utf-8`。
- **除錯探針**：`js/cloud/index.js` 的 ingest 請求已將 `runId` 設為 `post-fix`；請重新執行 `npm run build:cloud` 以更新根目錄的 `cloud.js`。


### 新增（設定頁：名片最後被瀏覽／多久未被開）

- **瀏覽統計**：`settings.html` 的「名片瀏覽統計」會顯示最後一次被他人瀏覽的時間，以及「多久沒有新的瀏覽」白話說明（中／英）；若尚無紀錄則顯示對應提示。
- **統計資料**：`getCardViewStats` 會多回傳 `lastViewedAt`（全期間最後一筆 `card_views.viewed_at`）。
- **本人不自灌次數**：`getCardPublic` 在開啟追蹤時，若目前登入者就是名片擁有者，不再寫入 `card_views`，避免自己開自己名片灌高瀏覽次數。
- **快取**：`cloud.js`／`common.js` 查詢參數 `?v=20260413d`；`card.html` 與 `settings.html`（含 `js/pages/settings/main.js`）腳本版本同步；`service-worker.js` 的 `CACHE_VERSION` 為 `v1.21.5`。

### 新增（後台減少訂閱）

- **訂閱管理**：`admin.html` 在每筆可操作訂閱新增「減少訂閱」按鈕，管理員可直接輸入要扣除的天數，並沿用同一個彈窗完成操作。
- **扣天數規則**：`js/cloud/subscription.js` 新增 `reduceSubscription`，會先做管理員與公司範圍權限檢查，再扣除天數；若扣完已到期，系統會自動改成停用狀態並隱藏名片。
- **雲端 API**：`js/cloud/index.js` 已掛載 `reduceSubscription`，讓後台頁面可直接呼叫。

### 修正（後台訂閱搜尋）

- **`admin.html`**：在「訂閱管理」模式下，搜尋欄改為篩選 `subscriptionData` 並呼叫 `renderSubscriptionTable`，不再誤用名片用的 `allData` + `renderTable`（避免一輸入搜尋就跳回名片管理表頭與列表）。

### 修正（名片頁 QR、瀏覽紀錄）

- **QR Code**：`card.html` 補齊與 `js/pages/card/card-page.js` 相同的 `loadQRCodeScript`，並將 `showQRCode` 改為 `async`，點選時才動態載入 cdnjs 的 qrcodejs，修正線上 `QRCode is not defined`。
- **card_views**：`recordCardView` trim `card_user_id`；僅在有值時寫入 `referrer` / `user_agent`（並限長度）；`viewed_at` 交由資料庫預設，降低與遠端 schema 不一致時的 400；失敗時 console 顯示較具體的訊息。
- **快取**：`cloud.js` 查詢參數 `?v=20260413d`；`service-worker.js` 的 `CACHE_VERSION` 遞增至 `v1.21.5`。

### 修正（通訊錄腳本編碼）

- **平台通訊錄**：修正 `js/pages/directory/directory-a.js` 與 `directory-b.js` 因 `safeSlug` 被拆成兩個檔案而各自無法解析的問題；並清理註解中因編碼損壞導致的亂碼與語法錯誤。已在 `directory-a.js` 補齊完整 `safeSlug`，移除 `directory-b.js` 開頭重複片段，並重新執行 `npm run build:static` 產出 `cloud.js`。

- **通訊錄列表**：雲端名片搜尋結果（仍排除本人，避免與上方「我的名片」重複）合併「+ 新增好友」寫入 localStorage（directoryFriends）的本機聯絡人；列表顯示電話、Email，並標示為手動儲存（無線上名片預覽）。
- **空狀態說明**：若平台上只有自己一張名片且無本機聯絡人，改為清楚說明原因（非資料消失），透過 emptyHint 與 directory-b.js 的 updateDirectoryResults 搭配。
- **程式結構**：getStoredFriends / setStoredFriends 集中於 directory-a.js（先載入），directory-b.js 移除重複定義；directory.html 腳本版本改為 v=20260413a。
- **預覽按鈕**：修正誤用 Python 格式 `\\U0001f440`（JavaScript 不支援）導致畫面顯示 `U0001f440` 文字而非圖示；改為 ES6 `\\u{1F440}` 以正確顯示眼睛圖示。
- **編碼設定**：新增 `.editorconfig`與 `.vscode/settings.json`，統一以 UTF-8 開啟與儲存檔案，降低 Cursor 或其他編輯器誤判編碼導致的亂碼。
- **除錯清理**：移除 `line-liff.js` 與 `auth/main.js` 對本機 `127.0.0.1:7665` ingest 的追蹤請求；登入頁仍可透過底部面板與 localStorage 查看時間軸。
- **對話框亂碼修正**：`card.html` 與 `js/pages/card/card-page.js` 的「加入主畫面」說明文字，將 `📱`、`⋮` 這類在部分手機原生對話框可能顯示為 `�` 的符號改成純文字（如「三點」），避免開啟新介面提示時出現亂碼。
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

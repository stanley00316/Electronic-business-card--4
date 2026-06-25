# 變更紀錄

## 2026-06-25（公開名片新增加入手機通訊錄）

### 新功能（客戶一鍵保存聯絡人）

- **加入通訊錄按鈕**：公開名片頁新增「加入通訊錄」功能，朋友或客戶點擊後會產生 `.vcf` 通訊錄檔。
- **跨手機系統**：支援 iPhone / Android 以手機內建流程新增聯絡人；最後是否存入仍由手機系統跳出確認。
- **資料盡量完整**：VCF 會帶入姓名、公司、職稱、電話、Email、網址、電子名片連結、社群連結、地址與備註。
- **安全範圍**：不改 Supabase、不改資料表、不改 NFC 或既有分享網址，客戶公開瀏覽仍不需要 LINE 登入。
- **快取更新**：`service-worker.js` 版本升為 `v1.34.0`。

## 2026-06-25（手機主畫面開啟名片免重登）

### 調整（低風險 PWA 入口）

- **修正 LINE 自動登入閃爍**：手機主畫面/PWA 圖示開啟時，若尚未記住名片 ID，不再自動跳 LINE 登入，改停在穩定提示畫面並提供「登入一次」按鈕。
- **登入頁不再自動啟動 LINE**：`auth.html?next=my-card.html` 會等待使用者手動點「用 LINE App 開啟」，避免 LINE App 與 PWA 反覆跳轉。
- **過期登入也可開公開名片**：若手機仍保留舊 LINE 登入 token，主畫面入口會讀取其中的使用者 ID，直接開公開名片；此 ID 只用於公開瀏覽，不放寬編輯權限。
- **主畫面快速開啟**：使用者已登入並查看自己的名片時，系統會在手機本機記住自己的公開名片 ID。
- **免重複 LINE 登入**：從手機主畫面/PWA 圖示開啟 `my-card.html` 時，若 LINE 登入已過期但本機有記住名片 ID，會直接開公開名片頁 `card.html?id=...`。
- **客戶體驗不變**：客戶掃 NFC 或開分享連結 `card.html?id=...` / `card.html?nfc=...` 仍是公開瀏覽，不需要 LINE 登入。
- **權限不放寬**：一般瀏覽器開 `my-card.html` 仍維持 LINE 登入；編輯名片、設定、通訊錄與後台管理也仍需登入。
- **快取更新**：`my-card.html` 與 `auth.html` 的入口腳本版本升為 `20260625b`，`service-worker.js` 版本升為 `v1.33.1`。

## 2026-06-10（LINE 登入改為 LINE App 優先）

### 維護（低風險登入體驗）

- **LINE App 優先**：手機點「用 LINE App 開啟」時，先嘗試開啟 LIFF URL，讓使用者直接進 LINE App 自動登入。
- **QR Code 備援**：若手機沒有成功開啟 LINE App，約 2 秒後自動改用既有 LINE QR Code 登入；桌機仍維持 QR Code 登入。
- **導向保留**：補上 `liff.state` 的 `next` 讀取，避免從 LINE App 回來後丟失原本要前往的頁面。
- **安全範圍**：不改 Supabase 專案、不改資料表、不改 NFC `card.html?id=...` 或 `card.html?nfc=...` 路徑。
- **快取更新**：`auth.html` 登入資源版本升為 `20260610g`，`service-worker.js` 版本升為 `v1.32.0`。

## 2026-06-10（company-admin.html 重構為完整企業管理中心）

### 重大改版（`company-admin.html`）

整合所有企業管理功能至同一頁面，改為三個頁籤：

| 頁籤 | 功能 |
|------|------|
| 👥 員工管理 | 員工列表、搜尋篩選、新增邀請、編輯資料、停用/啟用、NFC 管理（標記/移交）、匯出 CSV |
| 👮 管理員設定 | 新增/編輯/刪除本公司管理員（原有功能） |
| ⚙️ 公司設定 | 鎖定員工不可編輯的欄位（原在 enterprise.html） |

- **企業管理員**進入後，公司名稱自動帶入並鎖定，只能操作本公司員工及管理員
- **超級管理員**進入後，可管理所有公司資料
- `service-worker.js` 版本升為 `v1.30.0`

---

## 2026-06-10（企業主控台新增「編輯員工資料」功能）

### 新功能（`enterprise.html`）

- **新增「編輯」按鈕**：員工列表的操作欄加入「編輯資料」按鈕（桌機表格與手機卡片均有），點擊後彈出編輯 Modal。
- **編輯員工 Modal**：可修改員工的姓名、職稱、部門、公司、Email、電話。企業管理員的公司欄位自動鎖定為自己的公司。儲存後即時生效並重新載入列表。

### 修復（`js/cloud/admin-operations.js`）

- `adminUpdateCard()` 補上 `department` 欄位（原本沒有同步寫入部門）
- 企業管理員編輯員工時，若員工名片公司尚未填寫（邀請剛建立）不再被擋住
- `cloud.js` 重新打包，`service-worker.js` 版本升為 `v1.29.0`

---

## 2026-06-10（企業管理員可新增本公司管理員）

### 修復（關鍵 BUG 修復）

- **修復「新增失敗：RLS 違規」**：資料庫 `admin_users` 表缺少寫入 RLS 政策，INSERT 被 Supabase 拒絕。已新增 `admin_users_write` 政策，允許管理員寫入。（migration `20260609185635_fix_admin_users_rls_write.sql`）
- **修復企業管理員無法新增管理員**：`upsertAdminUser()` 原本只允許超管呼叫，企業管理員一律被擋。現改為：
  - 企業管理員可新增**本公司管理員**（`target_company` 強制等於自己的公司）
  - 企業管理員不能新增超管（`target_company` 不能為 NULL）
  - 超管不受限制
- **修復企業管理員刪除管理員**：`deleteAdminUser()` 同樣僅允許超管，改為企業管理員可刪除本公司管理員（先查 `target_company` 確認歸屬，不符合則拒絕）。
- `cloud.js` 重新打包，`service-worker.js` 版本升為 `v1.28.0`

---

## 2026-06-10（新增管理員選擇器優化）

### 功能改善（`company-admin.html`）

- **新增管理員改用可搜尋下拉選擇器**：原本需手動貼上 UUID，現在改為搜尋框 + 下拉人員清單，可輸入姓名、公司、職稱即時篩選，選取後顯示確認提示。
- **管理員列表顯示姓名**：原本只顯示 UUID，現在對應 `allCards` 資料顯示員工姓名，一目了然。
- **修正 bug**：`getAdminUsers()` 回傳結果由 `result.admins` 修正為 `result.rows`（與實際 API 一致）。
- **同時載入名片人員**：`reloadData()` 改為同時呼叫 `getAllCardsAdmin()` 取得人員清單供搜尋使用。
- `service-worker.js` CACHE_VERSION 升級為 `v1.24.0`

---

## 2026-06-10（企業管理系統 Phase 1）

### 新功能（企業管理後台）

- **新增 `enterprise.html`（企業主控台）**：企業管理員專屬的員工名片儀表板，可查看全公司員工姓名、職稱、部門、啟用狀態、NFC 狀態、瀏覽次數。支援搜尋、部門/NFC/狀態篩選、批次匯出 CSV（含 UTF-8 BOM 支援 Excel 中文）。
- **員工停用功能**：管理員可一鍵停用（含填寫停用原因）或重新啟用員工名片，獨立於訂閱的 `is_visible`，不影響現有訂閱邏輯。停用後 NFC 網址不變，但名片頁顯示「此名片已停用」提示頁（含公司名稱與官網連結）。
- **NFC 狀態管理**：新增 `nfc_status` 欄位（未綁定 / 已綁定 / 已停用 / 遺失），管理員可透過下拉選單切換狀態，已有 NFC 的名片自動補標 `bound`。
- **NFC 一鍵移交**：離職員工的 NFC 卡可直接移交給指定新員工，解除來源綁定並同步更新目標員工狀態，移交失敗自動回滾。
- **`card.html` 停用提示頁**：名片被管理員停用（`admin_disabled = true`）時，NFC 掃描仍導到同一個網址，但顯示「此名片已停用」頁而非個人資料，避免離職員工資訊外流。

### 資料庫（需在 Supabase 執行 `enterprise-phase1.sql`）

- `cards` 表新增欄位：`admin_disabled`、`admin_disabled_by`、`admin_disabled_at`、`admin_disabled_reason`、`nfc_status`、`department`
- 新增 `trg_sync_nfc_status` trigger：設定 `nfc_card_id` 時自動同步 `nfc_status`
- 現有已綁定 NFC 的名片自動補上 `nfc_status = 'bound'`

### JS 新增函式（`js/cloud/admin-operations.js`）

- `disableEmployeeCard(userId, reason)` — 停用員工名片
- `enableEmployeeCard(userId)` — 重新啟用
- `updateNfcStatus(userId, status)` — 手動更新 NFC 狀態
- `transferNfcCard(fromUserId, toUserId)` — NFC 一鍵移交

### 其他

- `service-worker.js` CACHE_VERSION 升級為 `v1.23.0`，新增 `enterprise.html` 至快取清單

---

## 2026-06-10

### 維護（低風險清理與免密登入）

- **正式環境除錯清理**：移除 `card.html`、`admin.html`、`js/cloud/index.js` 與編輯頁腳本中殘留的本機除錯請求，避免正式使用者瀏覽時多送失敗請求。
- **登入頁體驗**：LINE 登入改為優先顯示 QR Code 掃碼登入，並隱藏帳密登入切換；登入頁文案同步改成「用 LINE App 自動登入或掃 QR Code」，降低使用者忘記 LINE 帳密的問題。
- **登入除錯面板**：`auth.html` 底部除錯面板改為只在本機或網址帶 `?debugAuth=1` 時顯示，正式使用者預設不再看到開發資訊。
- **文件與 404**：README 改為電子名片 V5 說明，保留目前線上路徑 `Electronic-business-card--4` 的提醒，避免誤改已發 NFC 連結；補回 `404.html`，找不到頁面時可回首頁、通訊錄或登入頁。
- **編輯頁拆檔**：將原本集中在 `edit-chunk-2.js` 的大型編輯邏輯依功能拆回 `edit-chunk-2/3/4/5.js`，維持既有載入順序與全域函式名稱，不改名片資料格式。
- **重複檔清理**：刪除未被 `card.html` 載入的 `js/pages/card/card-page.js`，避免名片頁維護時出現兩份邏輯。
- **快取更新**：頁面資源版本統一為 `20260610a`，`service-worker.js` 的 `CACHE_VERSION` 升級為 `v1.22.0`，確保部署後使用者可拿到新版檔案。

## 2026-04-23

### 修正（編輯頁聯絡方式刪除按鈕）

- **`js/pages/edit/edit-chunk-1.js`**：刪除按鈕事件改為「先呼叫既有 `deleteContactButton`，若函式不存在就直接走內建刪除流程」，避免出現 `deleteContactButton is not defined` 後無法刪除。
- **除錯追蹤**：補上 `run-3 / H11~H13` 執行期日誌，記錄「啟用備援、刪除前數量、刪除後數量」，方便快速確認部署站行為。
- **快取更新**：`edit.html` 的 `cloud/common/edit-chunk` 與 `edit-head/edit-wizard` 版本參數升級為 `20260423a`，`service-worker.js` 的 `CACHE_VERSION` 升級為 `v1.21.9`，避免部署站持續讀到舊版刪除邏輯。
- **核心修復（`saveCard is not defined`）**：將原本被錯位切割的 `edit-chunk-2/3/4/5.js` 重新合併為可執行腳本（主邏輯集中於 `edit-chunk-2.js`），`edit-chunk-3/4/5.js` 改為安全佔位檔，並移除 `wizard.js` 外層 `<script>` 包裝，修正前端語法錯誤連鎖造成的功能遺失。
- **二次快取強制更新**：`edit.html` 腳本與樣式版本再次升級為 `20260423b`，`service-worker.js` 的 `CACHE_VERSION` 升級為 `v1.21.10`，確保用戶端一定拿到本次 chunk 修正版。


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

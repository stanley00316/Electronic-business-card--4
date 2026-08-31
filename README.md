# 電子名片 V5（GitHub Pages + Supabase 部署版）

此專案前台是**純靜態網站**（HTML/CSS/JS/Assets），部署在 **GitHub Pages**；登入、名片資料、Storage、訂閱與後台資料使用 **Supabase**。

> 重要：目前線上網址仍使用既有 repo 路徑 `Electronic-business-card--4`。這是為了保留已發出去 NFC 名片的舊連結，不要任意改 GitHub repo 名稱或 `card.html?id=...` 網址規則。

### 原始碼結構與建置

- **模組約定**：`js/cloud/*.js`、`js/common/*.js` 與 `js/pages/**/*.js` 等**原始檔**維持每檔約 **≤900 行**，方便維護。
- **編輯頁拆分**：`edit.html` 會依序載入 `js/pages/edit/edit-*.js`；微信輸入整理、文字樣式工具列與標語管理已拆成小檔，避免主編輯檔過長。
- **根目錄 `cloud.js` / `common.js`**：為 **esbuild** 由 `js/cloud/index.js`、`js/common/index.js` 打包產生的 **IIFE**（已 minify）。修改雲端或共用邏輯後請執行：
  - `npm install`（僅需一次，安裝開發依賴）
  - `npm run build:static`
- 再將變更推送至遠端以完成部署。

## 部署方式（GitHub Pages）

- **建議設定**：`Settings → Pages → Build and deployment`
  - **Source**：Deploy from a branch
  - **Branch**：`main` / **`/(root)`**
- **目前線上網址**：`https://stanley00316.github.io/Electronic-business-card--4/`
- **首頁檔案**：`index.html`（依登入狀態導向 `auth.html`、`my-card.html` 或 `directory.html`）
- **404 頁面**：`404.html`（提供回主頁/名片頁的連結）

部署完成後網址格式通常為：
- `https://<user>.github.io/<repo>/`

> 本專案所有 CSS/JS/圖片連結皆採**相對路徑**，可直接適配 GitHub Pages 的 `/<repo>/` 子路徑情境。

## 專案入口與主要頁面

- **主入口**：`index.html`（依登入狀態分流）
- **我的名片入口**：`my-card.html`
- **公開名片頁**：`card.html?id=<user_id>` 或 `card.html?nfc=<nfc_card_id>`
- **免登入加入頁**：`guest-join.html?ref=<referrer_user_id>`（好友受邀加入時填資料，系統自動審核通過並建立公開名片）
- **舊示例頁**：`yuyuko.html`
- **設定**：`settings.html`
- **平台通訊錄**：`directory.html`
- **編輯名片**：`edit.html`
- **管理後台**：`admin.html`
- **企業管理中心**：`company-admin.html`（員工批次管理、品牌欄位鎖定、NFC 狀態、客戶待跟進）

## 公開名片功能

- **分享名片**：公開名片頁可直接分享目前網址。
- **加入手機通訊錄**：公開名片頁會開啟標準 `.vcf` 通訊錄檔網址，朋友或客戶點「加入通訊錄」後，可在 iOS / Android 內建流程確認新增聯絡人；最後必須由對方按儲存才會寫入聯絡簿。
- **LINE 資訊**：若公開名片有 LINE 連結，會放入通訊錄備註或網址；手機通訊錄沒有 LINE 專用欄位，因此不會自動加好友。
- **微信資訊**：編輯頁可輸入微信號；公開名片會先嘗試開啟微信 App，若瀏覽器或手機不支援，會複製微信號並提示使用者到微信搜尋貼上。通訊錄匯出會把微信號放在備註，避免手機通訊錄吃到不認得的特殊網址。
- **QR Code**：公開名片頁可顯示與下載 QR Code，供現場掃描。

## 新增新名片頁（模板與規範）

### 檔名/路徑規則（最小可維護規範）

- **頁面檔名**：建議用小寫英數與連字號（kebab-case）
  - ✅ `john-doe.html`
  - ❌ `John Doe.html`（空白在 URL 會變編碼，容易踩坑）
  - ❌ `截圖 2025-xx.png`（非英數檔名在部署/分享時較不穩定）
- **資源檔名**：同樣建議小寫英數與連字號
  - ✅ `avatar-john-doe.jpg`
  - ✅ `logo-company.svg`
- **大小寫必須一致**：GitHub Pages 對檔名大小寫敏感（大小寫不同會 404）

### 建立新名片頁流程（建議）

1. 複製 `yuyuko.html` 為新檔，例如 `john-doe.html`
2. 修改以下內容：
   - 姓名/職稱/標語
   - 聯絡按鈕連結（tel/mailto/社群）
   - 頭像：建議改成新的圖片檔（避免共用 `default-avatar.svg`）
3. 確保引用檔案都存在（尤其是圖片、VCF）

### VCF（儲存到通訊錄）

- 目前示例 VCF 檔案：`yuyu-ko.vcf`
- 若新增名片頁，建議同時新增對應的 vCard 檔，例如 `john-doe.vcf`
  - 並在名片頁的「儲存到通訊錄」按鈕中改成該檔名

## GitHub Pages 讀取網址參數（querystring）

本專案使用瀏覽器原生的 `URLSearchParams` 讀取 querystring，例如（在 `common.js`）：
- `const urlParams = new URLSearchParams(window.location.search);`

### 例：以參數控制卡片主題

`common.js` 內支援 `?cardTheme=3` 這種方式讀取主題並套用。

## 新手流程（第一次開啟自動進入編輯）

本專案已支援雲端登入與新手建立流程：

- **首頁**：`index.html`
  - 未登入：導向 `auth.html`
  - 已登入且已有名片：導向 `directory.html` 或 `my-card.html`
  - 已登入但尚未建立名片：導向 `edit.html?mode=onboarding`
- **手機主畫面入口**：`my-card.html`
  - 已登入時：記住自己的公開名片 ID，並導向 `card.html?id=<user_id>`
  - 從手機主畫面/PWA 圖示開啟且登入已過期時：若本機已記住名片 ID，直接開公開名片頁，不強制 LINE 登入
  - 若本機仍保留舊 LINE 登入 token，會先讀取其中的使用者 ID 來開公開名片；這只用於公開瀏覽，不代表已登入管理功能
  - 從手機主畫面/PWA 圖示開啟但尚未記住名片 ID 時：停在提示畫面，由使用者手動點「登入一次」，避免自動 LINE 登入造成反覆閃爍
  - 編輯名片、設定、通訊錄與後台仍維持 LINE 登入保護
- **新版快取提示**：Service Worker 偵測到新版時，只會顯示底部「更新 / 稍後」提示；不會自動重整頁面，避免使用者正在編輯或操作後台時被打斷。
- **首次進入**：系統會依 Supabase 名片資料與 `localStorage.UVACO_ONBOARDED` 判斷是否進入新手流程
  - 使用者在 `edit.html` 按下「儲存」後，會寫入 `UVACO_ONBOARDED=1` 並回到 `directory.html`
- **要跳過 onboarding**：可用 `directory.html?skipOnboarding=1`

## 免登入好友加入流程（系統自動審核通過）

- **入口**：設定頁「邀請好友」產生的連結會導到 `guest-join.html?ref=<user_id>&openExternalBrowser=1`。
- **流程**：好友不需要 LINE、Google、Email 驗證碼、簡訊或邀請碼；填姓名與至少一種聯絡方式後送出，`guest-card-intake` Edge Function 會檢查欄位並用系統權限建立公開名片。
- **審核規則**：目前採「系統自動通過」，也就是送出成功後立即建立 `card.html?id=<new_user_id>`。
- **安全邊界**：前端不開放匿名直接寫入 `cards` 資料表；匿名訪客只能呼叫 Edge Function，後端會限制欄位長度、清除 HTML、擋簡單機器人欄位。訪客建立後若需修改資料，預設由管理員處理，不提供「拿到私人連結即可任意編輯」的高風險入口。

## 企業付費功能（Phase 1）

`company-admin.html` 已提供企業管理員使用的低風險管理流程：

- **員工批次管理**：
  - 可下載員工名單範本。
  - 可貼上或上傳 CSV/文字名單。
  - 上傳後會先預覽並用白話提示錯誤，不會直接寫入。
  - 批次建立的是 `guest-join.html?invite=...` 免登入連結，員工點開確認資料後由系統自動建立公開名片。
- **批次修改**：
  - 可勾選多位員工後批次改職稱、部門、分機、公司地址。
  - 可批次停用 / 啟用員工名片。
  - 批次修改只改指定欄位，會保留原名片的 Logo、樣式、聯絡按鈕與其他 `profile_json` 內容。
- **批次輸出印刷資料**：
  - 可匯出姓名、職稱、公司、公開名片網址、NFC 網址、NFC ID、貼紙材質/顏色，供製卡與貼紙印刷使用。
- **品牌欄位鎖定**：
  - 公司設定可鎖姓名、公司名稱、職稱、部門、Email、電話、名片主題、公司 Logo、公司資訊、聯絡按鈕。
  - 員工編輯頁會依鎖定欄位停用對應操作。
- **NFC 狀態管理**：
  - 既有已綁定、未綁定、已停用、遺失、移交功能保留。
  - 新版 migration 套用後，`card_views.source = 'nfc'` 可支援最後 NFC 感應時間與 NFC 感應次數。
- **客戶待跟進**：
  - 公開名片新增「留下資料」表單。
  - 客戶送出後寫入 `lead_inquiries`，企業後台可標記未聯絡、已聯絡、成交、無效。
  - 企業後台可篩選來源（NFC、QR Code、LINE 分享、網頁）、查看超過 1 天未聯絡名單、匯出 CSV、複製客戶資料與統計摘要。
  - `supabase/migrations/20260804163000_enterprise_paid_features_phase1.sql` 已套用到正式專案，此功能可正式寫入資料。
- **防詐騙驗證基礎**：
  - 公開名片會顯示公司驗證資訊、在職狀態、統編、官方聯絡方式與最後更新時間。
  - 若名片被管理員停用，仍會走既有停用提示頁，不顯示個人資料。

## 可能遇到的常見問題

- **首頁 404**：請確認 Pages 設定指向 `/(root)` 且 repo 根目錄有 `index.html`
- **資源載入失敗**：請檢查檔名大小寫是否一致、檔案是否真的存在
- **自訂網域**：若需要可新增 `CNAME`（此專案預設未加入）

## Supabase（雲端名片 / 全平台搜尋 / Storage / LINE 登入）

### 目前正式專案狀態（2026-08-31）

- **正式專案**：`https://nqxibryjhgftyxttopuo.supabase.co`
- **已套用 migration**：最新已到 `20260831160000_restore_chiu_super_admin.sql`（恢復邱瑋浚超級管理員權限，並統一 LINE／Email 超級管理員判定）
- **已部署 Edge Function**：`guest-card-intake`（線上 build 標記：`2026-08-26-guest-card-intake-rate-limit`，新增免登入端口的 IP／推薦人雙層速率限制）
- **已啟用能力**：企業邀請免登入建立名片、客戶待跟進資料、NFC 感應來源統計。
- **保留不變**：GitHub Pages repo 路徑仍是 `Electronic-business-card--4`，公開名片與 NFC 既有網址規則不變。
- **資料庫調整請一律走 `supabase/migrations/`**：過去曾直接在 SQL Editor 貼上一次性修復腳本、事後才存成根目錄檔案，導致同一條規則在不同檔案有不同版本、看 repo 看不出正式環境現況。2026-08-26 已對照正式環境查證並整併進 `supabase-setup.sql`，舊檔案封存在 [`sql-archive/`](../sql-archive/README.md)（僅供回顧歷史，不要重新執行）。以後有資料庫調整，請新增 `supabase/migrations/` 底下的檔案並用 `supabase db push` 套用，不要再對正式環境臨時貼 SQL。

### 1) 基本設定

- 在 `cloud.js` 填入：
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`

### 2) 初始化資料庫與 Storage

- 到 Supabase Dashboard → SQL Editor 執行 `supabase-setup.sql`
  - 這份檔案已經是**完整的單一建置腳本**（2026-08-26 起），會建立 `cards / directory_contacts / consents / admin_allowlist / admin_users / referrals / subscriptions / payment_history / pricing_plans` 等全部資料表、RLS policy 與輔助函式
  - 會建立（或確保存在）Storage bucket：`card-assets`（並套用 RLS policy）
  - 每個語句都設計成可重複執行（`if not exists` / `drop ... if exists` 再重建），重跑一次不會壞掉既有資料

### 3) LINE 登入（不依賴 Supabase Provider；自訂 JWT 模式）

此專案支援「LINE Login → Edge Function → 簽發 Supabase 可驗證 JWT」讓前端在 **不使用 Supabase 內建 LINE Provider** 的情況下仍可符合：
- `role = authenticated`
- `auth.uid()` = 你的 `user_id`（UUID）

#### 你需要做的事

1. **LINE Developers**
   - 建立 LINE Login channel
   - 取得：
     - `LINE_CHANNEL_ID`
     - `LINE_CHANNEL_SECRET`
   - 設定 Callback URL（固定，不帶 query string）：
     - GitHub Pages：`https://<user>.github.io/<repo>/auth.html`
     - 例如：`https://stanley00316.github.io/Electronic-business-card--4/auth.html`
     - 本機：建議用 ngrok 的 https 網址（LINE 不接受 http://localhost）
     - ⚠️ 注意：URL 必須與程式碼中 `getLineRedirectUri()` 產生的完全一致

2. **Supabase SQL**
   - 執行 `supabase-setup.sql`（會建立 `public.line_identities`）
   - 重要：若你要用「自訂 JWT」而非 Supabase Auth provider，會移除三個對 `auth.users` 的外鍵限制（避免插入失敗）。

3. **Supabase Edge Function**
   - 設定 Secrets（Dashboard → Edge Functions → Secrets）：
     - `SUPABASE_URL`
     - `SUPABASE_SERVICE_ROLE_KEY`
     - `SUPABASE_JWT_SECRET`
     - `LINE_CHANNEL_ID`
     - `LINE_CHANNEL_SECRET`
  - 使用 Supabase CLI 部署（需要你本機安裝 supabase CLI）：
```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy line-auth
```

#### 免登入好友加入 Edge Function

若要啟用 `guest-join.html` 的自動建立名片流程，需部署：

```bash
supabase functions deploy guest-card-intake
```

#### 企業訂閱付款 Edge Function（`stripe-checkout`／`stripe-webhook`／`linepay-checkout`／`linepay-confirm`）

訂閱付款僅限企業帳號使用（`cards.is_enterprise = true`），個人使用完全免費。這幾支函式需要另外設定：

- `JWT_SECRET`（或舊名 `SUPABASE_JWT_SECRET`，跟 LINE/Google/Apple 登入共用同一把）
- Stripe：`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`
- LINE Pay：`LINEPAY_CHANNEL_ID`、`LINEPAY_CHANNEL_SECRET`、`LINEPAY_SANDBOX`（`true`/`false`）

`stripe-webhook`（Stripe 官方伺服器直接呼叫，不會帶登入令牌）與 `check-subscriptions`（排程用批次端點）已在 `supabase/config.toml` 關閉平台層 JWT 驗證，改由函式自己驗證 `stripe-signature` 簽章／`x-api-key` 共用密鑰，部署時記得一併套用：

```bash
supabase functions deploy stripe-checkout
supabase functions deploy stripe-webhook
supabase functions deploy linepay-checkout
supabase functions deploy linepay-confirm
```

#### 排程檢查過期訂閱（`check-subscriptions`）

這支是排程用的批次端點，需要額外設定共用密鑰，並在外部排程服務（Supabase Dashboard 排程、cron.org 等）呼叫時帶上：

- 設定 Secret：`CRON_SECRET`（自行產生一組隨機字串，例如 `openssl rand -hex 32`）
- 排程呼叫時帶 Header：`x-api-key: <CRON_SECRET>`，不帶或帶錯會回 401

```bash
supabase functions deploy check-subscriptions
```

#### 大頭貼/Logo 上傳到 Cloudflare R2（`upload-r2`）

需要設定：`R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET_NAME`、`R2_PUBLIC_URL`（跟 `JWT_SECRET` 共用同一把）。上傳路徑必須是呼叫者自己的資料夾、單檔上限 8MB、僅接受 `image/webp`、`image/png`、`image/jpeg`、`image/gif`。

```bash
supabase functions deploy upload-r2
```

`supabase/config.toml` 已將 `guest-card-intake` 設為公開端點（`verify_jwt = false`），因為好友填表時沒有登入狀態；安全檢查由函式內部處理，並使用 service role 從後端建立名片。

4. **前端**
   - 在 `cloud.js` 填入 `LINE_CHANNEL_ID`
   - 上線後開 `auth.html` 點「用 LINE App 開啟」
   - 手機會優先嘗試開啟 LINE App 的 LIFF 登入；若沒有成功開啟，會自動改用 LINE QR Code 登入
   - 電腦會保留 QR Code 登入，使用者可用 LINE App 掃碼，不需記帳號密碼

# 商務電子名片Ｖ4（GitHub Pages 部署版）

此專案為**純靜態網站**（HTML/CSS/JS/Assets），可直接部署到 **GitHub Pages**，不需要額外 build。

## 部署方式（GitHub Pages）

- **建議設定**：`Settings → Pages → Build and deployment`
  - **Source**：Deploy from a branch
  - **Branch**：`main` / **`/(root)`**
- **首頁檔案**：`index.html`（已內建導向 `yuyuko.html`）
- **404 頁面**：`404.html`（提供回主頁/名片頁的連結）

部署完成後網址格式通常為：
- `https://<user>.github.io/<repo>/`

> 本專案所有 CSS/JS/圖片連結皆採**相對路徑**，可直接適配 GitHub Pages 的 `/<repo>/` 子路徑情境。

## 專案入口與主要頁面

- **主入口**：`index.html`（導向 `directory.html`）
- **名片頁（示例）**：`yuyuko.html`
- **設定**：`settings.html`
- **平台通訊錄**：`directory.html`
- **編輯名片**：`edit.html`
- **管理後台**：`admin.html`

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

本專案已支援「第一次開啟網站時，若 localStorage 尚未完成建立，會自動導向編輯頁」：

- **首頁**：`index.html` → `directory.html`
- **首次進入**：`directory.html` 會檢查 `localStorage.UVACO_ONBOARDED`
  - 若不是 `'1'`：自動導到 `edit.html?mode=onboarding&next=directory.html`
  - 使用者在 `edit.html` 按下「儲存」後，會寫入 `UVACO_ONBOARDED=1` 並回到 `directory.html`
- **要跳過 onboarding**：可用 `directory.html?skipOnboarding=1`

## 可能遇到的常見問題

- **首頁 404**：請確認 Pages 設定指向 `/(root)` 且 repo 根目錄有 `index.html`
- **資源載入失敗**：請檢查檔名大小寫是否一致、檔案是否真的存在
- **自訂網域**：若需要可新增 `CNAME`（此專案預設未加入）


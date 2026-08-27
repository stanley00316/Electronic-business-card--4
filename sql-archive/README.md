# 封存說明（歷史用，不要重新執行）

這個資料夾裡的檔案，是過去直接在 Supabase SQL Editor 貼上執行過的一次性修復腳本。當初的做法是「發現問題 → 寫一份新的 .sql 檔案 → 貼到 SQL Editor 執行 → 檔案就留在根目錄」，跟正規的 `supabase/migrations/` 沒有整合在一起，結果同一張表、同一個規則名稱在不同檔案裡出現不同版本，光看 repo 完全看不出正式環境現在實際生效的是哪一版。

**2026-08-26 已經對照正式環境查證過，把每個檔案裡真正生效的版本合併進 [`../supabase-setup.sql`](../supabase-setup.sql)**，那份檔案現在是完整、跟正式環境一致的建置腳本。

## 使用規則

- **這個資料夾裡的檔案只保留給你回顧「當初為什麼這樣改」的歷史脈絡用。**
- **不要重新執行這裡的任何檔案。** 部分內容（例如 `fix-referrals-rls.sql` 裡的 `referrals_insert` 規則）是已知有資安漏洞、後來才修掉的舊版本，重新執行會把已經修好的問題重新打開。
- 以後資料庫要調整，一律新增 `supabase/migrations/` 底下的檔案（比照 2026-08-26 那幾次修復的做法），不要再對正式環境臨時貼 SQL、事後才生一個根目錄檔案。

## 各檔案摘要

| 檔案 | 原本用途 | 合併進 supabase-setup.sql 的哪個部分 |
| --- | --- | --- |
| `update_admin_schema.sql` | 新增 `managed_company` 分權欄位、重建 `admin_users` 與 `cards` 的管理員規則（修 policy 遞迴卡死問題） | `admin_users` 表與其規則、`cards_admin_*` 規則 |
| `deactivate-subscription.sql` | 修正 `cards_public_select` 允許任何人讀取所有名片的問題、新增停用/重新啟用訂閱函式 | `cards_public_select`（加上 `is_visible` 檢查） |
| `fix-subscription-rls.sql` | 修正 LINE 登入使用者 UUID 格式不符的問題（改用 `::text` 轉型）、收回 `admin_allowlist` 過度開放的讀取權限 | `subscriptions_own_*` 規則（`::text` 轉型版本）；`admin_allowlist` 規則已在同日稍早的另一次修復處理 |
| `fix-referrals-rls.sql` | 修正 LINE 登入用戶查不到自己推薦成果的問題 | `referrals_own_select`／`referrals_admin_select`；**其中的 `referrals_insert` 是已知漏洞的舊版本，已被 `supabase/migrations/20260826150000_fix_referrals_insert_abuse.sql` 取代** |
| `subscription-setup.sql` | 訂閱系統資料表（subscriptions／payment_history／pricing_plans）、輔助函式 | 整段合併（`payment_history_own_select` 沿用這裡沒有 `::text` 轉型的版本，是查證過正式環境真正生效的版本） |

## 這次盤點順便發現的兩個既有落差（已一併修正/記錄）

- `calculate_referral_bonus()` 正式環境的公式其實是「每 3 人給 180 天」，跟這個資料夾裡任何檔案寫的「每 1 人給 30 天」都不一樣——這個改動沒有留在任何 SQL 檔案裡，只能從正式環境反查回來，已經照正式環境的版本寫回 `supabase-setup.sql`。
- `admin_users` 這張表本身的建立語法，從頭到尾都沒有出現在任何 SQL 檔案裡（連這裡封存的檔案都只有 `ALTER TABLE` 補欄位，沒有 `CREATE TABLE`），已經反查正式環境的完整欄位、約束、規則，補進 `supabase-setup.sql`。

## 2026-08-27 封存（第二批）

| 檔案 | 原本用途 | 合併進 supabase-setup.sql 的哪個部分 |
| --- | --- | --- |
| `enterprise-phase1.sql` | 企業後台：員工停用欄位（`admin_disabled` 系列）、NFC 狀態欄位與自動同步 trigger、部門欄位 | 整段合併，內容跟正式環境完全一致 |
| `subscription-auto-triggers.sql` | 新推薦記錄自動更新推薦人獎勵天數、新名片自動建立 30 天試用訂閱 | 兩個 trigger 都合併（第 3、4 段一次性補資料的 `DO` 區塊是當時的一次性動作，已執行過，不需要留在建置腳本裡） |
| `google-login-setup.sql` | Google 登入身份對照表 `google_identities`（不含索引） | 已被 `oauth-providers-setup.sql` 的版本取代（內容相同，多兩個索引），視為重複檔案 |
| `oauth-providers-setup.sql` | `google_identities`／`apple_identities`／`linked_accounts` 三張身份對照表 | 只合併 `google_identities`（正式環境已存在）與 `apple_identities`（**查證時發現這張表正式環境從未真的建立過，但 `apple-auth` Edge Function 確實會查詢它，等於蘋果登入目前完全不能用——已在 `supabase/migrations/20260827140000_create_apple_identities.sql` 補建**）；`linked_accounts` 全專案沒有任何程式碼在使用，屬於當初的臆測性設計，未合併 |
| `admin-upload-storage-rls.sql` | 開放管理員代替員工上傳大頭貼／Logo 的 Storage 例外規則 | 整段合併；原本用 `coalesce(managed_company, target_company)`，因為兩欄位現在保證同步（見 `admin_users_scoped_write` 規則），已簡化成只看 `managed_company` |
| `card_view_summaries_admin_rpc.sql` | 後台批次查詢名片瀏覽統計的 RPC 函式 | 整段合併；同樣把 `target_company` 改成 `managed_company`，寫法跟其他規則一致 |

- **這次意外發現的落差**：`apple_identities` 資料表在正式環境完全不存在，但 `apple-auth` Edge Function 的程式碼會直接查詢它——因為 Apple 登入金鑰目前還沒在正式環境設定，這個缺口還沒被使用者實際踩到，但只要金鑰一上，Apple 登入會直接查詢一張不存在的表而完全失敗。已補建這張表（`20260827140000_create_apple_identities.sql`），之後設定金鑰就能正常運作。

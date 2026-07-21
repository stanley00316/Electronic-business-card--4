/**
 * Cloud 設定常數（請於此維護專案金鑰）
 */
// ===== Supabase 設定 =====
// 你需要把這兩個值改成你 Supabase 專案的設定（Project Settings → API）
// - SUPABASE_URL: https://xxxx.supabase.co
// - SUPABASE_ANON_KEY: anon public key
export const SUPABASE_URL = 'https://nqxibryjhgftyxttopuo.supabase.co';
// Supabase Dashboard → Settings → API Keys → Publishable key (default)
export const SUPABASE_ANON_KEY = 'sb_publishable_iTgIYinO82u_nwhdzvS8EQ_zDtNKpdH';
// Legacy JWT 格式的 anon key（Edge Functions 的 Authorization header 需要 JWT 格式）
// Supabase Dashboard → Settings → API Keys → Legacy anon, service_role API keys → anon public
export const SUPABASE_ANON_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xeGlicnlqaGdmdHl4dHRvcHVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxNTY0MDksImV4cCI6MjA4MjczMjQwOX0.b8Vp__OY70wLmRv96LFjiGuqqMfcR06q0yf6VlB6ikU';

// ===== 儲存設定 =====
// STORAGE_PROVIDER: 'supabase' 或 'r2'
// - 'supabase': 使用 Supabase Storage（預設）
// - 'r2': 使用 Cloudflare R2（需要部署 upload-r2 Edge Function）
export const STORAGE_PROVIDER = 'supabase'; // 改為 'r2' 以使用 Cloudflare R2

// ===== LINE Login（自訂 JWT 模式）=====
// 若你要啟用 LINE 登入：
// 1) 在 LINE Developers 建立 LINE Login channel
// 2) 把 Channel ID 填在這裡（可公開）
// 3) 部署 supabase edge function：supabase/functions/line-auth
// 重要：LINE Login 的 Channel ID 通常是「純數字」。
// 你給的值若不是數字，代表可能貼到的是 LINE ID 而非 Channel ID（會導致登入失敗）。
export const LINE_CHANNEL_ID = '2008810712'; // LINE Login 的 Channel ID（client_id）

// ===== LIFF（LINE Front-end Framework）=====
// 在 LINE Developers Console → 你的 LINE Login Channel → LIFF 分頁建立 LIFF App 後，
// 將 LIFF ID 填入這裡。啟用後，從 LINE App 內開啟的用戶將自動登入，免輸入帳號密碼。
export const LIFF_ID = '2008810712-bHGjgn3l'; // LIFF App ID

// ===== Google Login =====
// 2026-07-21：Google 登入功能先封存（使用者覺得申請/設定過程太麻煩，暫緩推行）。
// 後端（google_identities 資料表、google-auth Edge Function、Supabase Secrets）都還保留著，
// 完全沒有刪除；只要把下面這行的 Client ID 貼回來（原本是
// 155377373955-b609lj8sd79sebtaddsvo58g5t6p1mfk.apps.googleusercontent.com），
// 重新打包 cloud.js 並升版部署，就能立刻恢復，不需要重新申請或重新設定任何東西。
// 若要啟用：
// 1) 在 Google Cloud Console 建立 OAuth 2.0 Client
// 2) 把 Client ID 填在這裡（可公開）
// 3) 在 Supabase Edge Functions Secrets 設定 GOOGLE_CLIENT_ID 和 GOOGLE_CLIENT_SECRET
// 4) 部署 supabase edge function：supabase/functions/google-auth
export const GOOGLE_CLIENT_ID = ''; // Google OAuth Client ID（留空則不顯示 Google 登入按鈕，目前刻意留空＝封存）

// ===== Apple Login =====
// 若你要啟用 Apple 登入：
// 1) 註冊 Apple Developer Program ($99/年)
// 2) 在 Apple Developer 建立 Services ID
// 3) 把 Client ID 填在這裡（可公開）
// 4) 部署 supabase edge function：supabase/functions/apple-auth
export const APPLE_CLIENT_ID = ''; // Apple Services ID（留空則不顯示 Apple 登入按鈕）

export const CUSTOM_JWT_KEY = 'UVACO_CUSTOM_JWT';

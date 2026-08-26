-- ===== 修復推薦系統可被無限灌資料濫用的漏洞 =====
-- 問題：referrals_insert policy 是 WITH CHECK (true)，任何登入用戶都能插入
-- referred_user_id 為「任意 UUID」的推薦紀錄（不必是真實會員、也不必是自己），
-- 可被用來無限刷高自己的推薦數，換取無上限的訂閱獎勵天數。
-- 正確設計：一個人只能為「自己剛加入」這件事被記錄一次，
-- recordReferral()（js/cloud/cards-referrals-nfc.js）本來就是把 referred_user_id
-- 設成呼叫者自己的 auth.uid()；配合既有的 unique(referred_user_id) 約束，
-- 這裡只要強制 referred_user_id 必須等於呼叫者自己，濫用就完全被擋下。

-- 1) 修正 INSERT policy：被推薦人必須是呼叫者自己
drop policy if exists "referrals_insert" on public.referrals;
create policy "referrals_insert" on public.referrals
for insert to authenticated
with check (referred_user_id = auth.uid());

-- 2) 防禦縱深：referrer_user_id／referred_user_id 都必須是真實會員
-- （public.cards.user_id 有 unique 約束可當外鍵目標）。
-- 用 NOT VALID 先加入，避免正式環境若已有孤兒資料導致整段 migration 失敗；
-- 加入後不會擋新查詢，但也還沒針對既有資料驗證。
alter table public.referrals
  drop constraint if exists referrals_referrer_user_id_fkey;
alter table public.referrals
  add constraint referrals_referrer_user_id_fkey
  foreign key (referrer_user_id) references public.cards(user_id)
  not valid;

alter table public.referrals
  drop constraint if exists referrals_referred_user_id_fkey;
alter table public.referrals
  add constraint referrals_referred_user_id_fkey
  foreign key (referred_user_id) references public.cards(user_id)
  not valid;

-- 3) 查一下目前 referrals 裡有沒有指向「不存在會員」的孤兒資料
--    （若有，代表過去已經被上述漏洞灌過假資料，可自行決定要不要清掉）：
--
-- select r.* from public.referrals r
-- where not exists (select 1 from public.cards c where c.user_id = r.referrer_user_id)
--    or not exists (select 1 from public.cards c where c.user_id = r.referred_user_id);
--
-- 清乾淨、或確認沒有孤兒資料之後，再執行以下這行讓外鍵正式生效驗證既有資料：
--
-- alter table public.referrals validate constraint referrals_referrer_user_id_fkey;
-- alter table public.referrals validate constraint referrals_referred_user_id_fkey;

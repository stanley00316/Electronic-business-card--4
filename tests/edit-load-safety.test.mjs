import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const initSource = read('js/pages/edit/edit-init.js');
const saveSource = read('js/pages/edit/edit-chunk-5.js');
const flush = () => new Promise(resolve => setImmediate(resolve));

// 執行真正的頁面程式，只替換雲端和畫面，測試不會接觸正式資料。
function harness(overrides = {}, search = '', invite = '') {
  const state = { invite, notices: [], uiReads: 0, applied: 0, onboarding: 0, reads: 0 };
  const session = { user: { id: 'owner' } };
  const ctx = vm.createContext({
    URLSearchParams, console: { log() {}, warn() {}, error() {} },
    setTimeout: (fn, ms) => setTimeout(fn, ms >= 10000 ? 25 : 0), clearTimeout,
    localStorage: { getItem: key => key === 'UVACO_INVITE_TOKEN' ? state.invite : null,
      setItem() {}, removeItem: key => { if (key === 'UVACO_INVITE_TOKEN') state.invite = ''; } },
    location: { search, href: '', reload() {} }, history: { replaceState: (_, __, url) => { state.url = url; } },
    document: {
      readyState: 'complete', getElementById: () => null,
      querySelectorAll: () => { state.uiReads++; throw new Error('SAVE_READ_INCOMPLETE_UI'); }
    },
    showSaveFeedback: async (_, options) => { state.notices.push(options); },
    alert() {},
    UVACO_CLOUD: {
      hasConfig: () => true, requireAuth: async () => ({ ok: true, session }),
      getSession: async () => ({ session }),
      getMyCard: async () => { state.reads++; return { card: null }; },
      getCardByUserId: async () => { state.reads++; return { card: null }; },
      isAdmin: async () => ({ isAdmin: true }), ...overrides
    }
  });
  ctx.window = ctx;
  vm.runInContext(initSource, ctx);
  ctx.loadCardToUI = () => { state.applied++; };
  ctx.showAdminBanner = () => {};
  ctx.injectCompanyPickerButtons = () => {};
  vm.runInContext(saveSource, ctx);
  ctx.checkOnboarding = () => { state.onboarding++; };
  return { ctx, state };
}

test('名片讀取中點儲存：不得先收集空白畫面資料', async () => {
  let release;
  const { ctx, state } = harness({ getMyCard: () => new Promise(r => { release = r; }) });
  await flush();
  await ctx.saveCard();
  assert.equal(state.uiReads, 0);
  assert.ok(state.notices.length);
  release({ card: { name: 'Existing' } });
  await ctx.__uvacoEditInitReady;
});

test('名片已讀到但套用畫面失敗：必須鎖住儲存', async () => {
  const { ctx } = harness({ getMyCard: async () => ({ card: { name: 'Existing' } }) });
  ctx.loadCardToUI = () => { throw new Error('BROKEN_RENDER'); };
  const result = await ctx.__uvacoEditInitReady;
  assert.equal(result.loadFailed, true);
  assert.equal(ctx.__uvacoCardLoadFailed, true);
  await ctx.saveCard();
});

test('雲端程式缺失：不可誤當新帳號或允許儲存', async () => {
  const { ctx } = harness({ hasConfig: () => false });
  const result = await ctx.__uvacoEditInitReady;
  assert.equal(result.loadFailed, true);
  await ctx.saveCard();
});

test('讀取結果格式不完整：不可當成「確定沒有名片」', async () => {
  const { ctx } = harness({ getMyCard: async () => undefined });
  const result = await ctx.__uvacoEditInitReady;
  assert.equal(result.loadFailed, true);
});

test('請求一直沒回應：有限時間內提示失敗，稍後回應也不覆蓋畫面', async () => {
  let release;
  const { ctx, state } = harness({ getMyCard: () => new Promise(r => { release = r; }) });
  const result = await Promise.race([
    ctx.__uvacoEditInitReady,
    new Promise(resolve => setTimeout(() => resolve({ timedOut: true }), 300))
  ]);
  assert.equal(result.loadFailed, true);
  release({ card: { name: 'Late' } });
  await flush();
  assert.equal(state.applied, 0);
  assert.equal(ctx.__uvacoCardLoadFailed, true);
});

test('讀取期間登入失效：空結果不可導向新手建立', async () => {
  const { ctx, state } = harness({ getSession: async () => ({ session: null }) });
  const result = await ctx.__uvacoEditInitReady;
  assert.equal(result.loadFailed, true);
  assert.equal(state.url, undefined);
});

for (const search of ['', '?uid=owner', '?adminMode=true&targetUserId=employee']) {
  test(`確認無名片的正常新帳號仍可初始化：${search || '本人'}`, async () => {
    const { ctx } = harness({}, search);
    const result = await ctx.__uvacoEditInitReady;
    assert.equal(result.hasCard, false);
    assert.equal(result.loadFailed, false);
  });
}

test('暫時失敗後讀取成功：保留既有名片，不進入新手流程', async () => {
  let calls = 0;
  const { ctx, state } = harness({ getMyCard: async () => ++calls < 3
    ? { card: null, error: new Error('NETWORK') } : { card: { name: 'Existing' } } });
  const result = await ctx.__uvacoEditInitReady;
  assert.equal(calls, 3);
  assert.equal(result.hasCard, true);
  assert.equal(result.loadFailed, false);
  assert.equal(state.applied, 1);
  await flush();
  assert.equal(state.onboarding, 0);
});

for (const search of ['', '?adminMode=true&targetUserId=employee']) {
  test(`登入在名片查詢中途失效也會被攔下：${search || '本人'}`, async () => {
    let checks = 0;
    const { ctx, state } = harness({ getSession: async () => ({ session: ++checks === 1 ? { user: { id: 'owner' } } : null }) }, search);
    assert.equal((await ctx.__uvacoEditInitReady).loadFailed, true);
    assert.equal(state.url, undefined);
  });
}

test('登入轉頁時不可儲存，也不顯示新手歡迎視窗', async () => {
  const { ctx, state } = harness({ requireAuth: async () => ({ ok: false }) });
  assert.equal((await ctx.__uvacoEditInitReady).redirecting, true);
  await ctx.saveCard();
  assert.equal(state.uiReads, 0);
  assert.equal(state.onboarding, 0);
});

test('領取邀請沒回應：保留邀請，停止初始化', async () => {
  const { ctx, state } = harness({ claimCardInvite: () => new Promise(() => {}) }, '', 'test-invite');
  assert.equal((await ctx.__uvacoEditInitReady).loadFailed, true);
  assert.equal(state.invite, 'test-invite');
  assert.equal(state.reads, 0);
});

test('過期邀請不會永遠擋住編輯頁', async () => {
  const { ctx, state } = harness({ claimCardInvite: async () => { throw new Error('INVITE_INVALID_OR_EXPIRED'); } }, '', 'expired');
  assert.equal((await ctx.__uvacoEditInitReady).loadFailed, false);
  assert.equal(state.invite, '');
});

test('初始化程式沒載到：儲存和新手歡迎都保持關閉', async () => {
  let uiReads = 0;
  const ctx = vm.createContext({ console: { log() {} }, setTimeout: fn => setTimeout(fn, 0), window: {},
    document: { querySelectorAll: () => { uiReads++; return []; } }, showSaveFeedback: async () => {} });
  vm.runInContext(saveSource, ctx);
  let onboarding = 0;
  ctx.checkOnboarding = () => { onboarding++; };
  await ctx.saveCard();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(uiReads, 0);
  assert.equal(onboarding, 0);
});

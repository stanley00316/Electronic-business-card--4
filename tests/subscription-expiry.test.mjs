import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';

const now = '2026-11-11T14:00:00.000Z';
const past = '2026-11-01T14:00:00.000Z';
const future = '2026-12-01T14:00:00.000Z';
const bundled = await build({
  entryPoints: ['supabase/functions/check-subscriptions/index.ts'],
  bundle: true, format: 'iife', platform: 'neutral', write: false,
  plugins: [{
    name: 'isolated-expiry-cloud',
    setup(builder) {
      builder.onResolve({ filter: /^https:\/\// }, args => ({ path: args.path, namespace: 'fake' }));
      builder.onLoad({ filter: /.*/, namespace: 'fake' }, args => ({
        contents: args.path.includes('/http/server.ts')
          ? 'export const serve = handler => { globalThis.handler = handler; };'
          : 'export const createClient = () => globalThis.client;',
        loader: 'js'
      }));
    }
  }]
});

// 執行真正的到期檢查，只以假資料取代雲端；測試不會連到正式名片。
function harness({ enterprise = false, status = 'trial', visible = true,
  end = past, bonus = 0, cardMissing = false, cardError = false,
  demoteBeforeHide = false, secret = 'test-secret', referralCount = 0 } = {}) {
  const sub = { user_id: 'test-card', status, trial_end_at: end,
    referral_bonus_days: bonus, last_referral_check: 0, created_at: past };
  const card = { user_id: sub.user_id, is_enterprise: enterprise, is_visible: visible,
    admin_disabled: false, directory_visible: false };
  const writes = [];
  const rpcCalls = [];
  const client = {
    from(table) {
      let payload;
      const filters = [];
      let single = false;
      const query = {
        select() { return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        in(key, values) { filters.push(row => values.includes(row[key])); return query; },
        update(value) { payload = value; return query; },
        maybeSingle() { single = true; return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (table === 'cards' && !payload && cardError) {
              return { data: null, error: { message: 'CARD_LOOKUP_FAILED' } };
            }
            if (table === 'cards' && payload && demoteBeforeHide) card.is_enterprise = false;
            const rows = table === 'subscriptions' ? [sub]
              : table === 'cards' ? (cardMissing ? [] : [card]) : [];
            const matched = rows.filter(row => filters.every(filter => filter(row)));
            if (payload) {
              for (const row of matched) {
                writes.push({ table, payload: { ...payload } });
                Object.assign(row, payload);
              }
            }
            const data = matched.map(row => ({ ...row }));
            return { data: single ? data[0] || null : data, error: null, count: referralCount };
          }).then(resolve, reject);
        }
      };
      return query;
    },
    async rpc(name, args) { rpcCalls.push({ name, args }); return { error: null }; }
  };
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return Date.parse(now); }
  }
  const context = vm.createContext({ client, Request, Response, Date: Clock,
    console: { error() {} },
    Deno: { env: { get: key => key === 'CRON_SECRET' ? secret : 'isolated-test' } }
  });
  vm.runInContext(bundled.outputFiles[0].text, context);
  return { sub, card, writes, rpcCalls, async run(key = 'test-secret') {
    const response = await context.handler(new Request('https://test.invalid/expiry', {
      method: 'POST', headers: { 'x-api-key': key }
    }));
    return { status: response.status, body: await response.json() };
  } };
}

test('個人試用到期：不改訂閱、不隱藏名片', async () => {
  const h = harness();
  const result = await h.run();
  assert.equal(result.status, 200);
  assert.equal(h.sub.status, 'trial');
  assert.equal(h.card.is_visible, true);
  assert.equal(h.writes.length, 0);
  assert.equal(result.body.stats.expiredSubscriptions, 0);
});

test('個人既有付費到期與缺少企業標記：都不自動隱藏', async () => {
  for (const enterprise of [false, null, undefined]) {
    const h = harness({ enterprise, status: 'active' });
    if (enterprise === undefined) delete h.card.is_enterprise;
    h.sub.subscription_end_at = past;
    await h.run();
    assert.equal(h.writes.length, 0);
    assert.equal(h.card.is_visible, true);
  }
});

test('企業試用與付費到期：維持過期狀態並隱藏', async () => {
  for (const status of ['trial', 'active']) {
    const h = harness({ enterprise: true, status });
    if (status === 'active') h.sub.subscription_end_at = past;
    const result = await h.run();
    assert.equal(h.sub.status, 'expired');
    assert.equal(h.card.is_visible, false);
    assert.equal(result.body.stats.expiredSubscriptions, 1);
    assert.equal(result.body.stats.hiddenCards, 1);
    assert.equal(h.card.directory_visible, false);
    assert.equal(h.card.admin_disabled, false);
  }
});

test('企業尚未到期、推薦延長期間與正好到期的邊界維持原規則', async () => {
  for (const options of [{ end: future }, { bonus: 30 }, { end: now }]) {
    const h = harness({ enterprise: true, ...options });
    await h.run();
    assert.equal(h.writes.length, 0);
    assert.equal(h.card.is_visible, true);
  }
});

test('個人與企業手動取消／隱藏：不得重新公開', async () => {
  for (const enterprise of [false, true]) {
    const h = harness({ enterprise, status: 'cancelled', visible: false });
    h.card.admin_disabled = true;
    await h.run();
    assert.equal(h.writes.length, 0);
    assert.equal(h.card.is_visible, false);
    assert.equal(h.card.admin_disabled, true);
  }
});

test('名片不存在或企業身分查詢失敗：不得逕自到期或隱藏', async () => {
  for (const options of [{ cardMissing: true }, { cardError: true }]) {
    const h = harness({ enterprise: true, ...options });
    const result = await h.run();
    assert.equal(h.writes.length, 0);
    assert.equal(result.status, options.cardError ? 500 : 200);
  }
});

test('檢查途中改為個人：寫入時仍須排除個人名片', async () => {
  const h = harness({ enterprise: true, demoteBeforeHide: true });
  const result = await h.run();
  assert.equal(h.card.is_visible, true);
  assert.equal(result.body.stats.hiddenCards, 0);
});

test('個人的推薦獎勵仍使用原本規則更新', async () => {
  const h = harness({ referralCount: 3 });
  const result = await h.run();
  assert.equal(h.writes.length, 0);
  assert.equal(h.rpcCalls[0]?.name, 'update_referral_bonus');
  assert.equal(result.body.stats.referralUpdates, 1);
});

test('排程憑證缺失或錯誤：禁止更新任何名片', async () => {
  for (const secret of ['', 'test-secret']) {
    const h = harness({ enterprise: true, secret });
    const result = await h.run('wrong-key');
    assert.equal(result.status, secret ? 401 : 500);
    assert.equal(h.writes.length, 0);
  }
});

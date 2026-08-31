import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

async function loadAdminRolesWithFakeSession() {
  const result = await build({
    entryPoints: ['js/cloud/admin-roles.js'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    plugins: [{
      name: 'fake-admin-session',
      setup(builder) {
        builder.onResolve({ filter: /^\.\/session\.js$/ }, () => ({ path: 'session', namespace: 'fake' }));
        builder.onResolve({ filter: /^\.\/jwt\.js$/ }, () => ({ path: 'jwt', namespace: 'fake' }));
        builder.onLoad({ filter: /.*/, namespace: 'fake' }, (args) => ({
          contents: args.path === 'session'
            ? 'export const getAuthContext = () => globalThis.__adminRoleTestContext;'
            : 'export const getCustomJwt = () => ""; export const decodeJwtEmail = () => "";',
          loader: 'js'
        }));
      }
    }]
  });

  const source = Buffer.from(result.outputFiles[0].text).toString('base64');
  return import(`data:text/javascript;base64,${source}#${Date.now()}`);
}

function createFakeClient() {
  return {
    // 這裡模擬資料庫已確認「當前帳號是超級管理員」。
    rpc: async (name) => ({ data: name === 'is_super_admin_allowlist', error: null }),
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() {
          if (table === 'admin_users') {
            return {
              data: { user_id: 'a40d3104-8c5b-4f2d-96f5-9fd5e5b05c03', target_company: '曜鼎科技' },
              error: null
            };
          }
          return { data: null, error: null };
        }
      };
    }
  };
}

test('資料庫確認是超級管理員時，前端不得被舊公司欄位降級', async () => {
  globalThis.__adminRoleTestContext = {
    ok: true,
    userId: 'a40d3104-8c5b-4f2d-96f5-9fd5e5b05c03',
    client: createFakeClient()
  };

  const { isAdmin } = await loadAdminRolesWithFakeSession();
  const status = await isAdmin();

  assert.deepEqual(status, {
    isAdmin: true,
    managedCompany: null,
    canManageAdmins: true
  });
});

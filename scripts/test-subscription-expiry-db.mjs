import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
let configuredBin = process.env.PG_BIN;
if (!configuredBin) {
  try { configuredBin = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim(); } catch {}
}
const pgBin = [configuredBin, '/opt/homebrew/opt/postgresql@17/bin', '/usr/lib/postgresql/17/bin']
  .find(path => path && existsSync(join(path, 'initdb')));
assert.ok(pgBin, '此測試需要 PostgreSQL；可用 PG_BIN 指定工具資料夾。');

const setup = read('supabase-setup.sql');
function definition(name, source = setup) {
  const match = source.match(new RegExp(`create or replace function public\\.${name}\\(\\)[\\s\\S]*?\\$\\$;`, 'i'));
  assert.ok(match, `找不到 ${name}`);
  return match[0];
}
const endDate = setup.match(/create or replace function public\.get_subscription_end_date\(p_user_id uuid\)[\s\S]*?\$\$;/i)?.[0];
assert.ok(endDate);
const expiry = definition('check_expired_subscriptions');
const migrationPath = 'supabase/migrations/20261111160000_personal_cards_exempt_subscription_expiry.sql';
const migration = read(migrationPath);
assert.equal(definition('check_expired_subscriptions', migration), expiry,
  '新環境初始化與正式環境 migration 必須使用相同到期規則');

// 自行建立空白資料庫與隨機連接埠，永遠不連既有或正式資料庫。
const portProbe = createServer();
await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
const port = portProbe.address().port;
await new Promise(resolve => portProbe.close(resolve));
const scratch = mkdtempSync(join(tmpdir(), 'card-expiry-db-'));
const data = join(scratch, 'data');
const run = (command, args, input) => execFileSync(join(pgBin, command), args, {
  encoding: 'utf8', input, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe']
});
let started = false;
try {
  run('initdb', ['-D', data, '-U', 'expiry_test_owner', '-A', 'trust', '--no-locale']);
  run('pg_ctl', ['-D', data, '-l', join(scratch, 'postgres.log'), '-o',
    `-h 127.0.0.1 -p ${port} -c unix_socket_directories=''`, '-w', 'start']);
  started = true;
  const sql = ['begin;', read('tests/sql/subscription-expiry-fixture.sql'), endDate,
    migration, read('tests/sql/subscription-expiry-assertions.sql'), 'rollback;'].join('\n');
  const output = run('psql', ['-X', '-h', '127.0.0.1', '-p', String(port), '-U',
    'expiry_test_owner', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], sql);
  assert.match(output, /ROLLBACK/);
  console.log('PASS：獨立 PostgreSQL 的 17 種訂閱情境全部通過；測試資料已清除。');
} catch (error) {
  if (error.stderr) console.error(error.stderr.toString());
  throw error;
} finally {
  if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
  rmSync(scratch, { recursive: true, force: true });
}

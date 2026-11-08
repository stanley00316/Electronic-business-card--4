import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// 「設定 → 編輯名片」有時打不開的守門測試（2026-11-08 修好的寫法若被改回來，這裡會失敗）。
// 這些程式需要瀏覽器才能跑，所以這裡檢查「會出問題的寫法不存在、修好的寫法還在」。

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const settingsHtml = read('settings.html');
const settingsMain = read('js/pages/settings/main.js');
const editChunk1 = read('js/pages/edit/edit-chunk-1.js');
const editChunk5 = read('js/pages/edit/edit-chunk-5.js');

// 取出某個函式的原始碼（從 function 名稱到下一個頂層的「}」）
function functionSource(source, name) {
  const start = source.search(new RegExp('(async )?function ' + name + '\\('));
  assert.notEqual(start, -1, `找不到函式 ${name}`);
  const end = source.indexOf('\n}\n', start);
  assert.notEqual(end, -1, `找不到函式 ${name} 的結尾`);
  return source.slice(start, end + 2);
}

test('設定頁「訂閱管理」預設隱藏，確認是企業帳號才顯示（避免「編輯名片」往上跳、點錯）', () => {
  const tag = settingsHtml.match(/<a [^>]*id="subscriptionMenuItem"[^>]*>/);
  assert.ok(tag, '找不到訂閱管理選項');
  assert.match(tag[0], /style="display:\s*none;?"/, '訂閱管理要預設隱藏');

  const init = functionSource(settingsMain, 'initUserId');
  assert.match(init, /is_enterprise === true\)\s*\{\s*subscriptionItem\.style\.display = ''/, '企業帳號要把訂閱管理打開');
  assert.match(init, /subscriptionItem\.remove\(\)/, '非企業帳號要整個移除，不是只藏起來');
});

test('登入過期點「編輯名片」：登入完直接回編輯頁，不是回設定頁', () => {
  const goto = functionSource(settingsMain, 'gotoMyEdit');
  assert.match(goto, /'auth\.html\?next=' \+ encodeURIComponent\('edit\.html'\)/);
  assert.doesNotMatch(goto, /encodeURIComponent\('settings\.html'\)/, '不可再導回 settings.html');
});

test('「編輯名片」讀登入狀態有時間上限，卡住也會打開編輯頁', () => {
  const goto = functionSource(settingsMain, 'gotoMyEdit');
  assert.match(goto, /Promise\.race\(/);
  assert.match(settingsMain, /GOTO_EDIT_SESSION_TIMEOUT_MS = \d+/);
});

test('設定頁程式還沒載完就點「編輯名片」，照連結打開 edit.html', () => {
  assert.match(settingsHtml, /href="edit\.html" class="settings-item" onclick="return window\.gotoMyEdit \? gotoMyEdit\(event\) : true;"/);
});

test('編輯頁讀名片失敗不會被當成新帳號切到新手模式', () => {
  assert.match(editChunk1, /async function loadCardWithRetry\(/, '要有自動重試的讀名片工具');
  assert.match(editChunk1, /loadCardWithRetry\(\(\) => UVACO_CLOUD\.getMyCard\(\)\)/);
  assert.equal((editChunk1.match(/loadCardWithRetry\(\(\) => UVACO_CLOUD\.getCardByUserId\(targetUserId\)\)/g) || []).length, 2,
    '本人與管理員模式讀名片都要走自動重試');
  assert.doesNotMatch(editChunk1, /await UVACO_CLOUD\.(getMyCard|getCardByUserId)\(/, '不可再直接讀名片而忽略錯誤');
  assert.match(editChunk1, /if \(!cardData && !loadFailed && !params\.get\('mode'\)\)/, '讀取失敗不可切換成 onboarding');
  assert.match(editChunk1, /window\.__uvacoCardLoadFailed = true;/);
});

test('名片沒讀到時不准儲存，避免用空白資料蓋掉原本的名片', () => {
  const save = functionSource(editChunk5, 'saveCard');
  const guard = save.indexOf('if (window.__uvacoCardLoadFailed)');
  const firstWrite = save.indexOf('upsertMyCard');
  assert.notEqual(guard, -1, 'saveCard 要檢查名片是否讀取失敗');
  assert.ok(guard < firstWrite, '檢查要在寫入資料庫之前');
});

test('「歡迎使用」視窗等名片讀完才判斷，不是固定 1.5 秒', () => {
  assert.doesNotMatch(editChunk5, /^setTimeout\(checkOnboarding, 1500\);/m, '不可再固定時間就檢查');
  assert.match(editChunk5, /Promise\.resolve\(window\.__uvacoEditInitReady\)/);
  assert.match(editChunk1, /window\.__uvacoEditInitReady = \(async function \(\)/);
  assert.match(editChunk1, /return \{ hasCard: !!cardData, loadFailed \};/);
});

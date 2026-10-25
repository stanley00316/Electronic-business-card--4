import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// 公司名稱中英文欄位守門測試：2026-10-25 修掉「公司名稱出現兩行一樣的字」的原因，
// 是 styles.css 對公司名稱欄位寫了 `display: block !important`，把「同一時間只顯示中文或英文一欄」蓋掉了。
// 這裡確認這種寫法不會再被加回去。

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// 取出「選擇器完全等於 selector」的那條規則的內容
function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp('(?:^|\\})\\s*' + escaped + '\\s*\\{([^}]*)\\}').exec(css);
  assert.ok(match, `styles.css 找不到規則 ${selector}`);
  return match[1];
}

test('公司名稱欄位用 block 顯示，且不可加 !important', () => {
  const body = ruleBody('.info-item-company-name .info-value');
  assert.match(body, /display:\s*block\s*;/, '公司名稱欄位要維持 block（flex 會干擾可編輯欄位）');
  assert.doesNotMatch(body, /!important/, '不可加 !important：會讓中文、英文兩欄同時顯示，公司名稱重複');
});

test('styles.css 裡沒有任何 display !important 會套到中英文欄位', () => {
  const offenders = [];
  for (const m of css.matchAll(/display:\s*[a-z-]+\s*!important/g)) {
    const open = css.lastIndexOf('{', m.index);
    const prev = Math.max(css.lastIndexOf('}', open), css.lastIndexOf('{', open - 1), -1);
    const selector = css.slice(prev + 1, open).replace(/\s+/g, ' ').trim();
    if (/\.lang-(zh|en)\b|\.info-(value|label|item)\b/.test(selector)) offenders.push(selector);
  }
  assert.deepEqual(offenders, [], '這些規則的 display !important 會蓋掉中英文切換：' + offenders.join('；'));
});

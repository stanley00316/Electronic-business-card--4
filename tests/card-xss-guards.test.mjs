import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// 公開名片頁的防植入程式（XSS）守門測試：2026-10-25 修掉的寫法若被改回來，這裡會失敗。
// 名片頁的程式寫在 HTML 裡、需要瀏覽器才能跑，所以這裡檢查「危險寫法不存在、安全寫法還在」。

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const cardHtml = read('card.html');
const editHtml = read('edit.html');
const yuyukoHtml = read('yuyuko.html');
const editChunk4 = read('js/pages/edit/edit-chunk-4.js');
const serviceWorker = read('service-worker.js');

// 取出某個函式的原始碼（從 function 名稱到下一個頂層的「}」）
function functionSource(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, `找不到函式 ${name}`);
  const end = source.indexOf('\n}\n', start);
  assert.notEqual(end, -1, `找不到函式 ${name} 的結尾`);
  return source.slice(start, end + 2);
}

test('過濾工具 DOMPurify 從專案自己的檔案載入，不靠外部 CDN', () => {
  for (const [name, html] of [['card.html', cardHtml], ['edit.html', editHtml]]) {
    assert.match(html, /<script src="purify\.min\.js\?v=3\.4\.17"><\/script>/, `${name} 要載入本機 purify.min.js`);
    assert.doesNotMatch(html, /cdn\.jsdelivr\.net\/npm\/dompurify/, `${name} 不可再從 CDN 載入 DOMPurify`);
  }
  assert.match(read('purify.min.js').slice(0, 120), /DOMPurify 3\.4\.17/, 'purify.min.js 要是 3.4.17');
  assert.match(serviceWorker, /'\.\/purify\.min\.js'/, '離線快取清單要包含 purify.min.js');
});

test('姓名一律當純文字顯示，不用 innerHTML', () => {
  // 只抓真正的寫入動作「.innerHTML =」，註解裡提到 innerHTML 不算
  const assignsInnerHtml = /\.innerHTML\s*=/;
  const render = functionSource(cardHtml, 'renderBilingualName');
  assert.doesNotMatch(render, assignsInnerHtml, 'card.html 的 renderBilingualName 不可用 innerHTML');
  assert.match(functionSource(cardHtml, 'setNameWithEnglishLine'), /textContent = englishText/);

  const yuyukoRender = yuyukoHtml.slice(yuyukoHtml.indexOf('const renderName'), yuyukoHtml.indexOf('el.textContent = s;', yuyukoHtml.indexOf('const renderName')));
  assert.doesNotMatch(yuyukoRender, assignsInnerHtml, 'yuyuko.html 的 renderName 不可用 innerHTML');
});

test('電話／Email 備援按鈕不經過 HTML 字串組合', () => {
  const apply = functionSource(cardHtml, 'applyContacts');
  assert.doesNotMatch(apply, /insertAdjacentHTML/, '備援按鈕不可用 insertAdjacentHTML 組字串');
  assert.doesNotMatch(apply, /\$\{(phone|email)\}/, '電話、Email 不可直接塞進 HTML 字串');
  assert.match(functionSource(cardHtml, 'buildFallbackContactButton'), /setAttribute\('href', href\)/);
});

test('DOMPurify 沒載入時不可放行原本的 HTML', () => {
  // 舊寫法：div.textContent = html 再讀 div.textContent，讀回來的就是原字串，等於沒過濾
  const unsafeFallback = /textContent = html;\s*\n\s*(sanitized = plain\.textContent|return plain\.textContent)/;
  const filter = functionSource(cardHtml, 'filterSystemHtml');
  assert.doesNotMatch(filter, unsafeFallback, 'card.html filterSystemHtml 的備援寫法不安全');
  assert.match(filter, /escapePlainText\(textOnlyFromUntrustedHtml\(html\)\)/);
  assert.match(functionSource(cardHtml, 'textOnlyFromUntrustedHtml'), /new DOMParser\(\)\.parseFromString/);

  const save = functionSource(editChunk4, 'sanitizeRichTextHtmlForSave');
  assert.doesNotMatch(save, unsafeFallback, 'edit-chunk-4.js 儲存端的備援寫法不安全');
  assert.match(save, /new DOMParser\(\)\.parseFromString/);
});

test('微信按鈕被拿掉連結時，仍會用存著的微信號補回來', () => {
  const enhance = functionSource(cardHtml, 'enhanceWeChatContactLinks');
  assert.match(enhance, /querySelectorAll\('a'\)/, '要連沒有 href 的微信按鈕一起處理');
  assert.match(functionSource(cardHtml, 'normalizeWeChatContactAnchor'), /'weixin:\/\/dl\/chat\?' \+ encodeURIComponent\(wechatId\)/);
});

// 編輯頁主邏輯：文字、公司、圖片與聯絡方式入口。
function setFontWeight(weight) {
  if (!currentStyledElement) return;
  
  currentStyledElement.style.fontWeight = weight === 'bold' ? '700' : '400';
  currentStyledElement.dataset.fontWeight = weight;
  
  updateToolbarState(currentStyledElement);
}

function setFontColor(color) {
  if (!currentStyledElement) {
    return;
  }
  
  currentStyledElement.style.color = color;
  currentStyledElement.dataset.fontColor = color;
  
  // 更新調色盤顯示
  const picker = document.getElementById('fontColorPicker');
  if (picker && picker.value !== color) {
    picker.value = color;
  }
  
  // 確保焦點保持在元素上
  currentStyledElement.focus();
}

// 點擊其他地方時隱藏工具列
document.addEventListener('click', function(e) {
  const toolbar = document.getElementById('fontStyleToolbar');
  if (!toolbar) return;
  
  // 如果點擊的是工具列或工具列內的按鈕，不隱藏
  if (toolbar.contains(e.target)) return;
  
  // 如果點擊的是可編輯欄位，showFontStyleToolbar 會處理
  const editableTarget = e.target.closest('[contenteditable="true"]');
  if (editableTarget && editableTarget.classList.contains('edit-clickable')) return;
  
  // 否則隱藏工具列
  hideFontStyleToolbar();
});

// 滾動時更新工具列位置
document.addEventListener('scroll', function() {
  if (currentStyledElement) {
    const toolbar = document.getElementById('fontStyleToolbar');
    if (toolbar && toolbar.classList.contains('active')) {
      const rect = currentStyledElement.getBoundingClientRect();
      toolbar.style.top = (rect.top - 50) + 'px';
      toolbar.style.left = (rect.left + rect.width / 2) + 'px';
    }
  }
}, true);

// 修正：contenteditable 貼上時一律以「純文字」插入，避免插入 HTML 造成結構變動與游標跑位
// 並在貼上後強制觸發 input/blur 事件以同步資料
document.addEventListener('paste', function (e) {
  try {
    const t = e.target;
    if (!t || !t.closest) return;
    const el = t.closest('[contenteditable="true"]');
    if (!el) return;
    // 只處理可編輯欄位（避免影響其他輸入）
    if (!el.classList || !el.classList.contains('edit-clickable')) return;

    const text = (e.clipboardData || window.clipboardData)?.getData('text/plain');
    if (typeof text !== 'string') return;
    e.preventDefault();

    // 優先用 execCommand（相容性好），不行再用 Range
    if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
      document.execCommand('insertText', false, text);
    } else {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      sel.deleteFromDocument();
      const range = sel.getRangeAt(0);
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    
    // 強制觸發同步
    if (el.onblur) el.onblur();
  } catch (_e) {}
});

// ===== 公司選擇器（必選下拉 + 關鍵字匹配）=====
// 規格：
// - 公司清單來源：從 cards.company 自動彙整（去重）
// - 一般使用者：第一次儲存後鎖定公司（避免改掉導致企業管理員看不到）
// - 管理員模式：可改他人公司（不受鎖定限制）
window.__uvacoCompanyOptions = window.__uvacoCompanyOptions || null; // Array<string>
window.__uvacoSelectedCompany = window.__uvacoSelectedCompany || ''; // canonical company (cards.company)
window.__uvacoOriginalCompanyCanonical = window.__uvacoOriginalCompanyCanonical || '';
window.__uvacoCompanyLocked = window.__uvacoCompanyLocked || false;

function getEditUrlTargetUserId() {
  try {
    const p = new URLSearchParams(window.location.search || '');
    return p.get('targetUserId') || p.get('uid') || p.get('id') || '';
  } catch (e) { return ''; }
}

function isAdminModeFromUrl() {
  try {
    const p = new URLSearchParams(window.location.search || '');
    return p.get('adminMode') === 'true';
  } catch (e) { return false; }
}

async function loadCompanyOptionsFromCards() {
  if (Array.isArray(window.__uvacoCompanyOptions)) return window.__uvacoCompanyOptions;
  window.__uvacoCompanyOptions = [];
  try {
    if (!window.UVACO_CLOUD || !UVACO_CLOUD.hasConfig()) return window.__uvacoCompanyOptions;
    // 需要登入（走 RLS）
    const here = 'edit.html' + (window.location.search || '');
    const auth = await UVACO_CLOUD.requireAuth(here);
    if (!auth.ok) return window.__uvacoCompanyOptions;

    const client = UVACO_CLOUD.getClient();
    if (!client) return window.__uvacoCompanyOptions;

    // 取前 1000 筆 company 作去重（足夠用於下拉；若未來很大可改成 RPC/索引）
    const { data, error } = await client
      .from('cards')
      .select('company')
      .not('company', 'is', null)
      .limit(1000);
    if (error) return window.__uvacoCompanyOptions;

    const set = new Set();
    (data || []).forEach(r => {
      const c = String(r?.company || '').trim();
      if (c) set.add(c);
    });
    window.__uvacoCompanyOptions = Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  } catch (e) {}
  return window.__uvacoCompanyOptions;
}

function getSloganStrong(lang) {
  try {
    const containerId = (lang === 'zh') ? 'previewSlogansZh' : 'previewSlogansEn';
    const container = document.getElementById(containerId);
    if (!container) return null;
    const strong = container.querySelector('strong');
    return strong || null;
  } catch (e) { return null; }
}

function getCanonicalCompanyFromStrongText(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  // 只取左半邊（公司名）作為 canonical
  return s.split(/\s*[｜|]\s*/)[0].trim();
}

function applyCompanyToUI(canonical) {
  const c = String(canonical || '').trim();
  if (!c) return false;

  // 中文 strong：保留右半邊（若存在），若無則建立
  const zhStrong = getSloganStrong('zh');
  if (zhStrong) {
    const old = String(zhStrong.textContent || '').trim();
    const parts = old.split(/\s*｜\s*/);
    const suffix = (parts.length >= 2) ? parts.slice(1).join('｜').trim() : '專業陪伴';
    zhStrong.textContent = c + '｜' + (suffix || '專業陪伴');
  } else {
    // 建立一個帶 strong 的 slogan
    const container = document.getElementById('previewSlogansZh');
    if (container) {
      const div = document.createElement('div');
      div.className = 'slogan-item';
      div.innerHTML = `
        <div class="tagline lang-zh edit-clickable" contenteditable="true"><strong>${c}｜專業陪伴</strong></div>
        <button class="slogan-delete-btn" onclick="deleteSloganFromPreview(this)" title="刪除">✕</button>
      `;
      container.insertBefore(div, container.firstChild);
    }
  }

  // 英文 strong：保留右半邊（若存在），若無則建立
  const enStrong = getSloganStrong('en');
  if (enStrong) {
    const old = String(enStrong.textContent || '').trim();
    const parts = old.split(/\s*\|\s*/);
    const suffix = (parts.length >= 2) ? parts.slice(1).join('|').trim() : 'Professional Support';
    enStrong.textContent = c + ' | ' + (suffix || 'Professional Support');
  } else {
    const container = document.getElementById('previewSlogansEn');
    if (container) {
      const div = document.createElement('div');
      div.className = 'slogan-item';
      div.innerHTML = `
        <div class="tagline lang-en edit-clickable" contenteditable="true"><strong>${c} | Professional Support</strong></div>
        <button class="slogan-delete-btn" onclick="deleteSloganFromPreview(this)" title="Delete">✕</button>
      `;
      container.insertBefore(div, container.firstChild);
    }
  }

  window.__uvacoSelectedCompany = c;
  // 同步整理，避免事件缺失
  if (typeof updateSlogansPreview === 'function') updateSlogansPreview();
  // 更新鎖定提示
  try {
    const badge = document.getElementById('uvacoCompanyLockBadge');
    if (badge) {
      badge.textContent = '公司：必選下拉（可輸入關鍵字快速帶入）';
      /*
      badge.textContent = window.__uvacoCompanyLocked && !isAdminModeFromUrl()
        ? '公司已鎖定（如需更改請聯絡管理員）'
        : '公司：必選下拉（可輸入關鍵字快速帶入）';
      */
    }
  } catch (e) {}
  return true;
}

function ensureCompanySelectorModal() {
  if (document.getElementById('uvacoCompanyModal')) return;
  const overlay = document.createElement('div');
  overlay.id = 'uvacoCompanyModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;z-index:3000;padding:18px;';
  overlay.innerHTML = `
    <div style="width:100%;max-width:520px;border-radius:16px;padding:16px 14px;background:#111;border:1px solid rgba(255,255,255,.10);color:#fff;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">
        <div style="font-weight:800;color:var(--uvaco-green);">選擇公司</div>
        <button type="button" id="uvacoCompanyCloseBtn" style="border:none;background:transparent;color:#9ca3af;font-size:20px;cursor:pointer;">✕</button>
      </div>
      <div style="font-size:13px;color:#9ca3af;line-height:1.6;margin-bottom:10px;">
        請輸入關鍵字搜尋公司名稱，並從清單點選帶入。<br>
        （公司為必選；第一次儲存後會鎖定，避免改掉導致管理權限失效）
      </div>
      <input id="uvacoCompanySearch" type="text" placeholder="輸入關鍵字（例如：UVACO / 葡眾）" style="width:100%;box-sizing:border-box;padding:12px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:#1a1a1a;color:#fff;font-size:14px;outline:none;" />
      <div id="uvacoCompanyList" style="margin-top:10px;max-height:280px;overflow:auto;border-radius:12px;border:1px solid rgba(255,255,255,.10);background:#151515;"></div>
      <div style="display:flex;gap:10px;margin-top:12px;">
        <button type="button" id="uvacoCompanyCancel" style="flex:1;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.06);color:#fff;cursor:pointer;">取消</button>
        <button type="button" id="uvacoCompanyConfirm" style="flex:1;padding:12px;border-radius:12px;border:none;background:var(--uvaco-green);color:#fff;font-weight:800;cursor:pointer;">確認帶入</button>
      </div>
      <div id="uvacoCompanyErr" style="display:none;margin-top:10px;color:#ef4444;font-size:13px;white-space:pre-wrap;"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeCompanySelector();
  });
  document.getElementById('uvacoCompanyCloseBtn')?.addEventListener('click', closeCompanySelector);
  document.getElementById('uvacoCompanyCancel')?.addEventListener('click', closeCompanySelector);

  // 搜尋互動
  const input = document.getElementById('uvacoCompanySearch');
  if (input) {
    input.addEventListener('input', () => renderCompanyList());
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { closeCompanySelector(); return; }
      if (ev.key === 'Enter') {
        ev.preventDefault();
        // Enter：優先帶入第一個可見選項；若沒有，則用輸入框文字建立並帶入
        const first = document.querySelector('#uvacoCompanyList button[data-company]');
        if (first) {
          first.click();
        } else {
          document.getElementById('uvacoCompanyConfirm')?.click();
        }
      }
    });
  }

  document.getElementById('uvacoCompanyConfirm')?.addEventListener('click', () => {
    const inputVal = String(document.getElementById('uvacoCompanySearch')?.value || '').trim();
    const chosen = String(overlay.getAttribute('data-chosen') || '').trim();
    const value = chosen || inputVal;
    if (!value) {
      showCompanyErr('請輸入或選擇公司名稱。');
      return;
    }
    // 建立新公司：把新值加入 options（避免下次搜尋找不到）
    try {
      window.__uvacoCompanyOptions = Array.isArray(window.__uvacoCompanyOptions) ? window.__uvacoCompanyOptions : [];
      if (!window.__uvacoCompanyOptions.includes(value)) {
        window.__uvacoCompanyOptions.push(value);
        window.__uvacoCompanyOptions.sort((a, b) => String(a).localeCompare(String(b), 'zh-Hant'));
      }
    } catch (e) {}
    applyCompanyToUI(value);
    closeCompanySelector();
  });
}

function showCompanyErr(msg) {
  const el = document.getElementById('uvacoCompanyErr');
  if (!el) return;
  el.style.display = 'block';
  el.textContent = String(msg || '');
}

function clearCompanyErr() {
  const el = document.getElementById('uvacoCompanyErr');
  if (!el) return;
  el.style.display = 'none';
  el.textContent = '';
}

function openCompanySelector() {
  // 鎖定：一般使用者不可改；管理員模式可改
  // 讓客戶可以編輯公司：移除鎖定檢查
  /*
  if (window.__uvacoCompanyLocked && !isAdminModeFromUrl()) {
    alert('公司已鎖定，如需更改請聯絡管理員。');
    return;
  }
  */
  ensureCompanySelectorModal();
  clearCompanyErr();
  const overlay = document.getElementById('uvacoCompanyModal');
  if (!overlay) return;
  overlay.style.display = 'flex';
  overlay.setAttribute('data-chosen', '');
  const input = document.getElementById('uvacoCompanySearch');
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 0);
  }
  // 先載入公司清單再渲染
  Promise.resolve(loadCompanyOptionsFromCards()).then(() => renderCompanyList());
}

function closeCompanySelector() {
  const overlay = document.getElementById('uvacoCompanyModal');
  if (!overlay) return;
  overlay.style.display = 'none';
}

function renderCompanyList() {
  const list = document.getElementById('uvacoCompanyList');
  const overlay = document.getElementById('uvacoCompanyModal');
  if (!list || !overlay) return;
  const q = String(document.getElementById('uvacoCompanySearch')?.value || '').trim().toLowerCase();
  const options = Array.isArray(window.__uvacoCompanyOptions) ? window.__uvacoCompanyOptions : [];
  const filtered = q
    ? options.filter(c => String(c).toLowerCase().includes(q)).slice(0, 50)
    : options.slice(0, 50);

  if (!options.length) {
    list.innerHTML = `<div style="padding:12px;color:#9ca3af;font-size:13px;line-height:1.6;">目前尚無公司清單（cards.company 為空）。\n請先由管理員建立第一張名片以產生公司選項。</div>`;
    return;
  }

  if (!filtered.length) {
    const displayQ = String(document.getElementById('uvacoCompanySearch')?.value || '').trim();
    list.innerHTML = `
      <div style="padding:12px;color:#9ca3af;font-size:13px;line-height:1.6;">
        找不到符合的公司名稱。
      </div>
      ${displayQ ? `
        <button type="button" id="uvacoCompanyCreateBtn"
          style="width:100%;text-align:left;padding:12px;border:none;border-top:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.06);color:#fff;cursor:pointer;font-size:14px;font-weight:800;">
          ➕ 建立並帶入「${displayQ}」
        </button>
      ` : ''}
    `;
    const btn = document.getElementById('uvacoCompanyCreateBtn');
    if (btn && displayQ) {
      btn.addEventListener('click', () => {
        overlay.setAttribute('data-chosen', displayQ);
        clearCompanyErr();
        applyCompanyToUI(displayQ);
      });
    }
    return;
  }

  list.innerHTML = '';
  filtered.forEach(company => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-company', company);
    btn.style.cssText = 'width:100%;text-align:left;padding:12px;border:none;border-bottom:1px solid rgba(255,255,255,.06);background:transparent;color:#fff;cursor:pointer;font-size:14px;';
    btn.textContent = company;
    btn.addEventListener('click', () => {
      overlay.setAttribute('data-chosen', company);
      clearCompanyErr();
      // 立即預覽帶入（但不關閉，讓使用者可再選）
      applyCompanyToUI(company);
    });
    list.appendChild(btn);
  });
}

function injectCompanyPickerButtons() {
  // 已注入就不重複
  if (document.getElementById('uvacoCompanyPickBtnZh')) return;

  const anchorZh = getSloganStrong('zh')?.parentElement;
  const anchorEn = getSloganStrong('en')?.parentElement;
  if (!anchorZh && !anchorEn) return;

  // 小螢幕堆疊：用 wrapper 包住按鈕 + badge，避免 iPhone SE 擠壓
  const makeWrap = (lang) => {
    const wrap = document.createElement('div');
    wrap.className = `uvaco-company-picker-wrap lang-${lang}`;
    return wrap;
  };

  const makeBadge = () => {
    const badge = document.createElement('div');
    badge.id = 'uvacoCompanyLockBadge';
    badge.className = 'uvaco-company-picker-badge';
    badge.textContent = '公司：必選下拉（可輸入關鍵字快速帶入）';
    /*
    badge.textContent = window.__uvacoCompanyLocked && !isAdminModeFromUrl()
      ? '公司已鎖定（如需更改請聯絡管理員）'
      : '公司：必選下拉（可輸入關鍵字快速帶入）';
    */
    return badge;
  };

  // 中文按鈕 + badge
  if (anchorZh) {
    const wrapZh = makeWrap('zh');
    const btnZh = document.createElement('button');
    btnZh.type = 'button';
    btnZh.id = 'uvacoCompanyPickBtnZh';
    btnZh.className = 'edit-add-btn lang-zh';
    btnZh.textContent = '🏢 選擇公司';
    btnZh.onclick = openCompanySelector;
    wrapZh.appendChild(btnZh);
    wrapZh.appendChild(makeBadge());
    anchorZh.insertAdjacentElement('afterend', wrapZh);
  }

  // 英文按鈕 + badge（若中文不存在才插入 badge，避免重複 id）
  if (anchorEn) {
    const wrapEn = makeWrap('en');
    const btnEn = document.createElement('button');
    btnEn.type = 'button';
    btnEn.id = 'uvacoCompanyPickBtnEn';
    btnEn.className = 'edit-add-btn lang-en';
    btnEn.textContent = '🏢 Select Company';
    btnEn.onclick = openCompanySelector;
    wrapEn.appendChild(btnEn);
    // 若中文已插入 badge（已存在 id），英文就不再插入 badge
    if (!document.getElementById('uvacoCompanyLockBadge')) {
      wrapEn.appendChild(makeBadge());
    }
    anchorEn.insertAdjacentElement('afterend', wrapEn);
  }
}

// 從預覽更新姓名
function updateNameFromPreview() {
  const nameZhEl = document.getElementById('previewNameZh');
  if (!nameZhEl) return;
  const nameZhText = String(nameZhEl.textContent || '').replace(/\s+/g, ' ').trim();
  if (!nameZhText) return;
  
  // 同步到隱藏的 input 欄位（若未來表單需要）
  const nameInp = document.getElementById('nameZh');
  if (nameInp) nameInp.value = nameZhText;

  // 解析姓名（格式：中文名 ｜ 英文名）
  const zhMatch = nameZhText.match(/^(.+?)\s*｜\s*(.+)$/);

  // 相容：使用者可能輸入「中文（EN）」或「中文(EN)」
  const zhParen = nameZhText.match(/^(.+?)\s*[（(]\s*([^)）]+)\s*[)）]\s*$/);
  
  if (zhMatch) {
    nameZhEl.innerHTML = zhMatch[1].trim() + ' ｜ <span class="en">' + zhMatch[2].trim() + '</span>';
  } else if (zhParen) {
    nameZhEl.innerHTML = zhParen[1].trim() + ' ｜ <span class="en">' + zhParen[2].trim() + '</span>';
  } else {
    nameZhEl.textContent = nameZhText;
  }

  // 套用自動縮字，確保單行水平顯示
  try {
    const isSmall = (window.matchMedia && window.matchMedia('(max-width: 420px)').matches);
    fitTextToSingleLine(nameZhEl, { minPx: 16, maxPx: isSmall ? 30 : 34 });
  } catch (e) {}
}

// 從預覽更新職務
function updateTitleFromPreview() {
  const titleZhEl = document.getElementById('previewTitleZh');
  const titleEnEl = document.getElementById('previewTitleEn');
  
  // 取得純文字並清理多餘空白
  const zhText = String(titleZhEl?.textContent || '').replace(/\s+/g, ' ').trim();
  const enText = String(titleEnEl?.textContent || '').replace(/\s+/g, ' ').trim();

  // 更新回 DOM 確保一致性
  if (titleZhEl) titleZhEl.textContent = zhText;
  if (titleEnEl) titleEnEl.textContent = enText;

  // 同步到隱藏的 input 欄位（若未來表單需要）
  const zhInp = document.getElementById('titleZh');
  const enInp = document.getElementById('titleEn');
  if (zhInp) zhInp.value = zhText;
  if (enInp) enInp.value = enText;
}

// 從預覽更新公司名稱
function updateCompanyFromPreview() {
  const zhEl = document.getElementById('previewCompanyNameZh');
  const enEl = document.getElementById('previewCompanyNameEn');
  
  // 取得純文字並清理多餘空白
  const companyZh = String(zhEl?.textContent || '').replace(/\s+/g, ' ').trim();
  const companyEn = String(enEl?.textContent || '').replace(/\s+/g, ' ').trim();
  
  // 更新回 DOM 確保一致性
  if (zhEl) zhEl.textContent = companyZh;
  if (enEl) enEl.textContent = companyEn;
  
  // 儲存到全域變數供 saveCard 使用
  window.__uvacoCompanyZh = companyZh;
  window.__uvacoCompanyEn = companyEn;
  window.__uvacoSelectedCompany = companyZh || companyEn;
}

// ===== 自動縮字：讓元素文字保持單行水平呈現（超出就縮小到 minPx）=====
function fitTextToSingleLine(el, opts) {
  if (!el) return;
  const minPx = (opts && typeof opts.minPx === 'number') ? opts.minPx : 16;
  const maxPx = (opts && typeof opts.maxPx === 'number') ? opts.maxPx : 34;

  // 只在可見時處理
  const rect = el.getBoundingClientRect();
  if (!rect.width || rect.width <= 0) return;

  el.style.whiteSpace = 'nowrap';
  el.style.fontSize = maxPx + 'px';

  // 若仍超出，逐步縮小
  let size = maxPx;
  // 迴圈上限避免卡住
  for (let i = 0; i < 40; i++) {
    if (el.scrollWidth <= el.clientWidth + 1) break;
    size -= 1;
    if (size <= minPx) { size = minPx; break; }
    el.style.fontSize = size + 'px';
  }
}

// 初次載入/視窗改變時也重算（避免 iPhone SE 旋轉或縮放後跑版）
window.addEventListener('resize', function () {
  try {
    const isSmall = (window.matchMedia && window.matchMedia('(max-width: 420px)').matches);
    fitTextToSingleLine(document.getElementById('previewNameZh'), { minPx: 16, maxPx: isSmall ? 30 : 34 });
  } catch (e) {}
});

// 更新標語預覽
function updateSlogansPreview() {
  // 修正：標語目前是直接在預覽區（contenteditable）編輯，
  // 若這裡用 #slogansZhList/#slogansEnList 的 input 來源重建 DOM，
  // 會導致編輯後內容被覆蓋成空，出現「編輯後消失、無法儲存」的問題。

  const zhContainer = document.getElementById('previewSlogansZh');
  const enContainer = document.getElementById('previewSlogansEn');
  if (!zhContainer || !enContainer) return;

  // 記錄目前的焦點位置，避免 normalizeContainer 重建內容時游標跳掉
  const selection = window.getSelection();
  let focusedEl = null;
  let offset = 0;
  if (selection && selection.rangeCount > 0) {
    focusedEl = selection.focusNode;
    offset = selection.focusOffset;
  }

  // 只做最小化整理：清理空白、確保 class/事件存在，並修復結構
  const normalizeContainer = (container, lang) => {
    // 1. 先修復結構：找出所有沒有被 .slogan-item 包裹的 .tagline，將其包裹並加上刪除按鈕
    const orphanedTaglines = Array.from(container.children).filter(el => 
      el.classList.contains('tagline') && !el.closest('.slogan-item')
    );
    
    orphanedTaglines.forEach(tagline => {
      const wrapper = document.createElement('div');
      wrapper.className = 'slogan-item';
      
      // 插入 wrapper 到 tagline 原本的位置
      container.insertBefore(wrapper, tagline);
      
      // 移動 tagline 到 wrapper 內
      wrapper.appendChild(tagline);
      
      // 加入刪除按鈕
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'slogan-delete-btn';
      deleteBtn.textContent = '✕';
      deleteBtn.title = lang === 'zh' ? '刪除標語' : 'Delete slogan';
      deleteBtn.onclick = function(e) {
         e.stopPropagation();
         deleteSloganFromPreview(this);
      };
      wrapper.appendChild(deleteBtn);
    });

    // 2. 針對所有 .slogan-item 進行正規化
    const items = Array.from(container.querySelectorAll('.slogan-item'));
    items.forEach(item => {
      let tagline = item.querySelector('.tagline');
      
      // 如果 .slogan-item 裡面沒有 .tagline（罕見），補一個
      if (!tagline) {
         tagline = document.createElement('div');
         tagline.className = 'tagline';
         item.insertBefore(tagline, item.firstChild);
      }

      // 確保語系 class 正確
      tagline.classList.add('tagline');
      tagline.classList.toggle('lang-zh', lang === 'zh');
      tagline.classList.toggle('lang-en', lang !== 'zh');
      tagline.classList.add('edit-clickable');

      // 確保可編輯與事件存在
      tagline.contentEditable = 'true';
      
      // 使用閉包綁定事件，避免全域污染
      // 防止重複綁定
      tagline.onblur = function() {
        // 重要：這裡不呼叫 normalizeContainer，也不遞迴呼叫 updateSlogansPreview
        // 只做資料同步
        updateCompanyFromSlogans();
      };
      
      tagline.onclick = function() { focusEdit(this); };

      // 確保有刪除按鈕
      if (!item.querySelector('.slogan-delete-btn')) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'slogan-delete-btn';
        deleteBtn.textContent = '✕';
        deleteBtn.title = lang === 'zh' ? '刪除標語' : 'Delete slogan';
        deleteBtn.onclick = function(e) {
            e.stopPropagation();
            deleteSloganFromPreview(this);
        };
        item.appendChild(deleteBtn);
      }

      // 若使用者把內容清空，給一個最小提示字避免整個消失
      const html = String(tagline.innerHTML || '').trim();
      const text = String(tagline.textContent || '').trim();
      // 只有當真的什麼都沒有時才給預設值，且不要在用戶正在編輯時干擾
      if (!html && !text && document.activeElement !== tagline) {
        tagline.textContent = (lang === 'zh') ? '新標語' : 'New Slogan';
      }
    });
  };

  // 只有在非編輯狀態下才執行 normalize，避免干擾輸入法
  // 但為了確保按鈕事件綁定，這裡還是得執行，只是要小心不要動到 activeElement
  normalizeContainer(zhContainer, 'zh');
  normalizeContainer(enContainer, 'en');

  // 立即更新公司名稱
  updateCompanyFromSlogans();
}

function updateCompanyFromSlogans() {
  const zhStrong = getSloganStrong('zh');
  const enStrong = getSloganStrong('en');
  const currentCompany = getCanonicalCompanyFromStrongText(zhStrong ? zhStrong.textContent : (enStrong ? enStrong.textContent : ''));
  if (currentCompany) {
    window.__uvacoSelectedCompany = currentCompany;
  }
}

// ===== 圖片處理（壓縮/裁切/上傳 Storage）=====
// - avatar：最大 512px，目標 <= 1MB
// - logo：最大 1024px，目標 <= 1MB
window.__uvacoPendingAssets = window.__uvacoPendingAssets || {
  avatar: null, // { blob, contentType, ext }
  logo: null
};

function revokeObjectUrlSafe(url) {
  try { if (url && url.startsWith('blob:')) URL.revokeObjectURL(url); } catch (e) {}
}

async function compressImageFile(file, opts) {
  const maxDim = Math.max(64, parseInt(opts?.maxDim || 512, 10) || 512);
  const maxBytes = Math.max(50 * 1024, parseInt(opts?.maxBytes || 1024 * 1024, 10) || 1024 * 1024);
  const mime = String(opts?.mime || 'image/webp');

  if (!file || !file.type || !file.type.startsWith('image/')) {
    throw new Error('NOT_IMAGE');
  }

  const imgUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = imgUrl;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const w0 = img.naturalWidth || img.width || 1;
    const h0 = img.naturalHeight || img.height || 1;

    // 自動降品質/縮尺寸直到 <= maxBytes（避免你現在遇到的「處理失敗」）
    let targetMaxDim = maxDim;
    let outMime = mime;
    let blob = null;
    let tw = 0;
    let th = 0;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: true });

    async function encodeAt(quality) {
      if (outMime === 'image/jpeg') {
        return await new Promise((resolve) => canvas.toBlob(resolve, outMime, quality));
      }
      return await new Promise((resolve) => canvas.toBlob(resolve, outMime, quality));
    }

    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = Math.min(1, targetMaxDim / Math.max(w0, h0));
      tw = Math.max(1, Math.round(w0 * scale));
      th = Math.max(1, Math.round(h0 * scale));
      canvas.width = tw;
      canvas.height = th;
      ctx.clearRect(0, 0, tw, th);
      ctx.drawImage(img, 0, 0, tw, th);

      // 先試 webp（若瀏覽器不支援會得到 null），不支援就改 jpeg
      outMime = mime;
      let q = 0.9;
      blob = await encodeAt(q);
      if (!blob) {
        outMime = 'image/jpeg';
        q = 0.9;
        blob = await encodeAt(q);
      }
      if (!blob) throw new Error('TOBLOB_FAIL');

      // 逐步降品質
      while (blob.size > maxBytes && q > 0.3) {
        q = Math.max(0.3, q - 0.1);
        const b2 = await encodeAt(q);
        if (!b2) break;
        blob = b2;
      }

      if (blob && blob.size <= maxBytes) break;
      // 仍太大：再縮小一次尺寸重試
      targetMaxDim = Math.max(128, Math.floor(targetMaxDim * 0.8));
    }

    if (!blob) throw new Error('TOBLOB_FAIL');
    if (blob.size > maxBytes) throw new Error('TOO_LARGE');

    const ext = outMime === 'image/jpeg' ? 'jpg' : (outMime === 'image/png' ? 'png' : 'webp');
    return { blob, contentType: outMime, ext, width: tw, height: th, bytes: blob.size };
  } finally {
    revokeObjectUrlSafe(imgUrl);
  }
}

async function handleImagePickAndPreview(file, kind) {
  const zhElements = document.querySelectorAll('.lang-zh');
  const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';

  // 限制：原始檔案大小必須 <= 1MB（你要求）
  const maxInputBytes = 1024 * 1024;
  if (file && typeof file.size === 'number' && file.size > maxInputBytes) {
    const msg = (currentLang === 'zh')
      ? '圖片檔案過大：請上傳 1MB 以內的圖片。'
      : 'Image file is too large. Please upload an image within 1MB.';
    alert(msg);
    return;
  }

  const rules = (kind === 'avatar')
    ? { maxDim: 512, maxBytes: 1024 * 1024, mime: 'image/webp' }
    : { maxDim: 1024, maxBytes: 1024 * 1024, mime: 'image/webp' };

  // 上傳後先讓使用者拖曳調整位置、用滑桿縮放大小，選好範圍再壓縮存檔，
  // 而不是整張圖直接自動置中裁切（原本使用者完全沒辦法自己選要保留哪個部分）。
  const cropOpts = (kind === 'avatar')
    ? {
        shape: 'circle',
        titleZh: '調整頭像大小與位置', titleEn: 'Adjust Your Photo',
        aspectPresets: [{ labelZh: '1:1', labelEn: '1:1', ratio: 1 }]
      }
    : {
        shape: 'rect',
        titleZh: '調整 Logo 大小與位置', titleEn: 'Adjust Your Logo',
        aspectPresets: [
          { labelZh: '原始比例', labelEn: 'Original', ratio: null },
          { labelZh: '正方形', labelEn: 'Square', ratio: 1 },
          { labelZh: '橫式 2:1', labelEn: 'Wide 2:1', ratio: 2 },
          { labelZh: '橫式 3:1', labelEn: 'Wide 3:1', ratio: 3 }
        ]
      };

  const croppedBlob = await openImageCropper(file, cropOpts);
  if (!croppedBlob) return; // 使用者取消裁切，畫面維持原樣

  try {
    const out = await compressImageFile(croppedBlob, rules);
    window.__uvacoPendingAssets[kind] = { blob: out.blob, contentType: out.contentType, ext: out.ext };
    const url = URL.createObjectURL(out.blob);
    if (kind === 'avatar') {
      const el = document.getElementById('previewAvatar');
      const placeholder = document.getElementById('avatarPlaceholder');
      if (el) {
        el.src = url;
        el.style.display = 'block';
      }
      if (placeholder) placeholder.style.display = 'none';
    } else {
      const el = document.getElementById('previewLogo');
      const placeholder = document.getElementById('logoPlaceholder');

      if (el) {
        el.src = url;
        el.style.display = 'block';
      }
      if (placeholder) placeholder.style.display = 'none';
    }
  } catch (e) {
    const code = String(e && e.message ? e.message : '');
    const msg = (currentLang === 'zh')
      ? (code === 'TOO_LARGE'
          ? '圖片壓縮後仍超過 1MB：請換更小的圖片或先裁切後再上傳。'
          : code === 'NOT_IMAGE'
            ? '這不是圖片檔，請改選擇 JPG/PNG/WebP。'
            : '圖片處理失敗：請改用較小的圖片（1MB 以內），或先裁切/降低解析度再上傳。')
      : (code === 'TOO_LARGE'
          ? 'The compressed image is still over 1MB. Please crop or use a smaller image.'
          : code === 'NOT_IMAGE'
            ? 'Not an image file. Please choose JPG/PNG/WebP.'
            : 'Image processing failed. Please use a smaller image (within 1MB) or crop it first.');
    alert(msg);
  }
}

// 編輯 LOGO
function editLogo() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = function(event) {
    const file = event.target.files[0];
    if (file) {
      handleImagePickAndPreview(file, 'logo');
    }
  };
  input.click();
}

// 編輯頭像
function editAvatar() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = function(event) {
    const file = event.target.files[0];
    if (file) {
      handleImagePickAndPreview(file, 'avatar');
    }
  };
  input.click();
}

// 編輯聯絡方式
function editContact(event, type, currentLink) {
  event.preventDefault();
  event.stopPropagation();
  
  const zhElements = document.querySelectorAll('.lang-zh');
  const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';
  
  // 設置編輯模式
  window.isEditingContact = true;
  window.editingContactInfo = {
    type: type,
    currentLink: currentLink
  };
  
  // 顯示連結輸入模態框；微信按鈕編輯時顯示微信號，避免使用者看到難懂的 weixin:// 連結。
  const inputLink = (type === 'wechat' && typeof getWeChatIdFromLink === 'function')
    ? (getWeChatIdFromLink(currentLink) || currentLink)
    : currentLink;
  showLinkInputModal(inputLink, currentLang);
}

// 刪除聯絡方式按鈕
function deleteContactButton(btn) {
  const zhElements = document.querySelectorAll('.lang-zh');
  const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';
  const confirmMsg = currentLang === 'zh' ? '確定要刪除此聯絡方式嗎？' : 'Are you sure you want to delete this contact method?';
  
  if (confirm(confirmMsg)) {
    const anchor = (btn && btn.nodeName === 'A') ? btn : (btn && btn.closest ? btn.closest('a') : null);
    // 以 wrapper 為單位刪除（避免留下空白容器）
    const wrapper = anchor ? anchor.closest('.contact-btn-wrapper') : null;
    if (wrapper) {
      wrapper.remove();
      return;
    }
    // fallback：刪除相同連結的所有 wrapper
    const currentLink = anchor ? anchor.getAttribute('href') : '';
    if (currentLink) {
      document.querySelectorAll(`#previewContacts a[href="${CSS.escape(currentLink)}"]`)
        .forEach(a => a.closest('.contact-btn-wrapper')?.remove());
    }
  }
}

// ===== 聯絡方式顯示樣式（列表 / 小卡）=====
window.__uvacoContactLayout = window.__uvacoContactLayout || (function () {
  try {
    const v = String(localStorage.getItem('UVACO_CONTACT_LAYOUT') || '').toLowerCase();
    return (v === 'grid') ? 'grid' : 'list';
  } catch (e) {
    return 'list';
  }
})();

function applyContactLayout(layout) {
  const group = document.getElementById('previewContacts');
  const listBtn = document.getElementById('contactLayoutListBtn');
  const gridBtn = document.getElementById('contactLayoutGridBtn');
  const mode = (layout === 'grid') ? 'grid' : 'list';

  if (group) {
    group.classList.toggle('contact-layout-grid', mode === 'grid');
  }
  if (listBtn) listBtn.classList.toggle('is-active', mode === 'list');
  if (gridBtn) gridBtn.classList.toggle('is-active', mode === 'grid');
}

function setContactLayout(layout) {
  window.__uvacoContactLayout = (layout === 'grid') ? 'grid' : 'list';
  try { localStorage.setItem('UVACO_CONTACT_LAYOUT', window.__uvacoContactLayout); } catch (e) {}
  applyContactLayout(window.__uvacoContactLayout);
}

// 初始套用一次
setTimeout(() => applyContactLayout(window.__uvacoContactLayout), 0);

// 新增標語到預覽

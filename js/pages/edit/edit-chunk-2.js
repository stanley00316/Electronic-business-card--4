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

  try {
    const out = await compressImageFile(file, rules);
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
  
  // 顯示連結輸入模態框，預填當前連結
  showLinkInputModal(currentLink, currentLang);
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
function addSloganToPreview(lang) {
  // 若目前語系與要新增的語系不同，新增後會被 setLang() 隱藏（造成「點了沒出現」的錯覺）。
  // 因此這裡自動切換到對應語系，並把游標聚焦到新標語。
  const getCurrentLang = () => {
    const zhElements = document.querySelectorAll('.lang-zh');
    return (zhElements.length > 0 && zhElements[0].style.display !== 'none') ? 'zh' : 'en';
  };

  const containerId = lang === 'zh' ? 'previewSlogansZh' : 'previewSlogansEn';
  const container = document.getElementById(containerId);
  if (!container) return;

  const sloganItem = document.createElement('div');
  sloganItem.className = 'slogan-item';
  
  const tagline = document.createElement('div');
  tagline.className = `tagline lang-${lang} edit-clickable`;
  tagline.contentEditable = 'true';
  tagline.textContent = lang === 'zh' ? '新標語' : 'New Slogan';
  tagline.onblur = function() { updateSlogansPreview(); };
  tagline.onclick = function() { focusEdit(this); };
  
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'slogan-delete-btn';
  deleteBtn.textContent = '✕';
  deleteBtn.title = lang === 'zh' ? '刪除標語' : 'Delete slogan';
  deleteBtn.onclick = function(event) {
    event.stopPropagation();
    deleteSloganFromPreview(this);
  };
  
  // 組裝並加入
  sloganItem.appendChild(tagline);
  sloganItem.appendChild(deleteBtn);
  container.appendChild(sloganItem);

  // 同步整理（避免空白被清掉、確保事件存在）
  updateSlogansPreview();

  // 不自動切換語系（保持介面語言不變），僅聚焦到新標語
  setTimeout(() => {
    try { sloganItem.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
    try { focusEdit(tagline); } catch (e) { try { tagline.focus(); } catch (_e) {} }
  }, 0);

  return;

  // 下面原本的 append 若存在，保留但不會走到（避免重複 append）
  sloganItem.appendChild(tagline);
  sloganItem.appendChild(deleteBtn);
  container.appendChild(sloganItem);
  
  tagline.focus();
  focusEdit(tagline);
}

// 從預覽刪除標語
function deleteSloganFromPreview(btn) {
  if (!btn) return;
  const zhElements = document.querySelectorAll('.lang-zh');
  const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';
  const confirmMsg = currentLang === 'zh' ? '確定要刪除此標語嗎？' : 'Are you sure you want to delete this slogan?';
  
  if (confirm(confirmMsg)) {
    const item = btn.closest('.slogan-item');
    if (item) {
      item.remove();
      // 觸發更新以確保資料同步
      if (typeof updateCompanyFromSlogans === 'function') {
        updateCompanyFromSlogans();
      }
    }
  }
}

// 顯示聯絡方式類型選擇彈出視窗
function addContact(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const overlay = document.getElementById('contactTypeOverlay');
  if (overlay) {
    overlay.classList.add('show');
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    console.log('Contact type overlay shown');
  } else {
    console.error('contactTypeOverlay element not found');
  }
}

// 關閉聯絡方式類型選擇彈出視窗
function closeContactTypeModal(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  
  const overlay = document.getElementById('contactTypeOverlay');
  if (!overlay) return;
  
  // 如果點擊的是取消按鈕，直接關閉
  if (event && event.target && event.target.classList.contains('contact-type-cancel')) {
    overlay.classList.remove('show');
    overlay.style.display = 'none';
    document.body.style.overflow = '';
    return;
  }
  
  // 如果點擊的是 overlay 背景（不是 modal 內部），則關閉
  if (event && event.target && event.target.id === 'contactTypeOverlay') {
    overlay.classList.remove('show');
    overlay.style.display = 'none';
    document.body.style.overflow = '';
  }
}

// 獲取聯絡方式圖示
function getContactIcon(type) {
  const icons = {
    'company-phone': '<img src="phone-icon.svg" alt="Phone" class="btn-icon-phone">',
    'personal-phone': '<img src="mobile-icon.svg" alt="Mobile" class="btn-icon-mobile">',
    'email': '<img src="email-icon.svg" alt="Email" class="btn-icon-email">',
    'website': '<img src="website-icon.svg" alt="Website" class="btn-icon-website">',
    'line': '<img src="line-logo.svg" alt="LINE" class="btn-icon-line">',
    'official-line': '<img src="line-logo.svg" alt="LINE" class="btn-icon-line">',
    'facebook': '<img src="facebook-logo.svg" alt="Facebook" class="btn-icon-facebook">',
    'instagram': '<img src="instagram-logo.svg" alt="Instagram" class="btn-icon-instagram">',
    'linkedin': '<img src="linkedin-logo.svg" alt="LinkedIn" class="btn-icon-linkedin">',
    'twitter': '<img src="twitter-logo.svg" alt="X" class="btn-icon-twitter">',
    'youtube': '<img src="youtube-logo.svg" alt="YouTube" class="btn-icon-youtube">',
    'wechat': '<img src="wechat-logo.svg" alt="WeChat" class="btn-icon-wechat">',
    'whatsapp': '<img src="whatsapp-logo.svg" alt="WhatsApp" class="btn-icon-whatsapp">',
    'call': '<img src="phone-icon.svg" alt="Phone" class="btn-icon-phone">',
    'vcf': '<img src="file-icon.svg" alt="VCF" class="btn-icon-file">',
    'other': '➕'
  };
  return icons[type] || '📋';
}

// 選擇聯絡方式類型
function selectContactType(type, labelZh, labelEn) {
  // 關閉類型選擇彈出視窗
  const typeOverlay = document.getElementById('contactTypeOverlay');
  if (typeOverlay) {
    typeOverlay.classList.remove('show');
    typeOverlay.style.display = 'none';
  }
  
  const zhElements = document.querySelectorAll('.lang-zh');
  const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';
  
  // 其他：允許自訂「種類名稱」
  if (type === 'other') {
    window.pendingCustomType = {
      type: 'other',
      labelZh: labelZh || '其他',
      labelEn: labelEn || 'Other'
    };
    showCustomTypeModal();
    return;
  }

  // 根據類型設定預設連結格式和標籤
  let defaultLink = '';
  let buttonTextZh = '';
  let buttonTextEn = '';
  let placeholderText = '';
  
  switch(type) {
    case 'company-phone':
      defaultLink = '';
      placeholderText = '例：02-12345678';
      buttonTextZh = '<img src="phone-icon.svg" alt="Phone" class="btn-icon-phone"> 公司電話';
      buttonTextEn = '<img src="phone-icon.svg" alt="Phone" class="btn-icon-phone"> Company Phone';
      break;
    case 'personal-phone':
      defaultLink = '';
      placeholderText = '例：0912345678';
      buttonTextZh = '<img src="mobile-icon.svg" alt="Mobile" class="btn-icon-mobile"> 個人電話';
      buttonTextEn = '<img src="mobile-icon.svg" alt="Mobile" class="btn-icon-mobile"> Personal Phone';
      break;
    case 'call':
      defaultLink = '';
      placeholderText = '例：0912345678';
      buttonTextZh = '<img src="phone-icon.svg" alt="Phone" class="btn-icon-phone"> 立即來電';
      buttonTextEn = '<img src="phone-icon.svg" alt="Phone" class="btn-icon-phone"> Call Now';
      break;
    case 'email':
      defaultLink = '';
      placeholderText = '例：yourname@example.com';
      buttonTextZh = '<img src="email-icon.svg" alt="Email" class="btn-icon-email"> 寄送 Email';
      buttonTextEn = '<img src="email-icon.svg" alt="Email" class="btn-icon-email"> Send Email';
      break;
    case 'website':
      defaultLink = '';
      placeholderText = '例：www.example.com';
      buttonTextZh = '<img src="website-icon.svg" alt="Website" class="btn-icon-website"> 網站';
      buttonTextEn = '<img src="website-icon.svg" alt="Website" class="btn-icon-website"> Website';
      break;
    case 'line':
    case 'official-line':
      defaultLink = '';
      placeholderText = '例：https://line.me/R/ti/p/xxxxx';
      buttonTextZh = '<img src="line-logo.svg" alt="LINE" class="btn-icon-line"> LINE';
      buttonTextEn = '<img src="line-logo.svg" alt="LINE" class="btn-icon-line"> LINE';
      break;
    case 'facebook':
      defaultLink = '';
      placeholderText = '例：facebook.com/yourpage';
      buttonTextZh = '<img src="facebook-logo.svg" alt="Facebook" class="btn-icon-facebook"> Facebook';
      buttonTextEn = '<img src="facebook-logo.svg" alt="Facebook" class="btn-icon-facebook"> Facebook';
      break;
    case 'instagram':
      defaultLink = '';
      placeholderText = '例：@yourusername 或 instagram.com/yourusername';
      buttonTextZh = '<img src="instagram-logo.svg" alt="Instagram" class="btn-icon-instagram"> Instagram';
      buttonTextEn = '<img src="instagram-logo.svg" alt="Instagram" class="btn-icon-instagram"> Instagram';
      break;
    case 'linkedin':
      defaultLink = '';
      placeholderText = '例：linkedin.com/in/yourprofile';
      buttonTextZh = '<img src="linkedin-logo.svg" alt="LinkedIn" class="btn-icon-linkedin"> LinkedIn';
      buttonTextEn = '<img src="linkedin-logo.svg" alt="LinkedIn" class="btn-icon-linkedin"> LinkedIn';
      break;
    case 'twitter':
      defaultLink = '';
      placeholderText = '例：@yourusername 或 x.com/yourusername';
      buttonTextZh = '<img src="twitter-logo.svg" alt="X" class="btn-icon-twitter"> X (Twitter)';
      buttonTextEn = '<img src="twitter-logo.svg" alt="X" class="btn-icon-twitter"> X (Twitter)';
      break;
    case 'youtube':
      defaultLink = '';
      placeholderText = '例：youtube.com/@yourchannel';
      buttonTextZh = '<img src="youtube-logo.svg" alt="YouTube" class="btn-icon-youtube"> YouTube';
      buttonTextEn = '<img src="youtube-logo.svg" alt="YouTube" class="btn-icon-youtube"> YouTube';
      break;
    case 'wechat':
      defaultLink = '';
      placeholderText = '例：your_wechat_id';
      buttonTextZh = '<img src="wechat-logo.svg" alt="WeChat" class="btn-icon-wechat"> 微信';
      buttonTextEn = '<img src="wechat-logo.svg" alt="WeChat" class="btn-icon-wechat"> WeChat';
      break;
    case 'whatsapp':
      defaultLink = '';
      placeholderText = '例：+886912345678';
      buttonTextZh = '<img src="whatsapp-logo.svg" alt="WhatsApp" class="btn-icon-whatsapp"> WhatsApp';
      buttonTextEn = '<img src="whatsapp-logo.svg" alt="WhatsApp" class="btn-icon-whatsapp"> WhatsApp';
      break;
    case 'vcf':
      defaultLink = '';
      placeholderText = '例：contact.vcf';
      buttonTextZh = '<img src="file-icon.svg" alt="VCF" class="btn-icon-file"> 儲存到通訊錄（VCF）';
      buttonTextEn = '<img src="file-icon.svg" alt="VCF" class="btn-icon-file"> Save Contact (VCF)';
      break;
    default:
      defaultLink = '';
      placeholderText = '';
      buttonTextZh = '🔗 ' + labelZh;
      buttonTextEn = '🔗 ' + labelEn;
  }
  
  // 保存當前選擇的類型信息，用於後續處理
  window.currentContactType = {
    type: type,
    labelZh: labelZh,
    labelEn: labelEn,
    defaultLink: defaultLink,
    buttonTextZh: buttonTextZh,
    buttonTextEn: buttonTextEn,
    placeholder: placeholderText
  };
  
  // 立即顯示連結輸入模態框（不關閉 body overflow，因為模態框會保持）
  setTimeout(() => {
    showLinkInputModal(defaultLink, currentLang);
  }, 100);
}

// ===== 自訂「其他」類型 =====
function showCustomTypeModal() {
  const overlay = document.getElementById('customTypeOverlay');
  if (!overlay) return;

  // 清空 / 預填
  const zh = document.getElementById('customTypeZh');
  const en = document.getElementById('customTypeEn');
  if (zh) zh.value = '';
  if (en) en.value = '';

  overlay.classList.add('show');
  document.body.style.overflow = 'hidden';
  setTimeout(() => {
    if (zh) zh.focus();
  }, 50);
}

function closeCustomTypeModal(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const overlay = document.getElementById('customTypeOverlay');
  if (overlay) {
    overlay.classList.remove('show');
  }
  document.body.style.overflow = '';
  window.pendingCustomType = null;
}

function submitCustomType(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const zhEl = document.getElementById('customTypeZh');
  const enEl = document.getElementById('customTypeEn');
  const zhName = (zhEl?.value || '').trim();
  const enName = (enEl?.value || '').trim();

  const zhElements = document.querySelectorAll('.lang-zh');
  const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';

  if (!zhName && !enName) {
    alert(currentLang === 'zh' ? '請至少輸入一個名稱' : 'Please enter at least one name');
    return;
  }

  // 若只填一種語言，另一種自動用同一個名稱
  const finalZh = zhName || enName;
  const finalEn = enName || zhName;

  // 用主題 accent 的 icon + 自訂文字
  const icon = getContactIcon('other');
  const buttonTextZh = `${icon} ${finalZh}`;
  const buttonTextEn = `${icon} ${finalEn}`;

  // 設定為新增模式，下一步輸入連結
  window.currentContactType = {
    type: 'other',
    labelZh: finalZh,
    labelEn: finalEn,
    defaultLink: '',
    buttonTextZh,
    buttonTextEn
  };

  closeCustomTypeModal();

  // 進入連結輸入流程
  showLinkInputModal('', currentLang);
}

// 顯示連結輸入模態框
function showLinkInputModal(defaultLink, currentLang) {
  const overlay = document.getElementById('linkInputOverlay');
  const inputField = document.getElementById('linkInputField');
  const help = document.getElementById('linkInputHelp');
  
  if (overlay && inputField) {
    inputField.value = defaultLink || '';
    // 使用 currentContactType 中的 placeholder，若無則使用預設值
    const customPlaceholder = window.currentContactType && window.currentContactType.placeholder;
    inputField.placeholder = customPlaceholder || (currentLang === 'zh' ? '請輸入連結' : 'Please enter link');
    // 重置提交標記（包括全局標記）
    inputField.dataset.submitted = 'false';
    window.isSubmittingLink = false;
    overlay.classList.add('show');
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // 範例/說明（A）
    if (help) {
      const t = window.isEditingContact && window.editingContactInfo ? window.editingContactInfo.type : (window.currentContactType ? window.currentContactType.type : '');
      let zh = '請輸入完整連結（包含 https://）。';
      let en = 'Please enter a full link (including https://).';
      if (t === 'line') {
        zh = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">📱 如何取得 LINE 個人連結：</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> 開啟 LINE App → 點擊「主頁」</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> 點擊右上角「設定」⚙️</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> 點擊「個人檔案」</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">4</span> 點擊「顯示行動條碼」</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">5</span> 點擊「分享」→「複製連結」</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">連結格式範例：</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://line.me/ti/p/7QENOpjTy5</code>
          </div>
        </div>`;
        en = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">📱 How to get your LINE link:</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> Open LINE App → Tap "Home"</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> Tap "Settings" ⚙️ (top right)</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> Tap "Profile"</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">4</span> Tap "Show QR Code"</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">5</span> Tap "Share" → "Copy Link"</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">Link format example:</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://line.me/ti/p/7QENOpjTy5</code>
          </div>
        </div>`;
      } else if (t === 'official-line') {
        zh = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">📱 如何取得 LINE 官方帳號連結：</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> 登入 LINE Official Account Manager</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> 選擇您的官方帳號</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> 點擊「加入好友」→「分享連結」</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">4</span> 複製 URL 連結</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">連結格式範例：</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://line.me/R/ti/p/@yourid</code>
          </div>
        </div>`;
        en = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">📱 How to get LINE Official Account link:</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> Login to LINE Official Account Manager</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> Select your official account</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> Click "Add Friends" → "Share Link"</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">4</span> Copy the URL link</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">Link format example:</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://line.me/R/ti/p/@yourid</code>
          </div>
        </div>`;
      } else if (t === 'email') {
        zh = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">✉️ 如何輸入 Email：</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> 直接輸入您的 Email 地址</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> 系統會自動加上 mailto: 前綴</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">輸入格式範例：</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">yourname@example.com</code>
          </div>
        </div>`;
        en = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">✉️ How to enter Email:</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> Enter your email address directly</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> System will auto-add mailto: prefix</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">Input format example:</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">yourname@example.com</code>
          </div>
        </div>`;
      } else if (t === 'company-phone' || t === 'personal-phone' || t === 'call') {
        zh = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">📞 如何輸入電話號碼：</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> 直接輸入電話號碼（可包含 - 分隔）</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> 系統會自動加上 tel: 前綴</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">輸入格式範例：</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">0912-345-678 或 02-1234-5678</code>
          </div>
        </div>`;
        en = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">📞 How to enter phone number:</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> Enter phone number directly (can include - separator)</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> System will auto-add tel: prefix</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">Input format example:</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">0912-345-678 or +886-2-1234-5678</code>
          </div>
        </div>`;
      } else if (t === 'website') {
        zh = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">🌐 如何輸入網站連結：</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> 輸入完整網址（需包含 https://）</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> 可從瀏覽器網址列複製</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">連結格式範例：</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://www.example.com</code>
          </div>
        </div>`;
        en = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">🌐 How to enter website link:</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> Enter full URL (must include https://)</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> You can copy from browser address bar</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">Link format example:</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://www.example.com</code>
          </div>
        </div>`;
      } else if (t === 'facebook') {
        zh = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">📘 如何取得 Facebook 個人連結：</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> 開啟 Facebook App 或網頁版</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> 點擊您的個人檔案頭像</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> 點擊「...」→「複製連結」</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">連結格式範例：</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://www.facebook.com/yourname</code>
          </div>
        </div>`;
        en = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">📘 How to get your Facebook link:</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> Open Facebook App or website</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> Tap your profile picture</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> Tap "..." → "Copy Link"</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">Link format example:</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://www.facebook.com/yourname</code>
          </div>
        </div>`;
      } else if (t === 'instagram') {
        zh = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">📸 如何取得 Instagram 個人連結：</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> 開啟 Instagram App</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> 點擊右下角「個人檔案」</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> 點擊右上角「≡」→「QR 圖碼」</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">4</span> 點擊「分享」→「複製連結」</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">連結格式範例：</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://www.instagram.com/yourname</code>
          </div>
        </div>`;
        en = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">📸 How to get your Instagram link:</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> Open Instagram App</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> Tap "Profile" (bottom right)</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> Tap "≡" → "QR Code" (top right)</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">4</span> Tap "Share" → "Copy Link"</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">Link format example:</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://www.instagram.com/yourname</code>
          </div>
        </div>`;
      } else if (t === 'linkedin') {
        zh = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">💼 如何取得 LinkedIn 個人連結：</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> 開啟 LinkedIn App 或網頁版</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> 點擊「我」→「查看個人檔案」</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> 點擊「...」→「分享個人檔案」→「複製」</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">連結格式範例：</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://www.linkedin.com/in/yourname</code>
          </div>
        </div>`;
        en = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">💼 How to get your LinkedIn link:</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> Open LinkedIn App or website</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> Tap "Me" → "View Profile"</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> Tap "..." → "Share Profile" → "Copy"</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">Link format example:</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://www.linkedin.com/in/yourname</code>
          </div>
        </div>`;
      } else if (t === 'twitter') {
        zh = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">🐦 如何取得 X (Twitter) 個人連結：</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> 開啟 X (Twitter) App</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> 點擊左上角頭像 → 「個人檔案」</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> 點擊「分享」→「複製連結」</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">連結格式範例：</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://twitter.com/yourname</code>
          </div>
        </div>`;
        en = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">🐦 How to get your X (Twitter) link:</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> Open X (Twitter) App</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> Tap profile icon (top left) → "Profile"</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> Tap "Share" → "Copy Link"</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">Link format example:</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://twitter.com/yourname</code>
          </div>
        </div>`;
      } else if (t === 'youtube') {
        zh = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">🎬 如何取得 YouTube 頻道連結：</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> 開啟 YouTube App 或網頁版</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> 點擊右下角「您」→「查看頻道」</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> 點擊「...」→「分享」→「複製連結」</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">連結格式範例：</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://www.youtube.com/@yourchannel</code>
          </div>
        </div>`;
        en = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">🎬 How to get your YouTube channel link:</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> Open YouTube App or website</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> Tap "You" (bottom right) → "View Channel"</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> Tap "..." → "Share" → "Copy Link"</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">Link format example:</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://www.youtube.com/@yourchannel</code>
          </div>
        </div>`;
      } else if (t === 'wechat') {
        zh = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">💬 如何輸入微信 ID：</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> 開啟微信 App</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> 點擊「我」→ 查看微信號</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> 直接輸入您的微信號</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">輸入格式範例：</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">your_wechat_id</code>
          </div>
        </div>`;
        en = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">💬 How to enter WeChat ID:</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> Open WeChat App</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> Tap "Me" → View WeChat ID</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> Enter your WeChat ID directly</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">Input format example:</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">your_wechat_id</code>
          </div>
        </div>`;
      } else if (t === 'whatsapp') {
        zh = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">📱 如何輸入 WhatsApp 號碼：</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> 輸入國際格式電話號碼</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> 台灣號碼：+886 開頭，去掉第一個 0</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> 例：0912345678 → +886912345678</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">連結格式範例：</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://wa.me/886912345678</code>
          </div>
        </div>`;
        en = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">📱 How to enter WhatsApp number:</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> Enter phone number in international format</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> Include country code (e.g., +1 for US)</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> No spaces or dashes needed</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">Link format example:</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://wa.me/886912345678</code>
          </div>
        </div>`;
      } else if (t === 'other') {

        zh = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">🔗 如何輸入自訂連結：</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> 輸入完整網址（需包含 https://）</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> 可以是任何網站或服務的連結</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">連結格式範例：</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://example.com/yourpage</code>
          </div>
        </div>`;
        en = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">🔗 How to enter custom link:</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> Enter full URL (must include https://)</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> Can be any website or service link</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">Link format example:</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://example.com/yourpage</code>
          </div>
        </div>`;
      }
      help.querySelector('.lang-zh').innerHTML = zh;
      help.querySelector('.lang-en').innerHTML = en;
    }

    // 聚焦輸入框
    setTimeout(() => {
      inputField.focus();
      inputField.select();
    }, 100);
  }
}

// 關閉連結輸入模態框
function closeLinkInputModal(event) {
  if (event && event.target && event.target.closest('.link-input-modal') && !event.target.classList.contains('link-input-cancel')) {
    return;
  }
  
  const overlay = document.getElementById('linkInputOverlay');
  if (overlay) {
    overlay.classList.remove('show');
    overlay.style.display = 'none';
    document.body.style.overflow = '';
  }
  
  // 清除保存的類型信息和提交標記
  window.currentContactType = null;
  window.isSubmittingLink = false;
  window.isEditingContact = false;
  window.editingContactInfo = null;
  const inputField = document.getElementById('linkInputField');
  if (inputField) {
    inputField.dataset.submitted = 'false';
  }
}

// 提交連結輸入
function submitLinkInput(event) {
  // 防止重複提交 - 立即檢查全局標記
  if (window.isSubmittingLink) {
    console.log('Already submitting, ignoring duplicate call');
    return;
  }
  
  // 防止重複提交
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  
  const inputField = document.getElementById('linkInputField');
  
  // 檢查是否已經提交過（防止重複提交）
  if (inputField.dataset.submitted === 'true') {
    console.log('Already submitted, ignoring duplicate call');
    return;
  }
  
  // 立即設置全局標記和本地標記，防止重複提交
  window.isSubmittingLink = true;
  inputField.dataset.submitted = 'true';
  
  let newLink = inputField.value.trim();

  // 防呆/驗證（B）：依類型檢查基本格式，避免客人填錯
  const t = window.isEditingContact && window.editingContactInfo ? window.editingContactInfo.type : (window.currentContactType ? window.currentContactType.type : '');
  const zhElements = document.querySelectorAll('.lang-zh');
  const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';

  function fail(msgZh, msgEn) {
    alert(currentLang === 'zh' ? msgZh : msgEn);
    window.isSubmittingLink = false;
    inputField.dataset.submitted = 'false';
    return true;
  }

  // ===== 自動添加前綴 =====
  
  // Email：自動添加 mailto:
  if (t === 'email') {
    if (!/^mailto:/i.test(newLink)) {
      // 驗證是否為有效的 email 格式
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newLink)) {
        if (fail('請輸入有效的 Email 地址，例如：yourname@example.com', 'Please enter a valid email address, e.g. yourname@example.com')) return;
      }
      newLink = 'mailto:' + newLink;
    }
  }

  // 電話：自動添加 tel:
  if (t === 'company-phone' || t === 'personal-phone' || t === 'call') {
    if (!/^tel:/i.test(newLink)) {
      // 移除常見的格式字符，保留數字和 + 號
      const cleanedPhone = newLink.replace(/[\s\-\(\)]/g, '');
      if (!/^[\+]?[0-9]{6,15}$/.test(cleanedPhone)) {
        if (fail('請輸入有效的電話號碼，例如：0912345678 或 +886912345678', 'Please enter a valid phone number, e.g. 0912345678 or +886912345678')) return;
      }
      newLink = 'tel:' + cleanedPhone;
    }
  }

  // 網站：自動添加 https://
  if (t === 'website') {
    if (!/^https?:\/\//i.test(newLink)) {
      // 如果沒有協議，自動加上 https://
      newLink = 'https://' + newLink;
    }
  }

  // LINE：驗證必須是完整連結
  if (t === 'line' || t === 'official-line') {
    const v = newLink.trim();
    if (!/^https?:\/\//i.test(v) || !/line\.me\//i.test(v)) {
      if (fail(
        'LINE 請貼「分享連結」，例如：https://line.me/R/ti/p/2sSjJ_o6OT\n（請到 LINE 個人檔案 → 分享 → 複製連結）',
        'Please paste a LINE share link, e.g. https://line.me/R/ti/p/2sSjJ_o6OT'
      )) return;
    }
  }
  
  // Facebook：自動添加 https://
  if (t === 'facebook') {
    if (!/^https?:\/\//i.test(newLink)) {
      newLink = 'https://' + newLink;
    }
  }
  
  // Instagram：自動添加 https://
  if (t === 'instagram') {
    if (!/^https?:\/\//i.test(newLink)) {
      // 如果只輸入用戶名，自動組合完整連結
      if (!newLink.includes('instagram.com')) {
        newLink = 'https://www.instagram.com/' + newLink.replace(/^@/, '');
      } else {
        newLink = 'https://' + newLink;
      }
    }
  }
  
  // LinkedIn：自動添加 https://
  if (t === 'linkedin') {
    if (!/^https?:\/\//i.test(newLink)) {
      newLink = 'https://' + newLink;
    }
  }
  
  // Twitter/X：自動添加 https://
  if (t === 'twitter') {
    if (!/^https?:\/\//i.test(newLink)) {
      // 如果只輸入用戶名，自動組合完整連結
      if (!newLink.includes('twitter.com') && !newLink.includes('x.com')) {
        newLink = 'https://x.com/' + newLink.replace(/^@/, '');
      } else {
        newLink = 'https://' + newLink;
      }
    }
  }
  
  // YouTube：自動添加 https://
  if (t === 'youtube') {
    if (!/^https?:\/\//i.test(newLink)) {
      newLink = 'https://' + newLink;
    }
  }
  
  // WeChat：保持原樣（微信 ID）
  // WhatsApp：自動添加 https://wa.me/
  if (t === 'whatsapp') {
    if (!/^https?:\/\//i.test(newLink)) {
      // 移除常見的格式字符，保留數字和 + 號
      const cleanedPhone = newLink.replace(/[\s\-\(\)]/g, '');
      newLink = 'https://wa.me/' + cleanedPhone.replace(/^\+/, '');
    }
  }
  
  // 如果輸入為空，提示用戶並重置標記
  if (newLink === '') {
    alert(currentLang === 'zh' ? '連結不能為空' : 'Link cannot be empty');
    // 重置標記，允許用戶重新輸入
    window.isSubmittingLink = false;
    inputField.dataset.submitted = 'false';
    return;
  }
  
  // 判斷是編輯模式還是新增模式
  if (window.isEditingContact && window.editingContactInfo) {
    // 編輯模式：更新現有按鈕
    updateContactButtons(window.editingContactInfo.type, window.editingContactInfo.currentLink, newLink);
  } else if (window.currentContactType) {
    // 新增模式：添加新按鈕
    const contactType = window.currentContactType;
    addContactButtonToPreview(contactType.type, newLink, contactType.buttonTextZh, contactType.buttonTextEn);
  } else {
    console.error('Contact type or editing info not found');
    window.isSubmittingLink = false;
    inputField.dataset.submitted = 'false';
    return;
  }
  
  // 關閉輸入模態框
  closeLinkInputModal();
  
  // 重置全局標記
  window.isSubmittingLink = false;
}

// 更新現有的聯絡方式按鈕
function updateContactButtons(type, currentLink, newLink) {
  // 更新所有相關的按鈕連結（中文和英文）
  const buttons = document.querySelectorAll(`#previewContacts a[href="${currentLink}"]`);
  buttons.forEach(btn => {
    btn.href = newLink;
    // 更新 onclick 事件中的連結參數
    btn.onclick = function(e) {
      editContact(e, type, newLink);
    };
  });
  console.log('Contact buttons updated');
}

// ===== 公司資訊相關功能 =====

// 顯示公司資訊類型選擇彈窗
function showCompanyInfoTypeModal(event) {
  event.preventDefault();
  event.stopPropagation();
  
  const overlay = document.getElementById('companyInfoTypeOverlay');
  if (overlay) {
    overlay.classList.add('show');
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
}

// 關閉公司資訊類型選擇彈窗
function closeCompanyInfoTypeModal(event) {
  if (event && event.target && event.target.closest('.company-info-type-modal') && !event.target.classList.contains('company-info-type-cancel')) {
    return;
  }
  
  const overlay = document.getElementById('companyInfoTypeOverlay');
  if (overlay) {
    overlay.classList.remove('show');
    overlay.style.display = 'none';
    document.body.style.overflow = '';
  }
}

// 選擇公司資訊類型
function selectCompanyInfoType(type) {
  closeCompanyInfoTypeModal();
  
  if (type === 'custom') {
    // 自訂類型：建立一個新的 info-item，標題可編輯
    addCustomCompanyInfoItem();
  } else if (type === 'taxId') {
    // 統一編號：直接顯示輸入框
    showTaxIdInput();
  } else if (type === 'companyName') {
    // 公司名稱：顯示公司名稱輸入
    showCompanyNameInput();
  } else {
    // 地址類型：顯示地址編輯彈窗
    showAddressEditModal(type);
  }
}

// 顯示公司名稱輸入
function showCompanyNameInput() {
  const item = document.getElementById('companyNameItem');
  if (item) {
    // 強制顯示
    item.style.display = 'flex';
    item.style.visibility = 'visible';
    item.style.opacity = '1';
    
    const zhEl = document.getElementById('previewCompanyNameZh');
    const enEl = document.getElementById('previewCompanyNameEn');
    
    // 保持欄位為空，讓 CSS data-placeholder 顯示提示文字
    // 不要設定 textContent，這樣用戶可以直接輸入
    
    // 滾動到可見區域
    setTimeout(() => {
      item.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
    
    if (zhEl) {
      setTimeout(() => {
        zhEl.focus();
        if (typeof focusEdit === 'function') focusEdit(zhEl);
      }, 150);
    }
  }
}

// 新增自訂公司資訊項目
function addCustomCompanyInfoItem() {
  const container = document.getElementById('companyInfoSection');
  const addBtn = container.querySelector('.edit-add-btn'); // 插入在按鈕之前
  
  const div = document.createElement('div');
  div.className = 'info-item info-item-custom';
  
  // 隨機 ID 避免衝突
  const id = 'customInfo_' + Date.now();
  div.id = id;
  
  div.innerHTML = `
    <span class="info-label lang-zh" contenteditable="true" onclick="focusEdit(this)">自訂標題：</span>
    <span class="info-label lang-en" contenteditable="true" onclick="focusEdit(this)">Custom Title:</span>
    <span class="info-value lang-zh edit-clickable" contenteditable="true" onclick="focusEdit(this)">請輸入內容</span>
    <span class="info-value lang-en edit-clickable" contenteditable="true" onclick="focusEdit(this)">Enter content</span>
    <button class="info-delete-btn" onclick="this.closest('.info-item').remove()" title="刪除">×</button>
  `;
  
  if (addBtn) {
    container.insertBefore(div, addBtn);
  } else {
    container.appendChild(div);
  }
  
  // 自動聚焦到第一個可編輯的標題
  const firstEdit = div.querySelector('.info-label.lang-zh');
  if (firstEdit) {
    setTimeout(() => {
      firstEdit.focus();
      focusEdit(firstEdit); // 輔助選取文字
    }, 100);
  }
}

// 顯示統一編號輸入
function showTaxIdInput() {
  const item = document.getElementById('taxIdItem');
  if (item) {
    item.style.display = 'flex';
    const zhInput = document.getElementById('previewTaxIdZh');
    const enInput = document.getElementById('previewTaxIdEn');
    if (zhInput) {
      setTimeout(() => {
        zhInput.focus();
        const range = document.createRange();
        range.selectNodeContents(zhInput);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }, 100);
    }
  }
}

// 顯示地址編輯彈窗
function showAddressEditModal(addressType) {
  window.currentAddressType = addressType;
  
  // 為對應項目加上 editing class 顯示刪除按鈕
  const itemId = addressType + 'Item';
  const item = document.getElementById(itemId);
  if (item) {
    item.classList.add('editing');
  }
  
  // 設定標題
  const titleMap = {
    'serviceLocation': { zh: '編輯服務據點', en: 'Edit Service Location' },
    'mailingAddress': { zh: '編輯通訊住址', en: 'Edit Mailing Address' },
    'companyAddress': { zh: '編輯公司住址', en: 'Edit Company Address' }
  };
  
  const titles = titleMap[addressType];
  document.getElementById('addressEditTitleZh').textContent = titles.zh;
  document.getElementById('addressEditTitleEn').textContent = titles.en;
  
  // 載入現有地址（如果有的話）
  const zhEl = document.getElementById(`preview${addressType.charAt(0).toUpperCase() + addressType.slice(1)}Zh`);
  const enEl = document.getElementById(`preview${addressType.charAt(0).toUpperCase() + addressType.slice(1)}En`);
  
  const zhText = zhEl ? (zhEl.querySelector('.address-text')?.textContent || '').trim() : '';
  const enText = enEl ? (enEl.querySelector('.address-text')?.textContent || '').trim() : '';
  
  document.getElementById('addressEditZh').value = zhText;
  document.getElementById('addressEditEn').value = enText;
  
  // 隱藏地圖連結
  const mapLink = document.getElementById('addressMapLink');
  if (mapLink) {
    mapLink.style.display = 'none';
  }
  
  // 顯示彈窗
  const overlay = document.getElementById('addressEditOverlay');
  if (overlay) {
    overlay.classList.add('show');
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      document.getElementById('addressEditZh').focus();
    }, 100);
  }
}

// 關閉地址編輯彈窗
function closeAddressEditModal(event) {
  if (event && event.target && event.target.closest('.address-edit-modal') && !event.target.classList.contains('address-edit-cancel') && !event.target.classList.contains('address-edit-submit')) {
    return;
  }
  
  const overlay = document.getElementById('addressEditOverlay');
  if (overlay) {
    overlay.classList.remove('show');
    overlay.style.display = 'none';
    document.body.style.overflow = '';
  }
  
  // 移除 editing class 隱藏刪除按鈕
  if (window.currentAddressType) {
    const itemId = window.currentAddressType + 'Item';
    const item = document.getElementById(itemId);
    if (item) {
      item.classList.remove('editing');
    }
  }
  
  window.currentAddressType = null;
}

// 提交地址編輯
function submitAddressEdit(event) {
  event.preventDefault();
  event.stopPropagation();
  
  const addressType = window.currentAddressType;
  if (!addressType) return;
  
  const zhAddress = document.getElementById('addressEditZh').value.trim();
  const enAddress = document.getElementById('addressEditEn').value.trim();
  
  if (!zhAddress && !enAddress) {
    const zhElements = document.querySelectorAll('.lang-zh');
    const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';
    alert(currentLang === 'zh' ? '請至少輸入一個地址' : 'Please enter at least one address');
    return;
  }
  
  // 更新預覽區域
  updateAddressPreview(addressType, zhAddress, enAddress);
  
  // 顯示對應的項目
  const itemId = addressType + 'Item';
  const item = document.getElementById(itemId);
  if (item) {
    item.style.display = 'flex';
  }
  
  closeAddressEditModal();
}

// ===== 卡片主題選擇功能 =====

// 顯示主題選擇器模態框
function showThemeSelector() {
  const overlay = document.getElementById('themeSelectorOverlay');
  if (overlay) {
    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
    
    // 高亮當前選中的主題
    const savedTheme = localStorage.getItem('cardTheme');
    if (savedTheme) {
      updateThemePreviewActive(parseInt(savedTheme));
    }
  }
}

// 關閉主題選擇器模態框
function closeThemeSelector(event) {
  if (event && event.target && !event.target.classList.contains('theme-selector-overlay') && !event.target.classList.contains('theme-selector-close')) {
    return;
  }
  
  const overlay = document.getElementById('themeSelectorOverlay');
  if (overlay) {
    overlay.classList.remove('show');
    document.body.style.overflow = '';
  }
}

// 更新主題預覽的 active 狀態
function updateThemePreviewActive(themeNumber) {
  const previews = document.querySelectorAll('.theme-card-preview');
  previews.forEach(preview => {
    preview.classList.remove('active');
  });
  const selectedPreview = document.querySelector('.theme-card-preview[data-theme="' + themeNumber + '"]');
  if (selectedPreview) {
    selectedPreview.classList.add('active');
  }
}

// 選擇卡片主題（編輯頁面 - 只更新卡片，不更新 body）
function selectCardTheme(themeNumber) {
  console.log('Selecting card theme:', themeNumber);
  
  // 在編輯頁：卡片主題需要「完整預覽」整體版面
  // - 使用 styles.css 內建的 body.card-theme-*（整頁背景/頂部欄/底部欄）
  // - 同時保留 theme-dark/theme-light（讓 edit.html 既有的模態框/按鈕樣式規則生效）
  // - 移除 common.js 的 body.theme-1~5（避免兩套主題互相覆蓋造成「切不完整」）
  function applyCardThemeToBody(n) {
    // 清掉 common.js 全域主題類別（theme-1~7），避免跟 card-theme-* 打架
    document.body.classList.remove('theme-1', 'theme-2', 'theme-3', 'theme-4', 'theme-5', 'theme-6', 'theme-7', 'theme-8', 'theme-9');

    // 清掉舊的卡片主題（整頁）
    document.body.classList.remove('card-theme-1', 'card-theme-2', 'card-theme-3', 'card-theme-4', 'card-theme-5', 'card-theme-6', 'card-theme-7', 'card-theme-8', 'card-theme-9');

    // 套用新的卡片主題（整頁）
    if (n >= 1 && n <= 9) {
      document.body.classList.add('card-theme-' + n);
    }

    // 對應 light/dark（edit.html 內大量依賴 theme-dark/theme-light）
    document.body.classList.remove('theme-dark', 'theme-light');
    if (n === 2 || n === 7 || n === 9) {
      document.body.classList.add('theme-light');
    } else {
      document.body.classList.add('theme-dark');
    }
  }

  // 直接操作 DOM 更新卡片主題
  const card = document.getElementById('previewCard');
  if (card) {
    // 移除所有舊的主題類別
    card.classList.remove('card-theme-1', 'card-theme-2', 'card-theme-3', 'card-theme-4', 'card-theme-5', 'card-theme-6', 'card-theme-7', 'card-theme-8', 'card-theme-9');
    
    // 添加新的主題類別
    if (themeNumber >= 1 && themeNumber <= 9) {
      card.classList.add('card-theme-' + themeNumber);
      console.log('Applied theme class: card-theme-' + themeNumber);
      console.log('Card classes:', card.className);
    }
  } else {
    console.error('Card element not found!');
  }
  
  // 同步整頁預覽主題（背景/頂部欄/底部欄/泡泡/模態框明暗）
  applyCardThemeToBody(themeNumber);

  // 儲存到 localStorage
  localStorage.setItem('cardTheme', themeNumber);
  // 同步全域主題（yuyuko.html / 其他頁面由 common.js 讀取 localStorage.theme）
  // 這樣從 edit.html 跳回名片頁時，整體主題會一致更新
  localStorage.setItem('theme', String(themeNumber));
  
  // 更新預覽的 active 狀態
  updateThemePreviewActive(themeNumber);
  
  // 延遲關閉模態框，讓用戶看到選中的效果
  setTimeout(function() {
    closeThemeSelector({ target: document.getElementById('themeSelectorOverlay') });
  }, 500);
}

// 初始化卡片主題（在編輯頁面只讀取，不自動應用）
function initCardTheme() {
  console.log('Initializing card theme...');
  
  // 從 localStorage 讀取
  const savedTheme = localStorage.getItem('cardTheme');
  if (savedTheme) {
    const themeNumber = parseInt(savedTheme);
    console.log('Saved theme:', themeNumber);
    
    if (themeNumber >= 1 && themeNumber <= 9) {
      // 同步全域主題，確保返回 yuyuko.html 等頁面能立刻套用
      localStorage.setItem('theme', String(themeNumber));

      const card = document.getElementById('previewCard');
      if (card) {
        // 移除所有舊的主題類別
        card.classList.remove('card-theme-1', 'card-theme-2', 'card-theme-3', 'card-theme-4', 'card-theme-5', 'card-theme-6', 'card-theme-7', 'card-theme-8', 'card-theme-9');
        // 添加保存的主題
        card.classList.add('card-theme-' + themeNumber);
        console.log('Applied saved theme: card-theme-' + themeNumber);
        console.log('Card classes:', card.className);
      } else {
        console.error('Card element not found during init!');
      }

      // 初始化時也要同步整頁預覽主題
      //（注意：common.js 會先套用 body.theme-1~5；這裡以 cardTheme 為準覆蓋成 body.card-theme-*）
      document.body.classList.remove('theme-1', 'theme-2', 'theme-3', 'theme-4', 'theme-5', 'theme-6', 'theme-7', 'theme-8', 'theme-9');
      document.body.classList.remove('card-theme-1', 'card-theme-2', 'card-theme-3', 'card-theme-4', 'card-theme-5', 'card-theme-6', 'card-theme-7', 'card-theme-8', 'card-theme-9');
      document.body.classList.add('card-theme-' + themeNumber);
      document.body.classList.remove('theme-dark', 'theme-light');
      document.body.classList.add((themeNumber === 2 || themeNumber === 7 || themeNumber === 9) ? 'theme-light' : 'theme-dark');
      
      // 延遲更新 active 狀態，確保 modal DOM 已載入
      setTimeout(function() {
        updateThemePreviewActive(themeNumber);
      }, 200);
    }
  } else {
    console.log('No saved theme found, using default');

    // 沒有保存主題時，仍確保有一個可預期的明暗 class（避免模態框顏色錯亂）
    if (!document.body.classList.contains('theme-dark') && !document.body.classList.contains('theme-light')) {
      document.body.classList.add('theme-dark');
    }
  }
}

// 頁面載入時初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(initCardTheme, 100);
  });
} else {
  setTimeout(initCardTheme, 100);
}

// 更新地址預覽
function updateAddressPreview(addressType, zhAddress, enAddress) {
  const typeCapitalized = addressType.charAt(0).toUpperCase() + addressType.slice(1);
  const zhEl = document.getElementById(`preview${typeCapitalized}Zh`);
  const enEl = document.getElementById(`preview${typeCapitalized}En`);
  
  if (zhEl) {
    const textEl = zhEl.querySelector('.address-text');
    if (textEl) {
      textEl.textContent = zhAddress || '（未設定）';
    }
  }
  
  if (enEl) {
    const textEl = enEl.querySelector('.address-text');
    if (textEl) {
      textEl.textContent = enAddress || '（Not Set）';
    }
  }
  
  // 更新地圖連結
  updateMapLink(addressType, zhAddress || enAddress);
}

// 生成地圖連結
function generateMapLink() {
  const addressType = window.currentAddressType;
  const zhAddress = document.getElementById('addressEditZh').value.trim();
  const enAddress = document.getElementById('addressEditEn').value.trim();
  
  const address = zhAddress || enAddress;
  if (!address) {
    const zhElements = document.querySelectorAll('.lang-zh');
    const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';
    alert(currentLang === 'zh' ? '請先輸入地址' : 'Please enter address first');
    return;
  }
  
  // 生成 Google Maps 連結
  const encodedAddress = encodeURIComponent(address);
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
  
  const mapLink = document.getElementById('addressMapLink');
  if (mapLink) {
    mapLink.href = mapUrl;
    mapLink.style.display = 'inline-block';
  }
  
  // 在新視窗開啟地圖
  window.open(mapUrl, '_blank');
}

// 更新地圖連結
function updateMapLink(addressType, address) {
  if (!address || address === '（未設定）' || address === '（Not Set）') return;
  
  const encodedAddress = encodeURIComponent(address);
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
  
  const typeCapitalized = addressType.charAt(0).toUpperCase() + addressType.slice(1);
  const zhEl = document.getElementById(`preview${typeCapitalized}Zh`);
  const enEl = document.getElementById(`preview${typeCapitalized}En`);
  
  [zhEl, enEl].forEach(el => {
    if (el) {
      const mapLink = el.querySelector('.address-map-link');
      if (mapLink) {
        mapLink.onclick = function(e) {
          e.stopPropagation();
          window.open(mapUrl, '_blank');
        };
      }
    }
  });
}

// 開啟地圖
function openMap(addressType, event) {
  event.stopPropagation();
  event.preventDefault();
  
  const typeCapitalized = addressType.charAt(0).toUpperCase() + addressType.slice(1);
  const zhEl = document.getElementById(`preview${typeCapitalized}Zh`);
  const enEl = document.getElementById(`preview${typeCapitalized}En`);
  
  const address = zhEl?.querySelector('.address-text')?.textContent || enEl?.querySelector('.address-text')?.textContent || '';
  
  if (address && address !== '（未設定）' && address !== '（Not Set）') {
    const encodedAddress = encodeURIComponent(address);
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
    window.open(mapUrl, '_blank');
  }
}

// 編輯地址（點擊地址項目時）
function editAddress(addressType, event) {
  event.preventDefault();
  event.stopPropagation();
  showAddressEditModal(addressType);
}

// 編輯統一編號
function editTaxId(event) {
  event.preventDefault();
  event.stopPropagation();
  
  // 為對應項目加上 editing class 顯示刪除按鈕
  const taxIdItem = document.getElementById('taxIdItem');
  if (taxIdItem) {
    taxIdItem.classList.add('editing');
  }
  
  const zhInput = document.getElementById('previewTaxIdZh');
  if (zhInput) {
    setTimeout(() => {
      zhInput.focus();
      const range = document.createRange();
      range.selectNodeContents(zhInput);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }, 100);
    
    // 監聽 blur 事件以移除 editing class
    const handleBlur = () => {
      // 延遲執行，避免點擊刪除按鈕時提前移除 class
      setTimeout(() => {
        if (taxIdItem && !taxIdItem.contains(document.activeElement)) {
          taxIdItem.classList.remove('editing');
        }
      }, 200);
      zhInput.removeEventListener('blur', handleBlur);
    };
    zhInput.addEventListener('blur', handleBlur);
  }
}

// 刪除公司資訊項目
function deleteCompanyInfo(type) {
  const zhElements = document.querySelectorAll('.lang-zh');
  const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';
  
  const confirmMsg = currentLang === 'zh' ? '確定要刪除此項目嗎？' : 'Are you sure you want to delete this item?';
  if (!confirm(confirmMsg)) return;
  
  const itemId = type + 'Item';
  const item = document.getElementById(itemId);
  if (item) {
    item.style.display = 'none';
    
    // 清除內容
    if (type === 'taxId') {
      document.getElementById('previewTaxIdZh').textContent = '';
      document.getElementById('previewTaxIdEn').textContent = '';
    } else if (type === 'companyName') {
      // 公司名稱：清除內容
      const zhEl = document.getElementById('previewCompanyNameZh');
      const enEl = document.getElementById('previewCompanyNameEn');
      if (zhEl) zhEl.textContent = '';
      if (enEl) enEl.textContent = '';
      // 同時清除全域變數

      window.__uvacoCompanyZh = '';
      window.__uvacoCompanyEn = '';
      window.__uvacoSelectedCompany = '';
    } else {
      // 地址類型
      const typeCapitalized = type.charAt(0).toUpperCase() + type.slice(1);
      const zhEl = document.getElementById(`preview${typeCapitalized}Zh`);
      const enEl = document.getElementById(`preview${typeCapitalized}En`);
      if (zhEl) {
        const textEl = zhEl.querySelector('.address-text');
        if (textEl) textEl.textContent = '';
      }
      if (enEl) {
        const textEl = enEl.querySelector('.address-text');
        if (textEl) textEl.textContent = '';
      }
    }
  }
}

// 添加聯絡方式按鈕到預覽區域
function addContactButtonToPreview(type, newLink, buttonTextZh, buttonTextEn) {
  // 防止重複添加 - 檢查是否已經存在相同的連結
  const contactsGroup = document.getElementById('previewContacts');
  if (contactsGroup) {
    const existingButtons = contactsGroup.querySelectorAll(`a[href="${newLink}"]`);
    if (existingButtons.length > 0) {
      console.log('Contact with this link already exists, skipping duplicate');
      return;
    }
  }
  
  const zhElements = document.querySelectorAll('.lang-zh');
  const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';
  
  if (!contactsGroup) {
    console.error('previewContacts element not found');
    alert(currentLang === 'zh' ? '找不到聯絡方式容器' : 'Contact container not found');
    return;
  }
  
  // 創建中文按鈕
  const btnZh = document.createElement('a');
  btnZh.className = 'btn btn-secondary lang-zh edit-clickable';
  btnZh.href = newLink;
  if (type === 'website' || type === 'line' || type === 'official-line' || type === 'facebook' || type === 'instagram' || type === 'linkedin' || type === 'twitter' || type === 'youtube' || type === 'whatsapp') {
    btnZh.target = '_blank';
  }
  if (type === 'vcf') {
    btnZh.download = 'Contact.vcf';
  }
  btnZh.innerHTML = buttonTextZh;
  btnZh.onclick = function(event) {
    editContact(event, type, newLink);
  };
  
  // 創建英文按鈕
  const btnEn = document.createElement('a');
  btnEn.className = 'btn btn-secondary lang-en edit-clickable';
  btnEn.href = newLink;
  if (type === 'website' || type === 'line' || type === 'official-line' || type === 'facebook' || type === 'instagram' || type === 'linkedin' || type === 'twitter' || type === 'youtube' || type === 'whatsapp') {
    btnEn.target = '_blank';
  }
  if (type === 'vcf') {
    btnEn.download = 'Contact.vcf';
  }
  btnEn.innerHTML = buttonTextEn;
  btnEn.onclick = function(event) {
    editContact(event, type, newLink);
  };
  
  // 創建包裝器
  const wrapper = document.createElement('div');
  wrapper.className = 'contact-btn-wrapper';
  
  wrapper.appendChild(btnZh);
  wrapper.appendChild(btnEn);
  
  // 創建刪除按鈕
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'contact-delete-btn';
  deleteBtn.textContent = '✕';
  deleteBtn.title = currentLang === 'zh' ? '刪除' : 'Delete';
  deleteBtn.onclick = function(event) {
    // #region agent log
    fetch('http://127.0.0.1:7665/ingest/1c4657e8-8c04-4e63-85b8-af5c9905415e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b370db'},body:JSON.stringify({sessionId:'b370db',runId:'run-1',hypothesisId:'H1',location:'js/pages/edit/edit-chunk-5.js:87',message:'點擊聯絡方式刪除按鈕',data:{hasWrapper:!!event?.target?.closest?.('.contact-btn-wrapper'),href:btnZh?.getAttribute('href')||''},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    event.stopPropagation();
    deleteContactButton(btnZh);
  };
  wrapper.appendChild(deleteBtn);
  
  // 添加到聯絡方式容器
  contactsGroup.appendChild(wrapper);
  console.log('Contact button added to previewContacts');
}

// 切換聯絡方式項目展開/收合
function toggleContactItem(btn) {
  const item = btn.closest('.edit-contact-item');
  const content = item.querySelector('.edit-contact-content');
  const arrow = btn.querySelector('.edit-contact-toggle-arrow');
  
  content.classList.toggle('show');
  arrow.classList.toggle('expanded');
}

// 切換可見性設定展開/收合
function toggleVisibility(btn) {
  const content = btn.nextElementSibling;
  const arrow = btn.querySelector('.edit-contact-visibility-arrow');
  
  content.classList.toggle('show');
  arrow.classList.toggle('expanded');
}


// 移動聯絡方式
function moveContact(item, direction) {
  if (typeof item === 'object' && item.nodeName) {
    // 如果傳入的是 DOM 元素
  } else {
    // 如果傳入的是按鈕
    item = item.closest('.edit-contact-item');
  }
  const list = item.parentElement;
  if (direction === 'up' && item.previousElementSibling) {
    list.insertBefore(item, item.previousElementSibling);
  } else if (direction === 'down' && item.nextElementSibling) {
    list.insertBefore(item.nextElementSibling, item);
  }
}

// 刪除聯絡方式按鈕（從預覽區域）
function deleteContactButton(contactBtn) {
  // #region agent log
  fetch('http://127.0.0.1:7665/ingest/1c4657e8-8c04-4e63-85b8-af5c9905415e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b370db'},body:JSON.stringify({sessionId:'b370db',runId:'run-1',hypothesisId:'H2',location:'js/pages/edit/edit-chunk-5.js:136',message:'進入 deleteContactButton',data:{hasContactBtn:!!contactBtn,contactBtnTag:contactBtn?.nodeName||'',contactHref:contactBtn?.getAttribute?.('href')||'',globalEventType:typeof event},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (event) event.stopPropagation();
  const zhElements = document.querySelectorAll('.lang-zh');
  const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';
  const confirmMsg = currentLang === 'zh' ? '確定要刪除此聯絡方式嗎？' : 'Are you sure you want to delete this contact method?';
  
  if (confirm(confirmMsg)) {
    // 找到對應的包裝器並刪除（包含中文和英文按鈕）
    const wrapper = contactBtn.closest('.contact-btn-wrapper');
    // #region agent log
    fetch('http://127.0.0.1:7665/ingest/1c4657e8-8c04-4e63-85b8-af5c9905415e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b370db'},body:JSON.stringify({sessionId:'b370db',runId:'run-1',hypothesisId:'H3',location:'js/pages/edit/edit-chunk-5.js:145',message:'確認刪除後檢查 wrapper',data:{wrapperFound:!!wrapper,totalWrappersBefore:document.querySelectorAll('#previewContacts .contact-btn-wrapper').length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (wrapper) {
      wrapper.remove();
      // #region agent log
      fetch('http://127.0.0.1:7665/ingest/1c4657e8-8c04-4e63-85b8-af5c9905415e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b370db'},body:JSON.stringify({sessionId:'b370db',runId:'run-1',hypothesisId:'H4',location:'js/pages/edit/edit-chunk-5.js:150',message:'已執行 wrapper.remove()',data:{totalWrappersAfter:document.querySelectorAll('#previewContacts .contact-btn-wrapper').length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    }
  }
}

// 儲存名片（雲端：Supabase）

// 清理 HTML 片段（移除編輯元素和系統提示文字）
function getCleanHtmlFragment(element) {
  if (!element) return '';
  
  const clone = element.cloneNode(true);
  
  // 移除編輯相關元素
  const editElements = clone.querySelectorAll('button, .edit-add-btn, .contact-delete-btn, .slogan-delete-btn, .uvaco-company-picker-wrap, .uvaco-company-picker-badge');
  editElements.forEach(el => el.remove());
  
  // 移除編輯屬性
  const editables = clone.querySelectorAll('[contenteditable]');
  editables.forEach(el => el.removeAttribute('contenteditable'));
  
  const clickables = clone.querySelectorAll('.edit-clickable');
  clickables.forEach(el => {
    el.classList.remove('edit-clickable');
    el.removeAttribute('onclick');
    el.removeAttribute('onblur');
  });
  
  // 移除所有 on 開頭的屬性
  const all = clone.querySelectorAll('*');
  all.forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    });
  });
  
  // 過濾系統提示文字
  let html = clone.innerHTML;
  const systemPatterns = [
    '公司已鎖定（如需更改請聯絡管理員）',
    '公司：必選下拉（可輸入關鍵字快速帶入）',
    '🏢 選擇公司',
    '🏢 Select Company',
    '請輸入內容',
    'Enter content'
  ];
  systemPatterns.forEach(pattern => {
    html = html.split(pattern).join('');
  });
  
  return html;
}

function getCleanSloganHtml(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return '';
  
  // 複製一份，避免改到畫面
  const clone = container.cloneNode(true);
  
  // 移除公司選擇器相關元素（避免提示文字被存入資料庫）
  const companyPickerElements = clone.querySelectorAll('.uvaco-company-picker-wrap, .uvaco-company-picker-badge, #uvacoCompanyPickBtnZh, #uvacoCompanyPickBtnEn, #uvacoCompanyLockBadge');
  companyPickerElements.forEach(el => el.remove());
  
  // 移除所有編輯屬性與事件
  const editables = clone.querySelectorAll('[contenteditable]');
  editables.forEach(el => el.removeAttribute('contenteditable'));
  
  const clickables = clone.querySelectorAll('.edit-clickable');
  clickables.forEach(el => {
    el.classList.remove('edit-clickable');
    el.removeAttribute('onclick');
    el.removeAttribute('onblur');
  });
  
  const buttons = clone.querySelectorAll('button, .slogan-delete-btn, .edit-add-btn');
  buttons.forEach(el => el.remove());
  
  // 移除所有 script/onclick/onblur 屬性（再次檢查）
  const all = clone.querySelectorAll('*');
  all.forEach(el => {
    // 移除所有 on 開頭的屬性
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    });
  });
  
  // 過濾系統提示文字
  let html = clone.innerHTML;
  const systemPatterns = [
    '公司已鎖定（如需更改請聯絡管理員）',
    '公司：必選下拉（可輸入關鍵字快速帶入）',
    '🏢 選擇公司',
    '🏢 Select Company'
  ];
  systemPatterns.forEach(pattern => {
    html = html.split(pattern).join('');
  });

  return html;
}

// Helper functions for name parsing
function primaryPart(raw) {
  if (!raw) return '';
  const parts = raw.split(/\s*[｜|]\s*/);
  return parts[0].trim();
}

function englishPartFromNameZh(raw) {
  if (!raw) return '';
  const parts = raw.split(/\s*[｜|]\s*/);
  if (parts.length > 1) {
    return parts[1].trim();
  }
  // Fallback: check for parentheses
  const match = raw.match(/[（(](.+?)[)）]/);
  if (match) return match[1].trim();
  return '';
}

async function saveCard() {
  console.log('saveCard started...');
  const zhElements = document.querySelectorAll('.lang-zh');
  const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';

  // 1. 強制讓目前聚焦的元素失去焦點，觸發 onblur 以同步最新編輯內容
  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    try { document.activeElement.blur(); } catch(e) {}
  }

  // 2. 額外強制同步：手動觸發所有 contenteditable 的更新函式
  try { if (typeof updateNameFromPreview === 'function') updateNameFromPreview(); } catch (e) {}
  try { if (typeof updateTitleFromPreview === 'function') updateTitleFromPreview(); } catch (e) {}
  try { if (typeof updateSlogansPreview === 'function') updateSlogansPreview(); } catch (e) {}
  try { if (typeof updateCompanyFromSlogans === 'function') updateCompanyFromSlogans(); } catch (e) {}

  function textOf(id) {
    const el = document.getElementById(id);
    return String(el?.textContent || '').replace(/\s+/g, ' ').trim();
  }
  
  function srcOf(id) {
    const el = document.getElementById(id);
    const src = el?.getAttribute('src') || '';
    if (src.startsWith('blob:') || src.startsWith('data:')) return src;
    if (src.includes('default-avatar.svg')) return '';
    if (src.includes('uvaco-logo.svg')) return '';
    return src;
  }

  // 3. 擷取資料
  const nameZhRaw = textOf('previewNameZh');
  const nameEnRaw = englishPartFromNameZh(nameZhRaw);
  const titleZhRaw = textOf('previewTitleZh');
  const titleEnRaw = textOf('previewTitleEn');

  const name = primaryPart(nameZhRaw) || 'Name';
  const title = primaryPart(titleZhRaw) || 'Title';

  const theme = parseInt(window.currentCardTheme || 1, 10);
  const phone = window.__uvacoCardPhone || '';
  const email = window.__uvacoCardEmail || '';

  // 偵測公司名稱 (Canonical)
  // 優先從公司資訊區塊的公司名稱欄位抓取，其次 Slogan DOM，最後用選擇器的
  const companyCanonical = (function () {
    // 優先使用公司資訊區塊的公司名稱欄位
    const zhEl = document.getElementById('previewCompanyNameZh');
    const enEl = document.getElementById('previewCompanyNameEn');
    const fromFieldZh = zhEl ? zhEl.textContent.trim() : '';
    const fromFieldEn = enEl ? enEl.textContent.trim() : '';
    if (fromFieldZh) return fromFieldZh;
    if (fromFieldEn) return fromFieldEn;
    
    // Fallback 到標語中的公司名稱
    const zhStrong = getSloganStrong('zh');
    const enStrong = getSloganStrong('en');
    const fromDomZh = getCanonicalCompanyFromStrongText(zhStrong ? zhStrong.textContent : '');
    const fromDomEn = getCanonicalCompanyFromStrongText(enStrong ? enStrong.textContent : '');
    const fromDom = fromDomZh || fromDomEn || '';
    
    if (fromDom) return fromDom;
    
    const picked = String(window.__uvacoSelectedCompany || '').trim();
    if (picked) return picked;
    
    return '';
  })();
  
  const company = companyCanonical || 'Personal'; // Allow empty company, default to 'Personal'
  console.log('Company detection:', { company, companyCanonical });

  // Company lock logic temporarily commented out
  /*
  const adminModeForCompany = isAdminModeFromUrl() || (function () {
    const params = new URLSearchParams(window.location.search || '');
    const targetUserId = params.get('targetUserId') || params.get('uid') || params.get('id');
    const myUserId = (window.__uvacoLoadedProfileJson && window.__uvacoLoadedProfileJson.user_id) || ''; // Need verify
    return (targetUserId && myUserId && targetUserId !== myUserId);
  })();
  const isActuallyLocked = window.__uvacoCompanyLocked && !adminModeForCompany && params.get('mode') !== 'onboarding';
  
  if (isActuallyLocked) {
    // 檢查公司是否被更改
    const original = String(window.__uvacoOriginalCompanyCanonical || '').trim();
    if (original && companyCanonical !== original) {
      alert('您的公司已鎖定為「' + original + '」，無法變更。\n如需更改請聯絡管理員。');
      // 還原
      window.__uvacoSelectedCompany = original;
      applyCompanyToUI(original);
      return; 
    }
  }
  */

  // 4. 準備 JSON (profile_json)
  // 先計算 adminModeForCompany，因為 profile_json 需要用到
  const params = new URLSearchParams(window.location.search || '');
  const targetUserId = params.get('targetUserId') || params.get('uid') || params.get('id');
  let adminMode = params.get('adminMode') === 'true';
  let adminModeForCompany = adminMode;
  try {
    // 這裡無法同步取得 session，只能依賴同步邏輯或預先載入的資訊
    // 如果需要嚴格檢查，應該早在進入 edit 頁面時就確認權限
    // 這裡做一個簡單的同步檢查 (假設 window.__uvacoSupabaseSession 已存在)
    if (targetUserId && window.__uvacoSupabaseSession && window.__uvacoSupabaseSession.user) {
       const myUserId = window.__uvacoSupabaseSession.user.id;
       if (String(targetUserId) !== String(myUserId)) {
         adminMode = true;
         adminModeForCompany = true;
       }
    }
  } catch (e) {}

  const profile_json = (function () {
    const card = document.getElementById('previewCard');
    const logo = document.getElementById('previewLogo');
    const avatar = document.getElementById('previewAvatar');
    const contacts = document.getElementById('previewContacts');
    const companyInfo = document.getElementById('companyInfoSection');
    const slogansZh = document.getElementById('previewSlogansZh');
    const slogansEn = document.getElementById('previewSlogansEn');

    // 取得乾淨的 HTML 字串（移除編輯屬性）
    const slogansZhClean = getCleanSloganHtml('previewSlogansZh');
    const slogansEnClean = getCleanSloganHtml('previewSlogansEn');

    const prevPj = (window.__uvacoLoadedProfileJson && typeof window.__uvacoLoadedProfileJson === 'object') 
      ? window.__uvacoLoadedProfileJson 
      : {};

    const logoSrcRaw = String(logo?.getAttribute('src') || '');
    const avatarSrcRaw = String(avatar?.getAttribute('src') || '');
    const logoSrcSafe = (logoSrcRaw.startsWith('blob:') || logoSrcRaw.startsWith('data:')) ? logoSrcRaw : '';
    const avatarSrcSafe = (avatarSrcRaw.startsWith('blob:') || avatarSrcRaw.startsWith('data:')) ? avatarSrcRaw : '';
    
    // 收集字體樣式
    const nameEl = document.getElementById('previewNameZh');
    const titleZhEl = document.getElementById('previewTitleZh');
    const titleEnEl = document.getElementById('previewTitleEn');
    
    const fontStyles = {
      name: {
        size: nameEl?.dataset.fontSize || 'medium',
        weight: nameEl?.dataset.fontWeight || 'normal',
        color: nameEl?.dataset.fontColor || ''
      },
      titleZh: {
        size: titleZhEl?.dataset.fontSize || 'medium',
        weight: titleZhEl?.dataset.fontWeight || 'normal',
        color: titleZhEl?.dataset.fontColor || ''
      },
      titleEn: {
        size: titleEnEl?.dataset.fontSize || 'medium',
        weight: titleEnEl?.dataset.fontWeight || 'normal',
        color: titleEnEl?.dataset.fontColor || ''
      }
    };
    
    // 收集標語樣式
    const sloganStyles = [];
    document.querySelectorAll('#previewSlogansZh .tagline, #previewSlogansEn .tagline').forEach((el, idx) => {
      sloganStyles.push({
        index: idx,
        size: el.dataset.fontSize || 'medium',
        weight: el.dataset.fontWeight || 'normal',
        color: el.dataset.fontColor || ''
      });
    });
    
    return {
      lang: currentLang,
      contactLayout: (window.__uvacoContactLayout === 'grid') ? 'grid' : 'list',
      nameZh: nameZhRaw,
      nameEn: nameEnRaw,
      titleZh: titleZhRaw,
      titleEn: titleEnRaw,
      companyCanonical: companyCanonical,
      companyLocked: false, // 永遠不鎖定
      companyZh: (function () {
        // 優先使用公司資訊區塊的公司名稱欄位
        const el = document.getElementById('previewCompanyNameZh');
        if (el && el.textContent.trim()) return el.textContent.trim();
        // Fallback 到標語
        const s = getSloganStrong('zh');
        return s ? String(s.textContent || '').trim() : '';
      })(),
      companyEn: (function () {
        // 優先使用公司資訊區塊的公司名稱欄位
        const el = document.getElementById('previewCompanyNameEn');
        if (el && el.textContent.trim()) return el.textContent.trim();
        // Fallback 到標語
        const s = getSloganStrong('en');
        return s ? String(s.textContent || '').trim() : '';
      })(),
      theme: theme,
      logoSrc: logoSrcSafe, // base64 (若太大建議改用 uploadMyAsset)
      avatarSrc: avatarSrcSafe,
      // 保留 storage path (若本次沒變更圖片，沿用舊的 path)
      logoPath: logoSrcSafe ? '' : (prevPj.logoPath || ''),
      avatarPath: avatarSrcSafe ? '' : (prevPj.avatarPath || ''),
      
      // 字體樣式
      fontStyles: fontStyles,
      sloganStyles: sloganStyles,
      
      // HTML Fragments (Cleaned)
      previewCardHtml: card ? card.innerHTML : '',
      contactsHtml: contacts ? getCleanHtmlFragment(contacts) : '',
      companyInfoHtml: companyInfo ? getCleanHtmlFragment(companyInfo) : '',
      slogansZhHtml: slogansZhClean,
      slogansEnHtml: slogansEnClean,
      
      savedAt: new Date().toISOString()
    };
  })();
  console.log('Profile JSON prepared:', profile_json);

  // 雲端儲存：若未設定 Supabase，仍允許離線儲存提示
  if (!window.UVACO_CLOUD || !UVACO_CLOUD.hasConfig()) {
    alert(currentLang === 'zh' ? '名片已儲存（離線模式）' : 'Saved (offline mode)');
    try { localStorage.setItem('UVACO_ONBOARDED', '1'); } catch (e) {}
    return;
  }

  // 需登入
  const here = 'edit.html' + (window.location.search || '');
  const auth = await UVACO_CLOUD.requireAuth(here);
  if (!auth.ok) return;

  // 合規：首次/版本變更需要同意（以 confirm 最小化 UI 變更）
  const consentVersion = 'v1.0';
  const policyUrl = (UVACO_CLOUD.getBaseUrl ? UVACO_CLOUD.getBaseUrl() : '') + 'privacy.html';
  const needConfirm = params.get('mode') === 'onboarding';
  
  // 再次確認 session (確保上述 adminMode 判斷正確，若有非同步問題可在這裡補救，但 adminModeForCompany 已經用在 profile_json 了，所以上面的同步判斷最重要)
  // 這裡不再重複宣告 targetUserId 和 adminMode
  
  if (needConfirm) {
    const ok = confirm(
      currentLang === 'zh'
        ? '儲存前請先同意隱私權政策（v1.0）。\n按「確定」代表你已閱讀並同意。'
        : 'Please agree to the Privacy Policy (v1.0) before saving.\nClick OK to continue.'
    );
    if (!ok) return;
  }

  try {
    // 寫入同意紀錄（若已同意同版本則會略過）
    await UVACO_CLOUD.ensureConsent(consentVersion, policyUrl);

    // 管理員模式：不支援替他人上傳圖片（Storage 路徑與權限以 auth.uid() 為準）
    if (adminMode && targetUserId) {
      if (window.__uvacoPendingAssets && (window.__uvacoPendingAssets.logo || window.__uvacoPendingAssets.avatar)) {
        alert(currentLang === 'zh'
          ? '管理員模式目前不支援替他人上傳圖片，請由本人登入後更新頭像/Logo。'
          : 'Admin mode does not support uploading images for other users. Please ask the owner to update avatar/logo.'
        );
        return;
      }
    }

    // 圖片上傳：若有選新圖，先上傳到 Supabase Storage，再把 path 寫入 profile_json
    // 加入重試機制處理網路不穩定
    if (!adminMode && window.__uvacoPendingAssets && (window.__uvacoPendingAssets.logo || window.__uvacoPendingAssets.avatar)) {
      const uploadWithRetry = async (type, asset) => {
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            console.log(`上傳 ${type} 嘗試 ${attempt}/${maxRetries}...`);
            return await UVACO_CLOUD.uploadMyAsset(type, asset.blob, {
              bucket: 'card-assets',
              ext: asset.ext,
              contentType: asset.contentType
            });
          } catch (e) {
            console.error(`${type} upload failed (attempt ${attempt}/${maxRetries})`, e);
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, attempt * 1000));
            } else {
              throw e;
            }
          }
        }
      };
      
      try {
        if (window.__uvacoPendingAssets.logo) {
          const up = await uploadWithRetry('logo', window.__uvacoPendingAssets.logo);
          profile_json.logoPath = up.path;
        }
        if (window.__uvacoPendingAssets.avatar) {
          const up = await uploadWithRetry('avatar', window.__uvacoPendingAssets.avatar);
          profile_json.avatarPath = up.path;
        }
        profile_json.assetsUpdatedAt = new Date().toISOString();
      } catch (e) {
        // 常見原因：尚未在 Supabase 執行 Storage bucket/RLS 的 SQL（card-assets / storage.objects policies）
        console.error('Storage upload failed', e);
        const detail = (e && (e.message || e.error_description)) ? String(e.message || e.error_description) : String(e || '');
        const lower = detail.toLowerCase();
        const status = String(e?.statusCode ?? e?.status ?? '');

        let hintZh = '圖片上傳失敗。';
        let hintEn = 'Image upload failed.';

        if (detail.includes('Bucket not found') || status === '404') {
          hintZh = "圖片上傳失敗：找不到 Storage bucket 'card-assets'。請到 Supabase Dashboard → Storage → Buckets 確認已建立 'card-assets'。";
          hintEn = "Image upload failed: Storage bucket 'card-assets' was not found. Please create/confirm a bucket named 'card-assets' in Supabase Dashboard → Storage → Buckets.";
        } else if (status === '403' || lower.includes('permission') || lower.includes('policy') || lower.includes('not authorized') || lower.includes('unauthorized')) {
          hintZh = "圖片上傳失敗：Storage 權限不足（RLS policy denied）。請確認你剛剛已在 Storage → Policies 針對 'card-assets' 建立 SELECT/INSERT/UPDATE/DELETE 四條 policies，且 INSERT/UPDATE/DELETE 限制為自己的路徑 auth.uid()/...。";
          hintEn = "Image upload failed: Storage permission denied (RLS policy). Please ensure you created the 4 policies (SELECT/INSERT/UPDATE/DELETE) for 'card-assets', and INSERT/UPDATE/DELETE are restricted to auth.uid()/... paths.";
        } else if (lower.includes('jwt') || lower.includes('token') || lower.includes('session')) {
          hintZh = '圖片上傳失敗：登入狀態可能已失效，請重新登入後再試一次。';
          hintEn = 'Image upload failed: session may be expired. Please re-login and try again.';
        }

        alert(currentLang === 'zh'
          ? `${hintZh}\n\n細節：${detail}`
          : `${hintEn}\n\nDetail: ${detail}`
        );
        return;
      }
    }

    // 重試機制：最多嘗試 3 次
    const maxRetries = 3;
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`儲存嘗試 ${attempt}/${maxRetries}...`);
        
        if (adminMode && targetUserId) {
          console.log('Calling adminUpdateCard...', targetUserId);
          await UVACO_CLOUD.adminUpdateCard(targetUserId, { name, phone, email, company, title, theme, profile_json });
        } else {
          console.log('Calling upsertMyCard...');
          await UVACO_CLOUD.upsertMyCard({ name, phone, email, company, title, theme, profile_json });
        }
        console.log('Database write successful.');
        lastError = null;
        break; // 成功，跳出重試迴圈
      } catch (e) {
        lastError = e;
        console.error(`Card upsert failed (attempt ${attempt}/${maxRetries})`, e);
        
        if (attempt < maxRetries) {
          // 等待後重試（指數退避：1秒、2秒）
          const waitTime = attempt * 1000;
          console.log(`等待 ${waitTime}ms 後重試...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    if (lastError) {
      const detail = (lastError && (lastError.message || lastError.error_description)) 
        ? (lastError.message || lastError.error_description) : '';
      const code = lastError?.code || '';
      
      // 檢查是否為 JWT 過期錯誤
      const isAuthError = 
        code === 'PGRST303' ||
        (detail && (detail.includes('JWT expired') || detail.includes('JWT')));
      
      if (isAuthError) {
        alert(currentLang === 'zh'
          ? '登入已過期，請重新登入。'
          : 'Session expired. Please log in again.'
        );
        const returnUrl = encodeURIComponent(location.pathname + location.search);
        window.location.href = 'auth.html?next=' + returnUrl;
        return;
      }
      
      alert(currentLang === 'zh'
        ? `名片寫入資料庫失敗（已重試 ${maxRetries} 次）：\n${detail}\n\n請檢查網路連線後再試。`
        : `Failed to write card to database (retried ${maxRetries} times):\n${detail}\n\nPlease check your network connection.`
      );
      return;
    }

    if (adminMode && targetUserId) {
      alert(currentLang === 'zh' ? '管理員：名片已更新！' : 'Admin: card updated!');
      setTimeout(() => {
        window.location.href = 'admin.html';
      }, 200);
    } else {
      alert(currentLang === 'zh' ? '名片已儲存！即將前往預覽頁面...' : 'Business card saved! Redirecting to preview...');
      try { localStorage.setItem('UVACO_ONBOARDED', '1'); } catch (e) {}
      setTimeout(() => {
        // 儲存後一律導向「我的名片」：card.html?id=<目前登入者>
        // 需求：避免 next 參數把使用者帶回 edit.html 或其他頁，造成「儲存後又回編輯頁」的困惑。
        (async function () {
          try {
            const s = await UVACO_CLOUD.getSession();
            const uid = s && s.session && s.session.user ? s.session.user.id : '';
            if (uid) {
              // 加入時間戳記強制刷新，避免 card.html 讀到快取
              window.location.href = 'card.html?id=' + encodeURIComponent(uid) + '&t=' + Date.now();
              return;
            }
          } catch (e) {}
          // 最後退回：通訊錄
          window.location.href = 'directory.html';
        })();
      }, 500);
    }
  } catch (e) {
    console.error('saveCard failed', e);
    const detail = (e && (e.message || e.error_description)) ? (e.message || e.error_description) : '';
    const code = e?.code || '';
    const reason = e?.reason || '';
    
    // 檢查是否為 JWT 過期或登入失效
    const isAuthError = 
      reason === 'JWT_EXPIRED' ||
      reason === 'NO_SESSION' ||
      code === 'PGRST303' ||
      (detail && (detail.includes('JWT expired') || detail.includes('JWT')));
    
    if (isAuthError) {
      alert(currentLang === 'zh'
        ? '登入已過期，請重新登入。'
        : 'Session expired. Please log in again.'
      );
      // 導向登入頁，並帶上返回網址
      const returnUrl = encodeURIComponent(location.pathname + location.search);
      window.location.href = 'auth.html?next=' + returnUrl;
      return;
    }
    
    alert(currentLang === 'zh'
      ? `儲存失敗，請稍後再試。\n${detail}`
      : `Save failed. Please try again.\n${detail}`
    );
  }
}


// ============= 首次使用教學 (Onboarding) =============
function checkOnboarding() {
  try {
    // 如果已經完成過教學，不再顯示
    if (localStorage.getItem('UVACO_ONBOARDED') === '1') return;
    
    // 檢查是否為新用戶（名片尚未填寫）
    const nameZh = document.getElementById('previewNameZh')?.textContent?.trim();
    const nameEn = document.getElementById('previewNameEn')?.textContent?.trim();
    
    // 如果名字是預設值或為空，視為新用戶
    if (!nameZh || nameZh === '-' || nameZh === '您的姓名') {
      setTimeout(showOnboardingModal, 800);
    }
  } catch (e) {
    console.log('[Onboarding] 檢查失敗:', e);
  }
}

function showOnboardingModal() {
  const modal = document.getElementById('onboardingModal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

function closeOnboarding() {
  const modal = document.getElementById('onboardingModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

function skipOnboarding() {
  try {
    localStorage.setItem('UVACO_ONBOARDED', '1');
  } catch (e) {}
  closeOnboarding();
}

function startOnboardingGuide() {
  closeOnboarding();
  // 聚焦到姓名欄位
  const nameField = document.querySelector('[contenteditable][id*="Name"]') || 
                    document.querySelector('.editable-text');
  if (nameField) {
    nameField.focus();
    // 顯示提示
    showOnboardingTip('name');
  }
}

let currentTip = null;
function showOnboardingTip(step) {
  // 移除舊提示
  if (currentTip) currentTip.remove();
  
  const tips = {
    name: { text: '👋 先填寫您的姓名', target: '.name' },
    title: { text: '✏️ 填寫您的職稱', target: '.tagline' },
    theme: { text: '🎨 點擊選擇喜歡的主題', target: '.edit-top-header button' },
    save: { text: '💾 完成後點擊儲存', target: '.edit-save-btn' }
  };
  
  const tip = tips[step];
  if (!tip) return;
  
  const target = document.querySelector(tip.target);
  if (!target) return;
  
  const tipEl = document.createElement('div');
  tipEl.className = 'onboarding-tip';
  tipEl.innerHTML = tip.text;
  tipEl.style.cssText = `
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--uvaco-green);
    color: white;
    padding: 12px 20px;
    border-radius: 24px;
    font-size: 14px;
    font-weight: 600;
    z-index: 9999;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    animation: tipBounce 0.5s ease;
  `;
  document.body.appendChild(tipEl);
  currentTip = tipEl;
  
  // 5 秒後自動移除
  setTimeout(() => {
    if (tipEl.parentNode) tipEl.remove();
  }, 5000);
}

// 頁面載入後檢查是否需要顯示教學
setTimeout(checkOnboarding, 1500);

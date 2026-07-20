// 編輯頁面：背景預載入所有主題以改善切換體驗
if (typeof preloadAllThemes === 'function') {
  preloadAllThemes();
}

// 雲端版：需要登入才可編輯（未設定 Supabase 則略過）
(async function () {
  try {
    if (window.UVACO_CLOUD && UVACO_CLOUD.hasConfig()) {
      // 以 edit.html 作為入口：未登入則導向 auth.html；登入後回到此頁
      const here = 'edit.html' + (window.location.search || '');
      const r = await UVACO_CLOUD.requireAuth(here);
      if (!r.ok) return;

      // 若有待領取的邀請（從 auth.html?invite=TOKEN 進來），自動建立名片
      try {
        const invTok = localStorage.getItem('UVACO_INVITE_TOKEN');
        if (invTok && UVACO_CLOUD.claimCardInvite) {
          await UVACO_CLOUD.claimCardInvite(invTok);
        }
      } catch (e) {
        console.log('[Invite] 領取邀請失敗:', e.message || e);
      } finally {
        try { localStorage.removeItem('UVACO_INVITE_TOKEN'); } catch (e) {}
      }

      // Admin Mode: 支援：
      // - edit.html?adminMode=true&targetUserId=<uuid>
      // - edit.html?uid=<uuid>
      // - edit.html?id=<uuid>（同 uid）
      // 規則：
      // - 只要網址有 uid/id/targetUserId，就以該 id 為「要編輯的目標」。
      // - 若目標不是本人 → 需要管理員權限。
      const params = new URLSearchParams(window.location.search || '');
      const targetUserId = params.get('targetUserId') || params.get('uid') || params.get('id');
      let adminMode = params.get('adminMode') === 'true';

      // 預設為編輯自己的名片
      let cardData = null;

      // 取得目前登入者 id，用於判斷是否為「編輯本人」或「編輯他人」
      let myUserId = '';
      try {
        const s = await UVACO_CLOUD.getSession();
        myUserId = s && s.session && s.session.user ? String(s.session.user.id || '') : '';
      } catch (e) {}

      if (targetUserId && myUserId && String(targetUserId) !== String(myUserId)) {
        // 有指定 targetUserId 且不是本人 → 自動轉為管理員模式
        adminMode = true;
      }

      // 若指定的 targetUserId 不是本人 → 走管理員模式（不管有沒有帶 adminMode=true）
      if (targetUserId && myUserId && String(targetUserId) !== String(myUserId)) {
        adminMode = true;
      }

      if (adminMode && targetUserId && myUserId && String(targetUserId) !== String(myUserId)) {
        // 管理員模式：檢查權限並讀取目標名片
        const adminStatus = await UVACO_CLOUD.isAdmin();
        if (!adminStatus || !adminStatus.isAdmin) {
          alert('權限不足：您不是管理員');
          window.location.href = 'directory.html';
          return;
        }
        
        // 顯示管理員提示條
        showAdminBanner(targetUserId);

        // 讀取目標名片
        const res = await UVACO_CLOUD.getCardByUserId(targetUserId);
        cardData = res.card;
        
        // 如果該用戶還沒名片，cardData 為 null，視為幫他新建
      } else {
        // 一般模式：
        // - 若網址有指定 uid/id/targetUserId（且是本人），就用 getCardByUserId() 明確讀取，避免載入錯誤或落回示例。
        // - 否則才用 getMyCard()
        if (targetUserId && myUserId && String(targetUserId) === String(myUserId)) {
          const meRes = await UVACO_CLOUD.getCardByUserId(targetUserId);
          cardData = meRes.card;
        } else {
          const my = await UVACO_CLOUD.getMyCard();
          cardData = my.card;
        }
        
        // 若使用者已經有名片：視為已 onboarding（避免清掉 localStorage 後又被當新手）
        if (cardData) {
          try { localStorage.setItem('UVACO_ONBOARDED', '1'); } catch (e) {}
        }

        // 若尚未建立名片，且網址未指定 mode：自動切換為 onboarding
        if (!cardData && !params.get('mode')) {
          params.set('mode', 'onboarding');
          if (!params.get('next')) params.set('next', 'directory.html');
          const qs = params.toString();
          const newUrl = 'edit.html' + (qs ? ('?' + qs) : '');
          window.history.replaceState({}, '', newUrl);
        }
      }

      // 如果有讀到名片資料，載入到介面
      if (cardData) {
        loadCardToUI(cardData);
      }

      // 套用公司管理員設定的鎖定欄位（不在管理員模式時才套用）
      if (!adminMode && cardData && cardData.company && window.UVACO_CLOUD && UVACO_CLOUD.getCompanySettings) {
        try {
          const cfg = await UVACO_CLOUD.getCompanySettings(cardData.company);
          if (cfg.lockedFields && cfg.lockedFields.length) {
            applyLockedFields(cfg.lockedFields);
          }
        } catch (e) {
          console.log('[LockFields] 讀取公司設定失敗:', e.message || e);
        }
      }

      // 注入公司選擇器按鈕（與語系同步顯示）
      try {
        setTimeout(() => injectCompanyPickerButtons(), 0);
      } catch (e) {}
    }
  } catch (e) {
    console.error('Init failed', e);
  }
})();

// 鎖定公司管理員指定的欄位（設定為不可編輯並顯示鎖定提示）
function applyLockedFields(fields) {
  if (!fields || !fields.length) return;

  // 欄位 → 受影響的 element ID 清單
  const FIELD_MAP = {
    name:       ['previewNameZh'],
    title:      ['previewTitleZh', 'previewTitleEn'],
    company:    ['previewCompanyNameZh', 'previewCompanyNameEn'],
    department: [], // 部門目前無獨立 contenteditable，透過儲存時阻擋
    email:      ['wizardEmail'],
    phone:      ['wizardPhone'],
    theme:      [],
  };

  const lockStyle = (el, label) => {
    el.contentEditable  = 'false';
    el.style.cursor     = 'not-allowed';
    el.style.opacity    = '0.65';
    el.style.outline    = 'none';
    el.title            = `🔒 ${label}由公司管理員鎖定`;
    el.dataset.locked   = '1';
  };

  const LABELS = {
    name: '姓名', title: '職稱', company: '公司名稱',
    department: '部門', email: 'Email', phone: '電話', theme: '名片主題'
  };

  fields.forEach(field => {
    // contenteditable 元素
    (FIELD_MAP[field] || []).forEach(id => {
      const el = document.getElementById(id);
      if (el) lockStyle(el, LABELS[field] || field);
    });

    // 向導模式的 input
    const wizardMap = {
      name:  ['wizardNameZh'],
      title: ['wizardTitleZh', 'wizardTitleEn'],
      email: ['wizardEmail'],
      phone: ['wizardPhone'],
    };
    (wizardMap[field] || []).forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.disabled = true;
      el.title    = `🔒 ${LABELS[field] || field}由公司管理員鎖定`;
      el.style.cursor  = 'not-allowed';
      el.style.opacity = '0.65';
    });

    // 主題鎖定：隱藏主題切換按鈕
    if (field === 'theme') {
      const themeBtn = document.querySelector('.theme-btn, [onclick*="openThemeSelector"], [onclick*="setTheme"]');
      if (themeBtn) {
        themeBtn.style.pointerEvents = 'none';
        themeBtn.style.opacity = '0.4';
        themeBtn.title = '🔒 名片主題由公司管理員鎖定';
      }
    }
  });

  // 顯示鎖定提示橫幅（只顯示一次）
  if (!document.getElementById('lockFieldBanner')) {
    const banner = document.createElement('div');
    banner.id = 'lockFieldBanner';
    banner.style.cssText = [
      'position:fixed','top:0','left:0','right:0',
      'background:#1a2e1a','border-bottom:1px solid rgba(34,197,94,.3)',
      'color:#4ade80','font-size:13px','font-weight:500',
      'text-align:center','padding:10px 16px','z-index:9000',
      'pointer-events:none'
    ].join(';');
    banner.textContent = `🔒 部分欄位已由公司管理員鎖定，無法修改`;
    document.body.appendChild(banner);
    setTimeout(() => { if (banner) banner.style.opacity = '0'; banner.style.transition = 'opacity 1s'; }, 4000);
  }
}

function showAdminBanner(targetUserId) {
  const div = document.createElement('div');
  div.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; 
    background: #eab308; color: #000; font-weight: bold; 
    text-align: center; padding: 8px; z-index: 9999;
    font-size: 14px; box-shadow: 0 2px 10px rgba(0,0,0,0.2);
  `;
  div.innerHTML = `⚠️ 管理員模式：您正在編輯使用者 ${targetUserId} 的名片 <button onclick="window.location.href='admin.html'" style="margin-left:10px;padding:2px 8px;border:1px solid #000;background:transparent;cursor:pointer;border-radius:4px;">返回後台</button>`;
  document.body.appendChild(div);
  // 把 top-bar 往下推一點以免被擋住
  const topBar = document.querySelector('.top-bar');
  if (topBar) topBar.style.marginTop = '36px';
}

function loadCardToUI(card) {
  // 將後端名片資料直接套到「預覽區」（本頁是 contenteditable 直編模式）
  if (!card) return;

  const safeText = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

  let pj = card.profile_json;
  if (typeof pj === 'string') {
    try { pj = JSON.parse(pj); } catch (e) { pj = {}; }
  }
  pj = (pj && typeof pj === 'object') ? pj : {};
  // 供 saveCard() 參考（避免 pj 作用域問題）
  window.__uvacoLoadedProfileJson = pj;

  const setHtmlLikeName = (id, raw) => {
    const el = document.getElementById(id);
    if (!el) return;
    const s = safeText(raw);
    // 即使是空字串也應該更新，除非 raw 為 null/undefined 代表沒資料
    if (raw === null || raw === undefined) return;
    
    const parts = s.split(/\s*｜\s*/);
    if (parts.length >= 2) {
      el.innerHTML = `${parts[0]} ｜ <span class="en">${parts.slice(1).join(' ｜ ')}</span>`;
    } else {
      el.textContent = s || (id === 'previewNameZh' ? '姓名' : '');
    }
  };

  const setText = (id, raw) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (raw === null || raw === undefined) return;
    const s = safeText(raw);
    el.textContent = s;
  };

  // 1) 套用主題（以資料庫存的值為準，蓋掉 initCardTheme() 載入中暫時顯示的本機舊值）
  try {
    const theme = parseInt(card.theme || pj.theme || 1, 10) || 1;
    window.currentCardTheme = theme;
    if (typeof window.applyCardThemeVisual === 'function') window.applyCardThemeVisual(theme);
  } catch (e) {}

  // 2) 套用姓名/職務（雙語）
  setHtmlLikeName('previewNameZh', pj.nameZh || card.name || '');
  // 修正舊資料汙染：早期版本的儲存邏輯曾在職稱清空時，誤把英文字「Title」存成
  // 舊版單一欄位 card.title，害使用者怎麼刪都刪不掉。這裡把這個髒值視為「沒有資料」，
  // 讓已經中毒的舊名片重新載入後能自動復原成空白，可以正常編輯。
  const legacyTitle = (card.title && card.title !== 'Title') ? card.title : '';
  setText('previewTitleZh', pj.titleZh || legacyTitle || '');
  setText('previewTitleEn', pj.titleEn || legacyTitle || '');
  // 姓名單行自動縮字（iPhone SE 等小螢幕）：手機端限制最大字級，避免蓋到頭像框
  try {
    const isSmall = (window.matchMedia && window.matchMedia('(max-width: 420px)').matches);
    fitTextToSingleLine(document.getElementById('previewNameZh'), { minPx: 16, maxPx: isSmall ? 30 : 34 });
  } catch (e) {}
  
  // 2.5) 還原字體樣式
  try {
    if (pj.fontStyles) {
      const applyFontStyle = (elementId, styleObj) => {
        const el = document.getElementById(elementId);
        if (!el || !styleObj) return;
        
        const sizeMap = {
          'small': elementId === 'previewNameZh' ? '18px' : '12px',
          'medium': elementId === 'previewNameZh' ? '24px' : '16px',
          'large': elementId === 'previewNameZh' ? '32px' : '20px'
        };
        
        if (styleObj.size && sizeMap[styleObj.size]) {
          el.style.fontSize = sizeMap[styleObj.size];
          el.dataset.fontSize = styleObj.size;
        }
        if (styleObj.weight) {
          el.style.fontWeight = styleObj.weight === 'bold' ? '700' : '400';
          el.dataset.fontWeight = styleObj.weight;
        }
        if (styleObj.color) {
          el.style.color = styleObj.color;
          el.dataset.fontColor = styleObj.color;
        }
      };
      
      applyFontStyle('previewNameZh', pj.fontStyles.name);
      applyFontStyle('previewTitleZh', pj.fontStyles.titleZh);
      applyFontStyle('previewTitleEn', pj.fontStyles.titleEn);
    }
  } catch (e) { console.log('Font style restore error:', e); }

  // 3) 公司（canonical + 鎖定）
  try {
    const canonical = safeText(pj.companyCanonical || card.company || '');
    window.__uvacoSelectedCompany = canonical;
    window.__uvacoOriginalCompanyCanonical = canonical;
    window.__uvacoCompanyLocked = (pj.companyLocked === true) && !isAdminModeFromUrl();
    if (canonical) applyCompanyToUI(canonical);
  } catch (e) {}

  // 3.1) 載入公司名稱到公司資訊區塊
  try {
    const companyZh = safeText(pj.companyZh || pj.companyCanonical || card.company || '');
    const companyEn = safeText(pj.companyEn || pj.companyCanonical || card.company || '');
    if (companyZh || companyEn) {
      const item = document.getElementById('companyNameItem');
      const zhEl = document.getElementById('previewCompanyNameZh');
      const enEl = document.getElementById('previewCompanyNameEn');
      if (item) item.style.display = 'flex';
      if (zhEl) zhEl.textContent = companyZh;
      if (enEl) enEl.textContent = companyEn;
    }
    window.__uvacoCompanyZh = companyZh;
    window.__uvacoCompanyEn = companyEn;
  } catch (e) {}

  // 4) Logo / Avatar（優先 Storage path）
  (async function () {
    try {
      const logo = document.getElementById('previewLogo');
      const avatar = document.getElementById('previewAvatar');
      const logoPlaceholder = document.getElementById('logoPlaceholder');
      const avatarPlaceholder = document.getElementById('avatarPlaceholder');
      
      // 顯示/隱藏 Logo placeholder
      function updateLogoDisplay(hasImage) {
        if (logo && logoPlaceholder) {
          logo.style.display = hasImage ? 'block' : 'none';
          logoPlaceholder.style.display = hasImage ? 'none' : 'flex';
        }
      }
      
      // 顯示/隱藏 Avatar placeholder
      function updateAvatarDisplay(hasImage) {
        if (avatar && avatarPlaceholder) {
          avatar.style.display = hasImage ? 'block' : 'none';
          avatarPlaceholder.style.display = hasImage ? 'none' : 'flex';
        }
      }
      
      // 若載入失敗，顯示 placeholder
      if (logo && !logo.__uvacoOnErrorBound) {
        logo.__uvacoOnErrorBound = true;
        logo.addEventListener('error', () => {
          updateLogoDisplay(false);
        });
        logo.addEventListener('load', () => {
          if (logo.src && logo.src !== window.location.href) updateLogoDisplay(true);
        });
      }
      if (avatar && !avatar.__uvacoOnErrorBound) {
        avatar.__uvacoOnErrorBound = true;
        avatar.addEventListener('error', () => {
          updateAvatarDisplay(false);
        });
        avatar.addEventListener('load', () => {
          if (avatar.src && avatar.src !== window.location.href) updateAvatarDisplay(true);
        });
      }
      
      // 初始狀態：顯示 placeholder
      updateLogoDisplay(false);
      updateAvatarDisplay(false);
      
      if (window.UVACO_CLOUD && UVACO_CLOUD.hasConfig()) {
        if (logo) {
          if (pj.logoPath) {
            const u = await UVACO_CLOUD.getSignedAssetUrl(String(pj.logoPath), { bucket: 'card-assets', expiresIn: 3600 });
            if (u && u.url) {
              logo.setAttribute('src', u.url);
              updateLogoDisplay(true);
            }
          } else if (pj.logoSrc) {
            logo.setAttribute('src', String(pj.logoSrc));
            updateLogoDisplay(true);
          }
        }
        if (avatar) {
          if (pj.avatarPath) {
            const u = await UVACO_CLOUD.getSignedAssetUrl(String(pj.avatarPath), { bucket: 'card-assets', expiresIn: 3600 });
            if (u && u.url) {
              avatar.setAttribute('src', u.url);
              updateAvatarDisplay(true);
            }
          } else if (pj.avatarSrc) {
            avatar.setAttribute('src', String(pj.avatarSrc));
            updateAvatarDisplay(true);
          }
        }
      }
    } catch (e) {}
  })();

  // 過濾系統提示文字（避免顯示被誤存的提示）
  function filterSystemTextFromHtml(html) {
    if (!html) return html;
    const systemPatterns = [
      '公司已鎖定（如需更改請聯絡管理員）',
      '公司：必選下拉（可輸入關鍵字快速帶入）',
      '🏢 選擇公司',
      '🏢 Select Company',
      '請輸入內容',
      'Enter content'
    ];
    let result = html;
    systemPatterns.forEach(pattern => {
      result = result.split(pattern).join('');
    });
    // 移除公司選擇器相關的 HTML 標籤
    result = result.replace(/<div[^>]*class="[^"]*uvaco-company-picker[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
    result = result.replace(/<button[^>]*id="uvacoCompanyPickBtn[^"]*"[^>]*>[\s\S]*?<\/button>/gi, '');
    return result;
  }

  // 5) 公司資訊（載入後確保新元素存在）
  try {
    const section = document.getElementById('companyInfoSection');
    if (section && pj.companyInfoHtml) {
      section.innerHTML = filterSystemTextFromHtml(String(pj.companyInfoHtml));
    }
    // 確保 companyNameItem 元素存在（舊資料可能沒有此元素）
    ensureCompanyNameItemExists();
  } catch (e) {}

  // 6) 聯絡方式（直接回填 HTML，維持排序與顯示方式）
  try {
    const contacts = document.getElementById('previewContacts');
    if (contacts && pj.contactsHtml) {
      contacts.innerHTML = filterSystemTextFromHtml(String(pj.contactsHtml));
    }
    // 套用顯示方式（grid/list）
    const layout = String(pj.contactLayout || '').toLowerCase() === 'grid' ? 'grid' : 'list';
    window.__uvacoContactLayout = layout;
    if (typeof applyContactLayout === 'function') applyContactLayout(layout);
  } catch (e) {}

  // 7) 標語（直接回填 HTML，維持原版型與可編輯事件）
  try {
    const zhSlogans = document.getElementById('previewSlogansZh');
    // 優先使用資料庫中的 HTML (pj.slogansZhHtml)
    // 但若 pj.slogansZhHtml 為空，且是第一次編輯（沒有 savedAt），則保留預設的 HTML（不覆蓋為空）
    // 避免新用戶一進來標語就被清空
    if (zhSlogans) {
      if (pj.slogansZhHtml) {
        zhSlogans.innerHTML = filterSystemTextFromHtml(String(pj.slogansZhHtml));
      } else if (pj.savedAt) {
        // 若有儲存過但 html 為空，代表用戶可能真的清空了，這裡應該要清空？
        // 為了安全起見，若真的為空，給一個預設結構，方便用戶點擊編輯
        zhSlogans.innerHTML = `<div class="slogan-item"><div class="tagline lang-zh edit-clickable" contenteditable="true" onblur="updateSlogansPreview()" onclick="focusEdit(this)">健康・事業・未來</div><button class="slogan-delete-btn" onclick="deleteSloganFromPreview(this)" title="刪除標語">✕</button></div>`;
      }
    }

    const enSlogans = document.getElementById('previewSlogansEn');
    if (enSlogans) {
      if (pj.slogansEnHtml) {
        enSlogans.innerHTML = filterSystemTextFromHtml(String(pj.slogansEnHtml));
      } else if (pj.savedAt) {
        enSlogans.innerHTML = `<div class="slogan-item"><div class="tagline lang-en edit-clickable" contenteditable="true" onblur="updateSlogansPreview()" onclick="focusEdit(this)">Health • Business • Future</div><button class="slogan-delete-btn" onclick="deleteSloganFromPreview(this)" title="Delete slogan">✕</button></div>`;
      }
    }
  } catch (e) {}

  // 8) 同步標語預覽（確保事件繫結與整理）
  try { if (typeof updateSlogansPreview === 'function') updateSlogansPreview(); } catch (e) {}

  // 8.1) 使用事件委派確保標語刪除按鈕能正常運作
  ['previewSlogansZh', 'previewSlogansEn'].forEach(id => {
    const container = document.getElementById(id);
    if (container && !container._deleteHandlerBound) {
      container.addEventListener('click', function(e) {
        if (e.target.classList.contains('slogan-delete-btn')) {
          e.stopPropagation();
          deleteSloganFromPreview(e.target);
        }
      });
      container._deleteHandlerBound = true;
    }
  });

  // 9) 恢復公司資訊區域的編輯功能
  try { restoreCompanyInfoFunctionality(); } catch (e) { console.error('restoreCompanyInfoFunctionality error:', e); }

  // 10) 恢復聯絡方式區域的編輯功能
  try { restoreContactsFunctionality(); } catch (e) { console.error('restoreContactsFunctionality error:', e); }

  // 11) 重新套用語言設定，確保載入的內容顯示正確語言
  try {
    const savedLang = localStorage.getItem('lang') || 'zh';
    if (typeof setLang === 'function') setLang(savedLang);
  } catch (e) {}

  // 12) 依目前實際資料，決定要不要輕微高亮「🧙 用引導方式新增」按鈕（例如聯絡方式目前是空的）
  try { if (typeof evaluateGuideEntry === 'function') evaluateGuideEntry(); } catch (e) {}
}

// 確保 companyNameItem 元素存在（舊資料可能沒有此元素）
function ensureCompanyNameItemExists() {
  const section = document.getElementById('companyInfoSection');
  if (!section) return;
  
  // 如果 companyNameItem 不存在，重新建立
  if (!document.getElementById('companyNameItem')) {
    const sectionLabel = section.querySelector('.section-label');
    const companyNameHtml = `
      <div class="info-item info-item-company-name" id="companyNameItem" style="display: none;">
        <span class="info-label lang-zh">公司名稱：</span>
        <span class="info-label lang-en">Company Name:</span>
        <span class="info-value lang-zh edit-clickable" id="previewCompanyNameZh" contenteditable="true" onclick="focusEdit(this)" onblur="updateCompanyFromPreview()" data-placeholder="請輸入公司名稱" style="min-width: 150px; min-height: 1.2em;"></span>
        <span class="info-value lang-en edit-clickable" id="previewCompanyNameEn" contenteditable="true" onclick="focusEdit(this)" onblur="updateCompanyFromPreview()" data-placeholder="Enter company name" style="min-width: 150px; min-height: 1.2em;"></span>
        <button class="info-delete-btn" onclick="deleteCompanyInfo('companyName')" title="刪除">×</button>
      </div>
    `;
    // 插入到 section-label 之後
    if (sectionLabel) {
      sectionLabel.insertAdjacentHTML('afterend', companyNameHtml);
    } else {
      section.insertAdjacentHTML('afterbegin', companyNameHtml);
    }
  }
}

// 恢復公司資訊區域的編輯功能（載入已保存數據後重新綁定事件）
function restoreCompanyInfoFunctionality() {
  const section = document.getElementById('companyInfoSection');
  if (!section) return;

  // 地址類型列表
  const addressTypes = ['serviceLocation', 'mailingAddress', 'companyAddress'];

  addressTypes.forEach(type => {
    const itemId = type + 'Item';
    const item = document.getElementById(itemId);
    if (!item) return;

    const typeCapitalized = type.charAt(0).toUpperCase() + type.slice(1);
    const zhEl = document.getElementById(`preview${typeCapitalized}Zh`);
    const enEl = document.getElementById(`preview${typeCapitalized}En`);

    // 恢復中文地址的編輯功能
    if (zhEl) {
      zhEl.classList.add('edit-clickable');
      zhEl.onclick = function(event) { editAddress(type, event); };
      
      // 恢復地圖連結
      const mapLinkZh = zhEl.querySelector('.address-map-link');
      if (mapLinkZh) {
        mapLinkZh.onclick = function(event) { openMap(type, event); };
      }
    }

    // 恢復英文地址的編輯功能
    if (enEl) {
      enEl.classList.add('edit-clickable');
      enEl.onclick = function(event) { editAddress(type, event); };
      
      // 恢復地圖連結
      const mapLinkEn = enEl.querySelector('.address-map-link');
      if (mapLinkEn) {
        mapLinkEn.onclick = function(event) { openMap(type, event); };
      }
    }

    // 檢查並添加刪除按鈕（如果不存在）
    if (!item.querySelector('.info-delete-btn')) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'info-delete-btn';
      deleteBtn.title = '刪除';
      deleteBtn.textContent = '×';
      deleteBtn.onclick = function() { deleteCompanyInfo(type); };
      item.appendChild(deleteBtn);
    }
  });

  // 恢復公司名稱的編輯功能
  const companyNameItem = document.getElementById('companyNameItem');
  if (companyNameItem) {
    const companyNameZh = document.getElementById('previewCompanyNameZh');
    const companyNameEn = document.getElementById('previewCompanyNameEn');

    if (companyNameZh) {
      companyNameZh.classList.add('edit-clickable');
      companyNameZh.setAttribute('contenteditable', 'true');
      companyNameZh.onclick = function() { focusEdit(this); };
      companyNameZh.onblur = function() { updateCompanyFromPreview(); };
    }
    if (companyNameEn) {
      companyNameEn.classList.add('edit-clickable');
      companyNameEn.setAttribute('contenteditable', 'true');
      companyNameEn.onclick = function() { focusEdit(this); };
      companyNameEn.onblur = function() { updateCompanyFromPreview(); };
    }

    // 檢查並添加刪除按鈕
    if (!companyNameItem.querySelector('.info-delete-btn')) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'info-delete-btn';
      deleteBtn.title = '刪除';
      deleteBtn.textContent = '×';
      deleteBtn.onclick = function() { deleteCompanyInfo('companyName'); };
      companyNameItem.appendChild(deleteBtn);
    }
  }

  // 恢復統一編號的編輯功能
  const taxIdItem = document.getElementById('taxIdItem');
  if (taxIdItem) {
    const taxIdZh = document.getElementById('previewTaxIdZh');
    const taxIdEn = document.getElementById('previewTaxIdEn');

    if (taxIdZh) {
      taxIdZh.classList.add('edit-clickable');
      taxIdZh.setAttribute('contenteditable', 'true');
      taxIdZh.onclick = function(event) { editTaxId(event); };
    }
    if (taxIdEn) {
      taxIdEn.classList.add('edit-clickable');
      taxIdEn.setAttribute('contenteditable', 'true');
      taxIdEn.onclick = function(event) { editTaxId(event); };
    }

    // 檢查並添加刪除按鈕
    if (!taxIdItem.querySelector('.info-delete-btn')) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'info-delete-btn';
      deleteBtn.title = '刪除';
      deleteBtn.textContent = '×';
      deleteBtn.onclick = function() { deleteCompanyInfo('taxId'); };
      taxIdItem.appendChild(deleteBtn);
    }
  }

  // 恢復自訂公司資訊項目的編輯功能
  const customItems = section.querySelectorAll('.info-item-custom');
  customItems.forEach(item => {
    const labelEl = item.querySelector('.info-label');
    const valueZhEl = item.querySelector('.info-value.lang-zh');
    const valueEnEl = item.querySelector('.info-value.lang-en');

    if (labelEl) {
      labelEl.classList.add('edit-clickable');
      labelEl.setAttribute('contenteditable', 'true');
    }
    if (valueZhEl) {
      valueZhEl.classList.add('edit-clickable');
      valueZhEl.setAttribute('contenteditable', 'true');
    }
    if (valueEnEl) {
      valueEnEl.classList.add('edit-clickable');
      valueEnEl.setAttribute('contenteditable', 'true');
    }

    // 檢查並添加刪除按鈕
    if (!item.querySelector('.info-delete-btn')) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'info-delete-btn';
      deleteBtn.title = '刪除';
      deleteBtn.textContent = '×';
      deleteBtn.onclick = function() { item.remove(); };
      item.appendChild(deleteBtn);
    }
  });

  // 檢查並添加「新增公司資訊」按鈕（如果不存在）
  if (!section.querySelector('.edit-add-btn')) {
    const addBtnZh = document.createElement('button');
    addBtnZh.className = 'edit-add-btn lang-zh';
    addBtnZh.textContent = '+ 新增公司資訊';
    addBtnZh.onclick = function(event) { showCompanyInfoTypeModal(event); };
    section.appendChild(addBtnZh);

    const addBtnEn = document.createElement('button');
    addBtnEn.className = 'edit-add-btn lang-en';
    addBtnEn.textContent = '+ Add Company Info';
    addBtnEn.onclick = function(event) { showCompanyInfoTypeModal(event); };
    section.appendChild(addBtnEn);
  }
}

// 恢復聯絡方式區域的編輯功能（載入已保存數據後重新綁定事件）
function restoreContactsFunctionality() {
  const contacts = document.getElementById('previewContacts');
  if (!contacts) return;

  // 恢復所有聯絡方式按鈕的編輯功能
  const contactBtns = contacts.querySelectorAll('a.btn');
  contactBtns.forEach(btn => {
    btn.classList.add('edit-clickable');
    
    // 根據按鈕類型和 href 判斷聯絡方式類型
    const href = btn.getAttribute('href') || '';
    let type = 'website';
    
    if (href.startsWith('tel:')) {
      type = 'call';
    } else if (href.startsWith('mailto:')) {
      type = 'email';
    } else if (href.includes('line.me') || href.includes('line://')) {
      type = 'line';
    } else if (href.endsWith('.vcf')) {
      type = 'vcf';
    } else if (href.includes('wa.me') || href.includes('whatsapp')) {
      type = 'whatsapp';
    } else if (href.includes('facebook.com') || href.includes('fb.com')) {
      type = 'facebook';
    } else if (href.includes('instagram.com')) {
      type = 'instagram';
    } else if (href.includes('linkedin.com')) {
      type = 'linkedin';
    } else if (href.includes('twitter.com') || href.includes('x.com')) {
      type = 'twitter';
    } else if (href.includes('youtube.com')) {
      type = 'youtube';
    } else if (href.includes('wechat') || href.includes('weixin')) {
      type = 'wechat';
    }

    const currentLink = href;
    btn.onclick = function(event) { editContact(event, type, currentLink); };
  });

  // 恢復刪除按鈕
  const wrappers = contacts.querySelectorAll('.contact-btn-wrapper');
  wrappers.forEach(wrapper => {
    if (!wrapper.querySelector('.contact-delete-btn')) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'contact-delete-btn';
      deleteBtn.title = '刪除';
      deleteBtn.textContent = '✕';
      deleteBtn.onclick = function(event) {
        event.stopPropagation();
        const anchor = wrapper.querySelector('a');
        if (typeof deleteContactButton === 'function') {
          deleteContactButton(anchor);
          return;
        }
        const zhElements = document.querySelectorAll('.lang-zh');
        const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';
        const confirmMsg = currentLang === 'zh' ? '確定要刪除此聯絡方式嗎？' : 'Are you sure you want to delete this contact method?';
        if (!confirm(confirmMsg)) return;
        const fallbackWrapper = anchor ? anchor.closest('.contact-btn-wrapper') : wrapper;
        if (fallbackWrapper) {
          fallbackWrapper.remove();
        }
      };
      wrapper.appendChild(deleteBtn);
    }
  });

  // 檢查並添加「新增聯絡方式」按鈕（如果不存在）
  if (!contacts.querySelector('.edit-add-btn')) {
    const addBtnZh = document.createElement('button');
    addBtnZh.className = 'edit-add-btn lang-zh';
    addBtnZh.textContent = '+ 新增聯絡方式';
    addBtnZh.onclick = function(event) { addContact(event); };
    contacts.appendChild(addBtnZh);

    const addBtnEn = document.createElement('button');
    addBtnEn.className = 'edit-add-btn lang-en';
    addBtnEn.textContent = '+ Add Contact Method';
    addBtnEn.onclick = function(event) { addContact(event); };
    contacts.appendChild(addBtnEn);
  }
}

// 這裡是聯絡方式刪除的備援主流程，避免後續腳本載入失敗時找不到函式
function deleteContactButton(btn) {
  const zhElements = document.querySelectorAll('.lang-zh');
  const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';
  const confirmMsg = currentLang === 'zh' ? '確定要刪除此聯絡方式嗎？' : 'Are you sure you want to delete this contact method?';
  if (!confirm(confirmMsg)) return;

  const anchor = (btn && btn.nodeName === 'A') ? btn : (btn && btn.closest ? btn.closest('a') : null);
  const wrapper = anchor ? anchor.closest('.contact-btn-wrapper') : null;
  if (wrapper) {
    wrapper.remove();
  }
}

// 聚焦編輯
function focusEdit(element) {
  // 修正：避免每次點擊都「全選」導致貼上/輸入時游標跳動、文字被整段覆蓋。
  // 行為改為：若尚未聚焦，聚焦並把游標放到結尾（不全選）。
  try {
    const alreadyFocused = (document.activeElement === element);
    element.focus();
    
    // 顯示字體樣式工具列（無論是否已聚焦）
    showFontStyleToolbar(element);
    
    if (alreadyFocused) return;

    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();

    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false); // 游標放到結尾
    selection.addRange(range);
  } catch (e) {
    // 即使發生錯誤，仍嘗試顯示工具列
    try { showFontStyleToolbar(element); } catch (e2) {}
  }
}

// ===== 字體樣式工具列功能 =====
let currentStyledElement = null;

function showFontStyleToolbar(element) {
  const toolbar = document.getElementById('fontStyleToolbar');
  if (!toolbar) return;
  
  // 只對姓名、職稱、標語欄位顯示工具列
  const isStyleable = element.id === 'previewNameZh' || 
                      element.id === 'previewTitleZh' || 
                      element.id === 'previewTitleEn' ||
                      element.closest('.slogan-item');
  
  if (!isStyleable) {
    hideFontStyleToolbar();
    return;
  }
  
  currentStyledElement = element;
  
  // 計算位置
  const rect = element.getBoundingClientRect();
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
  
  toolbar.style.position = 'fixed';
  toolbar.style.top = (rect.top - 50) + 'px';
  toolbar.style.left = (rect.left + rect.width / 2) + 'px';
  toolbar.style.transform = 'translateX(-50%)';
  toolbar.classList.add('active');
  
  // 更新工具列按鈕狀態
  updateToolbarState(element);
}

function hideFontStyleToolbar() {
  const toolbar = document.getElementById('fontStyleToolbar');
  if (toolbar) {
    toolbar.classList.remove('active');
  }
  currentStyledElement = null;
}

function updateToolbarState(element) {
  const style = window.getComputedStyle(element);
  const toolbar = document.getElementById('fontStyleToolbar');
  if (!toolbar) return;
  
  // 更新字體大小按鈕狀態
  const fontSize = parseInt(style.fontSize);
  toolbar.querySelectorAll('.size-s, .size-m, .size-l').forEach(btn => btn.classList.remove('active'));
  if (fontSize <= 14) {
    toolbar.querySelector('.size-s')?.classList.add('active');
  } else if (fontSize >= 24) {
    toolbar.querySelector('.size-l')?.classList.add('active');
  } else {
    toolbar.querySelector('.size-m')?.classList.add('active');
  }
  
  // 更新粗細按鈕狀態
  const fontWeight = style.fontWeight;
  toolbar.querySelectorAll('.font-style-btn[onclick^="setFontWeight"]').forEach(btn => btn.classList.remove('active'));
  if (fontWeight === 'bold' || parseInt(fontWeight) >= 600) {
    toolbar.querySelector('.font-style-btn[onclick="setFontWeight(\'bold\')"]')?.classList.add('active');
  } else {
    toolbar.querySelector('.font-style-btn[onclick="setFontWeight(\'normal\')"]')?.classList.add('active');
  }
  
  // 更新調色盤狀態
  const color = rgbToHex(style.color);
  const picker = document.getElementById('fontColorPicker');
  if (picker) {
    picker.value = color;
  }
}

function rgbToHex(rgb) {
  if (rgb.startsWith('#')) return rgb;
  const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!match) return rgb;
  return '#' + [match[1], match[2], match[3]].map(x => {
    const hex = parseInt(x).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

function setFontSize(size) {
  if (!currentStyledElement) return;
  
  const sizeMap = {
    'small': '14px',
    'medium': '18px',
    'large': '26px'
  };
  
  // 根據元素類型調整基準大小
  if (currentStyledElement.classList.contains('name')) {
    sizeMap.small = '18px';
    sizeMap.medium = '24px';
    sizeMap.large = '32px';
  } else if (currentStyledElement.classList.contains('tagline')) {
    sizeMap.small = '12px';
    sizeMap.medium = '16px';
    sizeMap.large = '20px';
  }
  
  currentStyledElement.style.fontSize = sizeMap[size] || sizeMap.medium;
  
  // 儲存樣式到 data 屬性
  currentStyledElement.dataset.fontSize = size;
  
  updateToolbarState(currentStyledElement);
}


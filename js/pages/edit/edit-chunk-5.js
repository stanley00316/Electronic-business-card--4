// 編輯頁主邏輯：名片儲存與新手引導。

// 依照錯誤是否值得「重新儲存」，組出白話文錯誤彈窗要顯示的按鈕。
// canRetry=true：提供「重新儲存」（直接再呼叫一次 saveCard()）＋「複製錯誤代碼給客服」。
// canRetry=false（例如圖片上傳的設定類問題，重試通常沒用）：只給「知道了」，並順手複製錯誤代碼，方便使用者回報。
function buildErrorActions(result, opts) {
  opts = opts || {};
  if (opts.canRetry) {
    return [
      { labelZh: '重新儲存', labelEn: 'Save Again', primary: true, onClick: function () { saveCard(); } },
      { labelZh: '複製錯誤代碼給客服', labelEn: 'Copy Error Code', primary: false, onClick: function () { copyErrorDetailToClipboard(result); } }
    ];
  }
  return [
    { labelZh: '知道了', labelEn: 'OK', primary: true, onClick: function () { copyErrorDetailToClipboard(result); } }
  ];
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
  // 職稱（舊版單一欄位）：中文職稱優先，沒填就退而求其次用英文職稱，兩者都空就存空字串。
  // 這裡絕對不能再用 'Title' 這種假字當預設值，否則會被永久存進資料庫，
  // 造成使用者清空職稱後，畫面又跑出洗不掉的英文字「Title」。
  const title = primaryPart(titleZhRaw) || primaryPart(titleEnRaw) || '';

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
    try { localStorage.setItem('UVACO_ONBOARDED', '1'); } catch (e) {}
    await showSaveFeedback('success', {
      titleZh: '已儲存在這台裝置', titleEn: 'Saved on This Device',
      msgZh: '目前無法連上雲端，先幫您存在這台手機/電腦裡，之後連上網路記得再存一次。',
      msgEn: 'Could not reach the cloud right now, so your card was saved on this device. Please save again once you are back online.'
    });
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
    const ok = await showSaveFeedback('confirm', {
      titleZh: '同意隱私權政策', titleEn: 'Privacy Policy',
      msgZh: '儲存前請先同意隱私權政策（v1.0），按「同意並繼續」代表您已閱讀並同意。',
      msgEn: 'Please agree to the Privacy Policy (v1.0) before saving.',
      actions: [
        { labelZh: '同意並繼續', labelEn: 'Agree & Continue', primary: true, result: true },
        { labelZh: '取消', labelEn: 'Cancel', primary: false, result: false }
      ]
    });
    if (!ok) return;
  }

  try {
    // 寫入同意紀錄（若已同意同版本則會略過）
    await UVACO_CLOUD.ensureConsent(consentVersion, policyUrl);

    // 圖片上傳：若有選新圖，先上傳到 Supabase Storage，再把 path 寫入 profile_json
    // 加入重試機制處理網路不穩定；管理員模式下改用 adminUploadAsset 代替目標使用者上傳
    // （需通過 Storage 的管理員例外規則，見 supabase-setup.sql；企業管理員仍只能傳自己公司員工的圖片）
    if (window.__uvacoPendingAssets && (window.__uvacoPendingAssets.logo || window.__uvacoPendingAssets.avatar)) {
      const uploadWithRetry = async (type, asset) => {
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            console.log(`上傳 ${type} 嘗試 ${attempt}/${maxRetries}...`);
            const uploadOpts = {
              bucket: 'card-assets',
              ext: asset.ext,
              contentType: asset.contentType
            };
            return (adminMode && targetUserId)
              ? await UVACO_CLOUD.adminUploadAsset(targetUserId, type, asset.blob, uploadOpts)
              : await UVACO_CLOUD.uploadMyAsset(type, asset.blob, uploadOpts);
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
        const result = classifySaveError(e);
        await showSaveFeedback('error', {
          titleZh: result.titleZh, titleEn: result.titleEn,
          msgZh: result.msgZh, msgEn: result.msgEn,
          actions: buildErrorActions(result, { canRetry: false })
        });
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
      const result = classifySaveError(lastError);

      if (result.kind === 'auth') {
        await showSaveFeedback('error', {
          titleZh: result.titleZh, titleEn: result.titleEn,
          msgZh: result.msgZh, msgEn: result.msgEn,
          actions: [{ labelZh: '重新登入', labelEn: 'Log In Again', primary: true }]
        });
        const returnUrl = encodeURIComponent(location.pathname + location.search);
        window.location.href = 'auth.html?next=' + returnUrl;
        return;
      }

      await showSaveFeedback('error', {
        titleZh: result.titleZh, titleEn: result.titleEn,
        msgZh: result.msgZh, msgEn: result.msgEn,
        actions: buildErrorActions(result, { canRetry: true })
      });
      return;
    }

    if (adminMode && targetUserId) {
      await showSaveFeedback('success', {
        titleZh: '已更新完成', titleEn: 'Updated',
        msgZh: '這位員工的名片資料已經更新囉。',
        msgEn: "This employee's card has been updated.",
        actions: [{ labelZh: '回到管理後台', labelEn: 'Back to Admin', primary: true }]
      });
      window.location.href = 'admin.html';
    } else {
      try { localStorage.setItem('UVACO_ONBOARDED', '1'); } catch (e) {}
      await showSaveFeedback('success', {
        titleZh: '儲存成功！', titleEn: 'Saved!',
        msgZh: '您的名片已經存好了，馬上帶您去看看完成的樣子。',
        msgEn: 'Your card has been saved. Let’s take a look at the result.',
        actions: [{ labelZh: '查看我的名片', labelEn: 'View My Card', primary: true }]
      });
      // 儲存後一律導向「我的名片」：card.html?id=<目前登入者>
      // 需求：避免 next 參數把使用者帶回 edit.html 或其他頁，造成「儲存後又回編輯頁」的困惑。
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
    }
  } catch (e) {
    console.error('saveCard failed', e);
    const result = classifySaveError(e);

    if (result.kind === 'auth') {
      await showSaveFeedback('error', {
        titleZh: result.titleZh, titleEn: result.titleEn,
        msgZh: result.msgZh, msgEn: result.msgEn,
        actions: [{ labelZh: '重新登入', labelEn: 'Log In Again', primary: true }]
      });
      // 導向登入頁，並帶上返回網址
      const returnUrl = encodeURIComponent(location.pathname + location.search);
      window.location.href = 'auth.html?next=' + returnUrl;
      return;
    }

    await showSaveFeedback('error', {
      titleZh: result.titleZh, titleEn: result.titleEn,
      msgZh: result.msgZh, msgEn: result.msgEn,
      actions: buildErrorActions(result, { canRetry: true })
    });
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

// 使用者在歡迎彈窗選擇「✍️ 我自己直接編輯」：關閉彈窗、標記已完成引導、
// 聚焦到姓名欄位，並顯示一次性的提示卡告訴他「點文字就能編輯」
// （取代舊版那種 5 秒自動消失、容易被錯過的浮動提示條）。
function startSelfEditFromOnboarding() {
  try { localStorage.setItem('UVACO_ONBOARDED', '1'); } catch (e) {}
  closeOnboarding();

  const nameField = document.getElementById('previewNameZh');
  if (nameField) nameField.focus();

  showGuideInlineHintIfNeeded();
}

function showGuideInlineHintIfNeeded() {
  try {
    if (localStorage.getItem('UVACO_GUIDE_INLINE_HINT_SEEN') === '1') return;
  } catch (e) {}
  const hint = document.getElementById('guideInlineHint');
  if (hint) hint.style.display = 'flex';
}

function dismissGuideInlineHint() {
  try { localStorage.setItem('UVACO_GUIDE_INLINE_HINT_SEEN', '1'); } catch (e) {}
  const hint = document.getElementById('guideInlineHint');
  if (hint) hint.style.display = 'none';
}

// 依目前名片實際有沒有資料，決定要不要輕微高亮「🧙 用引導方式新增」按鈕：
// 完全沒有聯絡方式時加上呼吸動畫暗示「可以從這裡開始」，已經有資料的話就不搶眼，
// 讓精靈入口跟直接編輯兩種模式自然並存，不用彈窗強迫使用者選邊站。
function evaluateGuideEntry() {
  const contacts = document.getElementById('previewContacts');
  const contactBtn = document.getElementById('contactGuideEntryBtn');
  if (contactBtn) {
    const hasAnyContact = !!(contacts && contacts.querySelector('a[href]'));
    contactBtn.classList.toggle('guide-entry-suggested', !hasAnyContact);
  }
}

// 注意：這裡原本還有一套「startOnboardingGuide + showOnboardingTip」的舊版 4 步驟浮動提示條
// （底部彈出綠色提示、5 秒自動消失），但因為 wizard.js 後載入、重新宣告了同名的
// startOnboardingGuide()，會直接覆蓋掉這裡的版本，導致這段程式碼永遠不會被執行——是死碼，已整段移除。
// 現在「自己編輯」情境改用上面 showGuideInlineHintIfNeeded() 的常駐提示卡，
// 「精靈逐步引導」情境則是 wizard.js 的 5 步驟精靈，兩者是目前唯二、不互相覆蓋的引導入口。

// 頁面載入後檢查是否需要顯示教學
setTimeout(checkOnboarding, 1500);

// 編輯頁主邏輯：名片儲存與新手引導。
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

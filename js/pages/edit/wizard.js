// ===== 步驟引導精靈 JavaScript =====
let wizardCurrentStep = 1;
const wizardTotalSteps = 5;
let wizardSelectedTheme = 1;
// wizardMode 決定精靈這次要不要走完整 5 步驟：
// 'full'：從零建立或「🧙 逐步設定」重新走一遍（顯示完整步驟進度、上一步/下一步）。
// 'contact'：只從「聯絡方式」區塊的「🧙 用引導方式新增」按鈕進來，只顯示第 3 步，
//            不顯示步驟進度條，「完成」按鈕文案改成「新增這一項」，適合新手/長輩單純想加一項聯絡方式。
let wizardMode = 'full';

// 用正式的 14 個主題資料（window.UVACO_THEME_LIST，定義在 edit-chunk-4.js）畫出精靈第 4 步的主題選單，
// 讓精靈選的主題卡片跟正式「主題選擇器」的編號、名稱、顏色完全一致，不再各自維護一份清單。
function renderWizardThemeGrid() {
  const grid = document.getElementById('wizardThemeGrid');
  const list = window.UVACO_THEME_LIST;
  if (!grid || !Array.isArray(list)) return;

  grid.innerHTML = list.map(function (t) {
    const activeClass = (t.id === wizardSelectedTheme) ? ' active' : '';
    return '' +
      '<div class="wizard-theme-item' + activeClass + '" data-theme="' + t.id + '" onclick="wizardSelectTheme(' + t.id + ')">' +
        '<div class="wizard-theme-preview" style="background:' + t.bg + ';">' +
          '<div class="wizard-theme-preview-accent" style="background:' + t.accent + ';"></div>' +
        '</div>' +
        '<span class="lang-zh">' + t.nameZh + '</span>' +
        '<span class="lang-en">' + t.nameEn + '</span>' +
      '</div>';
  }).join('');
}

// 開啟精靈。
// options.mode：'full'（預設，完整 5 步驟）或 'contact'（只顯示「聯絡方式」單一步驟，給主頁面的
//   「🧙 用引導方式新增」按鈕使用，新增/修改內容跟完整精靈共用同一套 syncWizardToCard() 邏輯，
//   只是欄位留空的部分不會覆蓋既有資料，所以可以安全地只走這一步）。
// options.startStep：要直接停在哪一步（預設依 mode 決定：full→1、其他 mode→該功能對應的步驟）。
// options.prefill：是否要把目前名片已經填好的資料帶入精靈欄位（給「🧙 逐步設定」重新編輯情境用）。
function showWizard(options) {
  options = options || {};
  const modal = document.getElementById('wizardModal');
  if (!modal) return;

  wizardMode = options.mode || 'full';
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';

  // 預設反映目前名片實際套用的主題（例如使用者是回訪者重新叫出精靈時），而不是每次都重置回主題 1
  wizardSelectedTheme = parseInt(window.currentCardTheme || 1, 10) || 1;
  renderWizardThemeGrid();

  if (options.prefill && typeof prefillWizardFromCurrentCard === 'function') {
    prefillWizardFromCurrentCard();
  }

  const defaultStepByMode = { full: 1, contact: 3 };
  wizardCurrentStep = options.startStep || defaultStepByMode[wizardMode] || 1;
  updateWizardUI();
}

// 關閉精靈
function closeWizard() {
  const modal = document.getElementById('wizardModal');
  if (modal) {
    modal.classList.remove('show');
    document.body.style.overflow = '';
  }
  // 標記已完成 onboarding
  try { localStorage.setItem('UVACO_ONBOARDED', '1'); } catch (e) {}
}

// 更新精靈 UI
function updateWizardUI() {
  const isFullMode = (wizardMode === 'full');

  // 單步驟模式（例如「只新增聯絡方式」）不需要步驟進度條，避免長輩以為還有其他步驟沒做完
  const progress = document.querySelector('.wizard-progress');
  if (progress) progress.style.display = isFullMode ? '' : 'none';

  // 更新步驟進度指示器
  document.querySelectorAll('.wizard-progress-step').forEach(step => {
    const stepNum = parseInt(step.dataset.step);
    step.classList.remove('active', 'completed');
    if (stepNum < wizardCurrentStep) {
      step.classList.add('completed');
    } else if (stepNum === wizardCurrentStep) {
      step.classList.add('active');
    }
  });

  // 更新步驟內容
  document.querySelectorAll('.wizard-step').forEach(step => {
    const stepNum = parseInt(step.dataset.step);
    step.classList.remove('active');
    if (stepNum === wizardCurrentStep) {
      step.classList.add('active');
    }
  });

  // 更新導航按鈕
  const prevBtn = document.getElementById('wizardPrevBtn');
  const nextBtn = document.getElementById('wizardNextBtn');
  const finishBtn = document.getElementById('wizardFinishBtn');

  if (!isFullMode) {
    // 單步驟模式：不需要上一步/下一步，直接顯示「新增這一項」
    if (prevBtn) prevBtn.style.visibility = 'hidden';
    if (nextBtn) nextBtn.style.display = 'none';
    if (finishBtn) {
      finishBtn.style.display = 'block';
      const zh = finishBtn.querySelector('.lang-zh');
      const en = finishBtn.querySelector('.lang-en');
      if (zh) zh.textContent = '新增這一項';
      if (en) en.textContent = 'Add This';
    }
    return;
  }

  // 完整模式：把完成按鈕文案還原（避免上一次是單步驟模式，殘留「新增這一項」字樣）
  if (finishBtn) {
    const zh = finishBtn.querySelector('.lang-zh');
    const en = finishBtn.querySelector('.lang-en');
    if (zh) zh.textContent = '完成建立';
    if (en) en.textContent = 'Finish';
  }

  if (prevBtn) {
    prevBtn.style.visibility = wizardCurrentStep === 1 ? 'hidden' : 'visible';
  }

  if (nextBtn && finishBtn) {
    if (wizardCurrentStep === wizardTotalSteps) {
      nextBtn.style.display = 'none';
      finishBtn.style.display = 'block';
    } else {
      nextBtn.style.display = 'block';
      finishBtn.style.display = 'none';
    }
  }

  // 如果是最後一步，更新預覽
  if (wizardCurrentStep === wizardTotalSteps) {
    updateWizardPreview();
  }
}

// 下一步
function wizardNext() {
  if (wizardMode !== 'full') return; // 單步驟模式沒有上一步/下一步
  if (!validateWizardStep(wizardCurrentStep)) return;

  if (wizardCurrentStep < wizardTotalSteps) {
    wizardCurrentStep++;
    updateWizardUI();
  }
}

// 上一步
function wizardPrev() {
  if (wizardMode !== 'full') return;
  if (wizardCurrentStep > 1) {
    wizardCurrentStep--;
    updateWizardUI();
  }
}

// 驗證步驟
function validateWizardStep(step) {
  const zhElements = document.querySelectorAll('.lang-zh');
  const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';
  
  if (step === 1) {
    const nameZh = document.getElementById('wizardNameZh')?.value?.trim();
    if (!nameZh) {
      alert(currentLang === 'zh' ? '請填寫姓名' : 'Please enter your name');
      document.getElementById('wizardNameZh')?.focus();
      return false;
    }
  }
  
  // 其他步驟可選填，不強制驗證
  return true;
}

// 選擇頭像
function wizardSelectAvatar() {
  document.getElementById('wizardAvatarInput')?.click();
}

// 處理頭像上傳：跟主頁面「編輯頭像」共用同一套「先裁切、再壓縮」流程（image-crop.js／compressImageFile），
// 讓精靈裡上傳的頭像也能拖曳調整位置、縮放大小，而不是原本直接整張圖塞進去。
// 壓縮後的結果會存進 window.__uvacoPendingAssets.avatar，saveCard() 存檔時才會正確上傳到 Storage
// （改用 blob 網址預覽，不能再像原本那樣直接存一大串 base64 圖片資料到 profile_json 裡）。
async function wizardHandleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const croppedBlob = await openImageCropper(file, {
    shape: 'circle',
    titleZh: '調整頭像大小與位置', titleEn: 'Adjust Your Photo',
    aspectPresets: [{ labelZh: '1:1', labelEn: '1:1', ratio: 1 }]
  });
  if (!croppedBlob) return; // 使用者取消裁切

  try {
    const out = await compressImageFile(croppedBlob, { maxDim: 512, maxBytes: 1024 * 1024, mime: 'image/webp' });
    const url = URL.createObjectURL(out.blob);

    window.__uvacoPendingAssets = window.__uvacoPendingAssets || {};
    window.__uvacoPendingAssets.avatar = { blob: out.blob, contentType: out.contentType, ext: out.ext };

    const img = document.getElementById('wizardAvatarImg');
    const placeholder = document.getElementById('wizardAvatarPlaceholder');
    const overlay = document.querySelector('.wizard-avatar-overlay');
    if (img) {
      img.src = url;
      img.style.display = 'block';
    }
    if (placeholder) placeholder.style.display = 'none';
    if (overlay) overlay.style.display = 'flex';
  } catch (e) {
    const zhElements = document.querySelectorAll('.lang-zh');
    const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';
    alert(currentLang === 'zh' ? '圖片處理失敗，請換一張圖片再試一次。' : 'Image processing failed. Please try another photo.');
  }
}

// 選擇主題
function wizardSelectTheme(theme) {
  wizardSelectedTheme = theme;
  document.querySelectorAll('.wizard-theme-item').forEach(item => {
    item.classList.remove('active');
    if (parseInt(item.dataset.theme) === theme) {
      item.classList.add('active');
    }
  });
}

// 更新預覽
function updateWizardPreview() {
  const nameZh = document.getElementById('wizardNameZh')?.value?.trim() || '';
  const titleZh = document.getElementById('wizardTitleZh')?.value?.trim() || '';
  const phone = document.getElementById('wizardPhone')?.value?.trim();
  const line = document.getElementById('wizardLine')?.value?.trim();
  const email = document.getElementById('wizardEmail')?.value?.trim();
  const avatarSrc = document.getElementById('wizardAvatarImg')?.src;
  
  // 更新預覽卡片
  const previewName = document.getElementById('wizardPreviewName');
  const previewTitle = document.getElementById('wizardPreviewTitle');
  const previewAvatar = document.getElementById('wizardPreviewAvatar');
  const previewContacts = document.getElementById('wizardPreviewContacts');
  
  if (previewName) {
    previewName.textContent = nameZh || '（姓名）';
    previewName.style.color = nameZh ? '' : 'rgba(255,255,255,0.4)';
    previewName.style.fontStyle = nameZh ? '' : 'italic';
  }
  if (previewTitle) {
    previewTitle.textContent = titleZh || '（職稱）';
    previewTitle.style.color = titleZh ? '' : 'rgba(255,255,255,0.4)';
    previewTitle.style.fontStyle = titleZh ? '' : 'italic';
  }
  const previewAvatarPlaceholder = document.getElementById('wizardPreviewAvatarPlaceholder');
  if (previewAvatar && avatarSrc && avatarSrc !== window.location.href && !avatarSrc.endsWith('/')) {
    previewAvatar.src = avatarSrc;
    previewAvatar.style.display = 'block';
    if (previewAvatarPlaceholder) previewAvatarPlaceholder.style.display = 'none';
  } else {
    if (previewAvatar) previewAvatar.style.display = 'none';
    if (previewAvatarPlaceholder) previewAvatarPlaceholder.style.display = 'flex';
  }
  
  if (previewContacts) {
    let contactsHtml = '';
    if (phone) contactsHtml += '<span class="wizard-preview-contact-tag">📞 電話</span>';
    if (line) contactsHtml += '<span class="wizard-preview-contact-tag">💬 LINE</span>';
    if (email) contactsHtml += '<span class="wizard-preview-contact-tag">✉️ Email</span>';
    previewContacts.innerHTML = contactsHtml || '<span class="wizard-preview-contact-tag">尚未設定聯絡方式</span>';
  }
}

// 完成精靈
async function finishWizard() {
  const mode = wizardMode;

  // 同步資料到名片編輯區
  syncWizardToCard();

  // 關閉精靈
  closeWizard();

  // 顯示成功訊息（白話文彈窗，取代原生 alert），文案依模式而不同
  if (typeof showSaveFeedback === 'function') {
    if (mode === 'full') {
      await showSaveFeedback('success', {
        titleZh: '名片建立成功！', titleEn: 'Card Created!',
        msgZh: '您可以繼續編輯，或是直接點擊右上角「儲存」。',
        msgEn: 'You can keep editing, or click "Save" at the top right.'
      });
    } else {
      await showSaveFeedback('success', {
        titleZh: '已新增完成', titleEn: 'Added',
        msgZh: '記得點擊右上角「儲存」，這項資料才會真正存起來喔。',
        msgEn: 'Remember to click "Save" at the top right so this is actually saved.'
      });
    }
  }
}

// 同步精靈資料到名片
function syncWizardToCard() {
  const nameZh = document.getElementById('wizardNameZh')?.value?.trim();
  const titleZh = document.getElementById('wizardTitleZh')?.value?.trim();
  const titleEn = document.getElementById('wizardTitleEn')?.value?.trim();
  const phone = document.getElementById('wizardPhone')?.value?.trim();
  const line = document.getElementById('wizardLine')?.value?.trim();
  const email = document.getElementById('wizardEmail')?.value?.trim();
  const avatarSrc = document.getElementById('wizardAvatarImg')?.src;
  
  // 更新姓名
  const previewNameZh = document.getElementById('previewNameZh');
  if (previewNameZh && nameZh) {
    previewNameZh.innerHTML = nameZh;
  }
  
  // 更新職稱
  const previewTitleZh = document.getElementById('previewTitleZh');
  const previewTitleEn = document.getElementById('previewTitleEn');
  if (previewTitleZh && titleZh) previewTitleZh.textContent = titleZh;
  if (previewTitleEn && titleEn) previewTitleEn.textContent = titleEn;
  
  // 更新頭像
  if (avatarSrc && avatarSrc !== window.location.href && !avatarSrc.endsWith('/')) {
    const previewAvatar = document.getElementById('previewAvatar');
    const avatarPlaceholder = document.getElementById('avatarPlaceholder');
    if (previewAvatar) {
      previewAvatar.src = avatarSrc;
      previewAvatar.style.display = 'block';
    }
    if (avatarPlaceholder) avatarPlaceholder.style.display = 'none';
  }
  
  // 更新主題：改呼叫真正存在、會實際套用畫面顏色的 applyCardThemeVisual()。
  // 舊版這裡呼叫的 setCardTheme() 整個專案根本沒有定義，因為外面包了 typeof 判斷，
  // 會靜默失敗——精靈選的主題完成後其實從來沒套用到名片，使用者也不會看到任何錯誤。
  if (wizardSelectedTheme && typeof applyCardThemeVisual === 'function') {
    applyCardThemeVisual(wizardSelectedTheme);
  }
  
  // 添加聯絡方式
  const contacts = document.getElementById('previewContacts');
  if (contacts) {
    // 電話
    if (phone) {
      const phoneLink = 'tel:' + phone.replace(/-/g, '');
      const phoneBtn = contacts.querySelector('a[href^="tel:"]');
      if (phoneBtn) {
        phoneBtn.href = phoneLink;
      } else {
        addContactButtonToPreview('call', phoneLink, '<img src="phone-icon.svg" alt="Phone" class="btn-icon-phone"> 立即來電', '<img src="phone-icon.svg" alt="Phone" class="btn-icon-phone"> Call Now');
      }
    }
    
    // LINE
    if (line) {
      let lineLink = line;
      // 如果沒有 http 開頭，嘗試補全
      if (!lineLink.startsWith('http')) {
        lineLink = 'https://line.me/ti/p/' + line;
      }
      const lineBtn = contacts.querySelector('a[href*="line.me"]');
      if (lineBtn) {
        lineBtn.href = lineLink;
      } else {
        addContactButtonToPreview('line', lineLink, '<img src="line-logo.svg" alt="LINE" class="btn-icon-line"> LINE', '<img src="line-logo.svg" alt="LINE" class="btn-icon-line"> LINE');
      }
    }
    
    // Email
    if (email) {
      const emailLink = 'mailto:' + email;
      const emailBtn = contacts.querySelector('a[href^="mailto:"]');
      if (emailBtn) {
        emailBtn.href = emailLink;
      } else {
        addContactButtonToPreview('email', emailLink, '<img src="email-icon.svg" alt="Email" class="btn-icon-email"> 寄送 Email', '<img src="email-icon.svg" alt="Email" class="btn-icon-email"> Send Email');
      }
    }
  }
}

// 讓「二次編輯」情境（使用者點頂部「🧙 逐步設定」重新叫出精靈）能先帶入名片目前已有的資料，
// 而不是每次都顯示空白欄位，害已經填過資料的使用者誤以為要整份重填一次。
function prefillWizardFromCurrentCard() {
  const nameZhEl = document.getElementById('previewNameZh');
  const titleZhEl = document.getElementById('previewTitleZh');
  const titleEnEl = document.getElementById('previewTitleEn');
  const avatarEl = document.getElementById('previewAvatar');

  const wizardNameZhInput = document.getElementById('wizardNameZh');
  const wizardTitleZhInput = document.getElementById('wizardTitleZh');
  const wizardTitleEnInput = document.getElementById('wizardTitleEn');
  const wizardAvatarImg = document.getElementById('wizardAvatarImg');
  const wizardAvatarPlaceholder = document.getElementById('wizardAvatarPlaceholder');

  if (wizardNameZhInput) wizardNameZhInput.value = String(nameZhEl?.textContent || '').trim();
  if (wizardTitleZhInput) wizardTitleZhInput.value = String(titleZhEl?.textContent || '').trim();
  if (wizardTitleEnInput) wizardTitleEnInput.value = String(titleEnEl?.textContent || '').trim();

  const avatarSrc = avatarEl?.getAttribute('src') || '';
  if (wizardAvatarImg && avatarSrc && avatarEl.style.display !== 'none') {
    wizardAvatarImg.src = avatarSrc;
    wizardAvatarImg.style.display = 'block';
    if (wizardAvatarPlaceholder) wizardAvatarPlaceholder.style.display = 'none';
  }

  // 聯絡方式：從既有的聯絡按鈕連結還原電話/LINE/Email
  const contacts = document.getElementById('previewContacts');
  const wizardPhoneInput = document.getElementById('wizardPhone');
  const wizardLineInput = document.getElementById('wizardLine');
  const wizardEmailInput = document.getElementById('wizardEmail');
  if (contacts) {
    const phoneBtn = contacts.querySelector('a[href^="tel:"]');
    if (phoneBtn && wizardPhoneInput) wizardPhoneInput.value = (phoneBtn.getAttribute('href') || '').replace('tel:', '');

    const lineBtn = contacts.querySelector('a[href*="line.me"]');
    if (lineBtn && wizardLineInput) wizardLineInput.value = lineBtn.getAttribute('href') || '';

    const emailBtn = contacts.querySelector('a[href^="mailto:"]');
    if (emailBtn && wizardEmailInput) wizardEmailInput.value = (emailBtn.getAttribute('href') || '').replace('mailto:', '');
  }
}

// 修改 startOnboardingGuide 函數，改為啟動步驟精靈
const originalStartOnboardingGuide = typeof startOnboardingGuide === 'function' ? startOnboardingGuide : null;
function startOnboardingGuide() {
  // 關閉原有的 onboarding modal
  closeOnboarding();
  // 開啟步驟精靈
  showWizard();
}

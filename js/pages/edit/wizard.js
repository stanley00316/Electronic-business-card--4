<script>
// ===== 步驟引導精靈 JavaScript =====
let wizardCurrentStep = 1;
const wizardTotalSteps = 5;
let wizardSelectedTheme = 1;

// 開啟精靈
function showWizard() {
  const modal = document.getElementById('wizardModal');
  if (modal) {
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    wizardCurrentStep = 1;
    updateWizardUI();
  }
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
  if (!validateWizardStep(wizardCurrentStep)) return;
  
  if (wizardCurrentStep < wizardTotalSteps) {
    wizardCurrentStep++;
    updateWizardUI();
  }
}

// 上一步
function wizardPrev() {
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

// 處理頭像上傳
function wizardHandleAvatarUpload(event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = document.getElementById('wizardAvatarImg');
      const placeholder = document.getElementById('wizardAvatarPlaceholder');
      const overlay = document.querySelector('.wizard-avatar-overlay');
      if (img) {
        img.src = e.target.result;
        img.style.display = 'block';
      }
      if (placeholder) placeholder.style.display = 'none';
      if (overlay) overlay.style.display = 'flex';
    };
    reader.readAsDataURL(file);
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
function finishWizard() {
  // 同步資料到名片編輯區
  syncWizardToCard();
  
  // 關閉精靈
  closeWizard();
  
  // 顯示成功訊息
  const zhElements = document.querySelectorAll('.lang-zh');
  const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';
  
  alert(currentLang === 'zh' ? 
    '名片建立成功！您可以繼續編輯或直接儲存。' : 
    'Card created! You can continue editing or save directly.');
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
  
  // 更新主題
  if (wizardSelectedTheme && typeof setCardTheme === 'function') {
    setCardTheme(wizardSelectedTheme);
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

// 修改 startOnboardingGuide 函數，改為啟動步驟精靈
const originalStartOnboardingGuide = typeof startOnboardingGuide === 'function' ? startOnboardingGuide : null;
function startOnboardingGuide() {
  // 關閉原有的 onboarding modal
  closeOnboarding();
  // 開啟步驟精靈
  showWizard();
}

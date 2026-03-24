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

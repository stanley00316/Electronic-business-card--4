// 編輯頁主邏輯：公司資訊、地址、主題、地圖與清理工具。
function getPreviewContactButtonsByHref(currentLink) {
  return Array.from(document.querySelectorAll('#previewContacts a[href]'))
    .filter(btn => String(btn.getAttribute('href') || '') === String(currentLink || ''));
}

function decorateContactButton(btn, type, link) {
  if (!btn) return;
  btn.setAttribute('href', link);
  btn.dataset.contactType = type || '';
  if (type === 'wechat') {
    const wechatId = (typeof getWeChatIdFromLink === 'function') ? getWeChatIdFromLink(link) : '';
    if (wechatId) btn.dataset.wechatId = wechatId;
  } else {
    delete btn.dataset.wechatId;
  }

  const opensExternal = ['website', 'line', 'official-line', 'facebook', 'instagram', 'linkedin', 'twitter', 'youtube', 'wechat', 'whatsapp'].includes(type);
  if (opensExternal) {
    btn.target = '_blank';
    btn.rel = 'noopener';
  } else {
    btn.removeAttribute('target');
    btn.removeAttribute('rel');
  }
}

function updateContactButtons(type, currentLink, newLink) {
  // 更新所有相關的按鈕連結（中文和英文）
  const buttons = getPreviewContactButtonsByHref(currentLink);
  buttons.forEach(btn => {
    decorateContactButton(btn, type, newLink);
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

// 正式 14 個主題的名稱與代表色，給「主題選擇器」跟「新手精靈選主題」共用同一份資料，
// 避免兩邊各自維護一份清單，導致精靈選的主題編號/顏色跟正式主題對不起來。
// bg/accent 直接對應 edit-head.css 裡 .theme-card-preview[data-theme="N"] 的實際配色。
window.UVACO_THEME_LIST = [
  { id: 1,  nameZh: '深色主題',          nameEn: 'Dark Theme',                bg: '#050608',  accent: 'var(--uvaco-green, #00c853)' },
  { id: 2,  nameZh: '淺色主題',          nameEn: 'Light Theme',               bg: '#f3f4f6',  accent: 'var(--uvaco-green, #00c853)' },
  { id: 3,  nameZh: '藍色主題',          nameEn: 'Blue Theme',                bg: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #3b82f6 100%)', accent: '#60a5fa' },
  { id: 4,  nameZh: '金色主題',          nameEn: 'Gold Theme',                bg: 'linear-gradient(135deg, #b45309 0%, #d97706 50%, #f59e0b 100%)', accent: '#fbbf24' },
  { id: 5,  nameZh: '紫色主題',          nameEn: 'Purple Theme',              bg: 'linear-gradient(135deg, #581c87 0%, #7c3aed 50%, #9333ea 100%)', accent: '#a78bfa' },
  { id: 6,  nameZh: '深黑藍（經典藍）',   nameEn: 'Deep Black + Classic Blue', bg: '#000000',  accent: '#0033A0' },
  { id: 7,  nameZh: '白底藍（經典藍）',   nameEn: 'White + Classic Blue',      bg: '#ffffff',  accent: '#0033A0' },
  { id: 8,  nameZh: '深黑青綠（青綠）',   nameEn: 'Deep Black + Teal',         bg: '#000000',  accent: '#00B7A9' },
  { id: 9,  nameZh: '白底青綠（青綠）',   nameEn: 'White + Teal',              bg: '#ffffff',  accent: '#00B7A9' },
  { id: 10, nameZh: '烈焰緋紅',          nameEn: 'Fire Red',                  bg: '#000000',  accent: '#DC2626' },
  { id: 11, nameZh: '奶茶桃粉',          nameEn: 'Magenta Pink',              bg: '#FAF1E6',  accent: '#DB2777' },
  { id: 12, nameZh: '琥珀橙焰',          nameEn: 'Vivid Orange',              bg: '#000000',  accent: '#F97316' },
  { id: 13, nameZh: '極簡銀霜',          nameEn: 'Minimal Silver',            bg: '#131315',  accent: '#D1D5DB' },
  { id: 14, nameZh: '萊姆電光',          nameEn: 'Electric Lime',             bg: '#000000',  accent: '#A3E635' }
];

// 套用「卡片主題」的視覺樣式（previewCard + 整頁背景/頂部欄/底部欄明暗）。
// 這是唯一真正會改變畫面顏色的地方，不管主題是「使用者剛選的」還是「重新整理後從資料庫讀回的」，
// 都要呼叫這個函式才會生效，避免之前那種「資料庫讀到了，但畫面忘了套用」的不一致。
function applyCardThemeVisual(themeNumber) {
  const n = parseInt(themeNumber, 10);
  if (!(n >= 1 && n <= 14)) return;

  // 同步「儲存時真正會送出的主題值」，避免使用者點選新主題後，
  // saveCard() 讀到的還是打開編輯頁當下、資料庫載入時的舊主題
  window.currentCardTheme = n;

  // 直接操作 DOM 更新卡片預覽主題
  const card = document.getElementById('previewCard');
  if (card) {
    card.classList.remove('card-theme-1', 'card-theme-2', 'card-theme-3', 'card-theme-4', 'card-theme-5', 'card-theme-6', 'card-theme-7', 'card-theme-8', 'card-theme-9', 'card-theme-10', 'card-theme-11', 'card-theme-12', 'card-theme-13', 'card-theme-14');
    card.classList.add('card-theme-' + n);
  }

  // 在編輯頁：卡片主題需要「完整預覽」整體版面
  // - 使用 styles.css 內建的 body.card-theme-*（整頁背景/頂部欄/底部欄）
  // - 同時保留 theme-dark/theme-light（讓 edit.html 既有的模態框/按鈕樣式規則生效）
  // - 移除 common.js 的 body.theme-1~14（避免兩套主題互相覆蓋造成「切不完整」）
  document.body.classList.remove('theme-1', 'theme-2', 'theme-3', 'theme-4', 'theme-5', 'theme-6', 'theme-7', 'theme-8', 'theme-9', 'theme-10', 'theme-11', 'theme-12', 'theme-13', 'theme-14');
  document.body.classList.remove('card-theme-1', 'card-theme-2', 'card-theme-3', 'card-theme-4', 'card-theme-5', 'card-theme-6', 'card-theme-7', 'card-theme-8', 'card-theme-9', 'card-theme-10', 'card-theme-11', 'card-theme-12', 'card-theme-13', 'card-theme-14');
  document.body.classList.add('card-theme-' + n);
  document.body.classList.remove('theme-dark', 'theme-light');
  document.body.classList.add((n === 2 || n === 7 || n === 9 || n === 11) ? 'theme-light' : 'theme-dark');

  // 儲存到 localStorage，同步全域主題（yuyuko.html / 其他頁面由 common.js 讀取 localStorage.theme）
  try {
    localStorage.setItem('cardTheme', n);
    localStorage.setItem('theme', String(n));
  } catch (e) {}

  // 更新主題選擇器裡的 active 狀態（選擇器當下不一定已開啟，函式內部會自行判斷）
  if (typeof updateThemePreviewActive === 'function') {
    try { updateThemePreviewActive(n); } catch (e) {}
  }
}
window.applyCardThemeVisual = applyCardThemeVisual;

// 選擇卡片主題（使用者在主題選擇器裡點擊時呼叫）
function selectCardTheme(themeNumber) {
  console.log('Selecting card theme:', themeNumber);
  applyCardThemeVisual(themeNumber);

  // 延遲關閉模態框，讓用戶看到選中的效果
  setTimeout(function() {
    closeThemeSelector({ target: document.getElementById('themeSelectorOverlay') });
  }, 500);
}

// 初始化卡片主題：在真正的名片資料（資料庫）還沒載入完成前，先用上次本機記住的主題暫時顯示，
// 避免畫面閃一下預設色。等 loadCardToUI() 拿到資料庫資料後，會用 applyCardThemeVisual() 蓋成正式值，
// 真正的主題一律以資料庫為準，這裡只是「載入中」的暫時畫面。
function initCardTheme() {
  console.log('Initializing card theme...');

  const savedTheme = localStorage.getItem('cardTheme');
  if (savedTheme) {
    console.log('Saved theme (暫時值，待資料庫資料載入後會覆蓋):', savedTheme);
    applyCardThemeVisual(savedTheme);
    // 延遲更新 active 狀態，確保 modal DOM 已載入
    setTimeout(function() {
      updateThemePreviewActive(parseInt(savedTheme, 10));
    }, 200);
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
  decorateContactButton(btnZh, type, newLink);
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
  decorateContactButton(btnEn, type, newLink);
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
  if (typeof event !== 'undefined' && event) event.stopPropagation();
  const zhElements = document.querySelectorAll('.lang-zh');
  const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';
  const confirmMsg = currentLang === 'zh' ? '確定要刪除此聯絡方式嗎？' : 'Are you sure you want to delete this contact method?';

  if (confirm(confirmMsg)) {
    // 找到對應的包裝器並刪除（包含中文和英文按鈕）
    const wrapper = contactBtn.closest('.contact-btn-wrapper');
    if (wrapper) {
      wrapper.remove();
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

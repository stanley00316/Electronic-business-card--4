const UVACO_QRCODE_SCRIPT = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
let __uvacoQrLibPromise = null;
function loadQRCodeScript() {
  if (typeof QRCode !== 'undefined') return Promise.resolve();
  if (__uvacoQrLibPromise) return __uvacoQrLibPromise;
  __uvacoQrLibPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = UVACO_QRCODE_SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('QRCode script failed'));
    document.head.appendChild(s);
  });
  return __uvacoQrLibPromise;
}

// 返回上一頁
function goBack() {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = 'directory.html';
  }
}

// 前往「我的名片」頁面
async function gotoMyCard(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  try {
    if (!window.UVACO_CLOUD || !UVACO_CLOUD.hasConfig()) {
      window.location.href = 'auth.html?next=directory.html';
      return false;
    }
    const s = await UVACO_CLOUD.getSession();
    const uid = s && s.session && s.session.user ? String(s.session.user.id || '').trim() : '';
    if (!uid) {
      window.location.href = 'auth.html?next=directory.html';
      return false;
    }
    window.location.href = 'card.html?id=' + encodeURIComponent(uid);
    return false;
  } catch (e) {
    window.location.href = 'auth.html?next=directory.html';
    return false;
  }
}

function safeText(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

// 系統佔位文字過濾 - 過濾被誤存的系統提示文字
function filterSystemText(text) {
  if (!text) return text;
  const systemPatterns = [
    '如需更改請聯絡管理員',
    '公司已鎖定',
    '公司：必選下拉',
    '可輸入關鍵字快速帶入',
    '請輸入內容',
    'Enter content'
  ];
  for (const pattern of systemPatterns) {
    if (text.includes(pattern)) return '';
  }
  return text;
}

// 過濾 HTML 中的系統佔位文字
function filterSystemHtml(html) {
  if (!html) return html;
  const systemPatterns = [
    '如需更改請聯絡管理員',
    '公司已鎖定',
    '公司：必選下拉',
    '可輸入關鍵字快速帶入',
    '請輸入內容',
    'Enter content'
  ];
  // 建立 DOM 來處理 HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;
  // 移除包含系統文字的元素
  temp.querySelectorAll('*').forEach(el => {
    const text = el.textContent || '';
    for (const pattern of systemPatterns) {
      if (text.includes(pattern)) {
        el.remove();
        return;
      }
    }
  });
  return temp.innerHTML;
}

function renderBilingualName(htmlTargetId, raw) {
  const el = document.getElementById(htmlTargetId);
  if (!el) return;
  const s = safeText(raw);
  if (!s) { el.textContent = '-'; return; }
  // 支援：
  // - 「左｜右」→ 英文換到下一列
  // - 「中文（英文）」/「中文(英文)」→ 英文換到下一列
  const parts = s.split(/\s*｜\s*/);
  if (parts.length >= 2) {
    const left = parts[0] || '';
    const right = parts.slice(1).join(' ｜ ');
    el.innerHTML = `${left}<span class="en">${right}</span>`;
    return;
  }
  const m = s.match(/^(.+?)\s*[（(]\s*([^)）]+)\s*[)）]\s*$/);
  if (m) {
    el.innerHTML = `${m[1].trim()}<span class="en">${m[2].trim()}</span>`;
    return;
  }
  el.textContent = s;
}

async function applyAssets(pj) {
  try {
    if (pj.logoPath) {
      const u = await UVACO_CLOUD.getSignedAssetUrl(String(pj.logoPath), { bucket: 'card-assets', expiresIn: 3600 });
      if (u && u.url) document.getElementById('viewerLogo')?.setAttribute('src', u.url);
    } else if (pj.logoSrc) {
      document.getElementById('viewerLogo')?.setAttribute('src', String(pj.logoSrc));
    }
  } catch (e) {}

  try {
    if (pj.avatarPath) {
      const u = await UVACO_CLOUD.getSignedAssetUrl(String(pj.avatarPath), { bucket: 'card-assets', expiresIn: 3600 });
      if (u && u.url) document.getElementById('viewerAvatar')?.setAttribute('src', u.url);
    } else if (pj.avatarSrc) {
      document.getElementById('viewerAvatar')?.setAttribute('src', String(pj.avatarSrc));
    }
  } catch (e) {}
}

function applyCompanyInfo(pj) {
  const section = document.getElementById('companyInfoSection');
  if (!section) return;
  let html = String(pj.companyInfoHtml || '').trim();
  if (!html) {
    section.style.display = 'none';
    return;
  }
  // 過濾系統佔位文字
  html = filterSystemHtml(html);
  if (!html.trim()) {
    section.style.display = 'none';
    return;
  }
  section.innerHTML = html;
  // 展示頁：移除編輯用按鈕（例如「+ 新增公司資訊」）
  try {
    section.querySelectorAll('.edit-add-btn').forEach(btn => btn.remove());
    // 順便移除任何 contenteditable/onclick（避免在展示頁仍可點擊編輯）
    section.querySelectorAll('[contenteditable="true"]').forEach(el => el.removeAttribute('contenteditable'));
    section.querySelectorAll('.edit-clickable').forEach(el => el.removeAttribute('onclick'));
  } catch (e) {}
  section.style.display = 'block';
}

function applyContacts(pj, card) {
  const group = document.getElementById('viewerContacts');
  if (!group) return;
  group.innerHTML = '';
  
  let html = String(pj.contactsHtml || '').trim();
  if (html) {
    // 過濾系統佔位文字
    html = filterSystemHtml(html);
    group.innerHTML = html;
    // 展示頁：移除編輯用的刪除按鈕（避免把 edit.html 的 UI 帶到 card.html）
    try {
      group.querySelectorAll('.contact-delete-btn').forEach(btn => btn.remove());
      // 展示頁：移除編輯用按鈕（例如「+ 新增聯絡方式」）
      group.querySelectorAll('.edit-add-btn').forEach(btn => btn.remove());
      // 移除 contenteditable/onclick
      group.querySelectorAll('[contenteditable="true"]').forEach(el => el.removeAttribute('contenteditable'));
      group.querySelectorAll('.edit-clickable').forEach(el => el.removeAttribute('onclick'));
    } catch (e) {}
  } else {
    // fallback：只用 phone/email
    const phone = safeText(card.phone);
    const email = safeText(card.email);

    if (phone) {
      group.insertAdjacentHTML('beforeend', `
        <a class="btn btn-primary lang-zh" href="tel:${phone}">
          <img src="phone-icon.svg" alt="Phone" class="btn-icon-phone"> 立即來電
        </a>
        <a class="btn btn-primary lang-en" href="tel:${phone}">
          <img src="phone-icon.svg" alt="Phone" class="btn-icon-phone"> Call Now
        </a>
      `);
    }

    if (email) {
      group.insertAdjacentHTML('beforeend', `
        <a class="btn btn-secondary lang-zh" href="mailto:${email}">
          <img src="email-icon.svg" alt="Email" class="btn-icon-email"> 寄送 Email
        </a>
        <a class="btn btn-secondary lang-en" href="mailto:${email}">
          <img src="email-icon.svg" alt="Email" class="btn-icon-email"> Send Email
        </a>
      `);
    }
  }

  // 版型（grid/list）
  try {
    const layout = String(pj.contactLayout || '').toLowerCase() === 'grid' ? 'grid' : 'list';
    group.classList.toggle('contact-layout-grid', layout === 'grid');
  } catch (e) {}
}

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

document.addEventListener('DOMContentLoaded', function () {
  (async function () {
    const params = new URLSearchParams(window.location.search || '');
    let userId = params.get('id');
    const nfcCardId = params.get('nfc');
    
    if (!window.UVACO_CLOUD || !UVACO_CLOUD.hasConfig()) {
      alert('尚未設定 Supabase（請先設定 cloud.js）');
      return;
    }
    
    // 如果是 NFC 卡片連結，先查詢對應的用戶 ID
    if (nfcCardId && !userId) {
      try {
        const nfcRes = await UVACO_CLOUD.getCardByNfcId(nfcCardId);
        if (nfcRes?.card?.user_id) {
          userId = nfcRes.card.user_id;
          // 更新 URL（不重新載入頁面）
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.set('id', userId);
          newUrl.searchParams.delete('nfc');
          window.history.replaceState({}, '', newUrl);
        } else {
          alert('此 NFC 卡片尚未綁定用戶');
          return;
        }
      } catch (e) {
        console.error('NFC 查詢失敗:', e);
        alert('NFC 卡片查詢失敗');
        return;
      }
    }
    
    if (!userId) {
      alert('網址無效（缺少 id）');
      return;
    }

    let ownerTheme = 1;
    try {
      const res = await UVACO_CLOUD.getCardPublic(userId, { trackView: true });
      const card = res?.card || null;
      if (!card) {
        alert('找不到名片資料');
        return;
      }

      ownerTheme = parseInt(card.theme || 1, 10) || 1;

      let pj = card.profile_json;
      if (typeof pj === 'string') {
        try { pj = JSON.parse(pj); } catch (e) { pj = null; }
      }
      pj = (pj && typeof pj === 'object') ? pj : {};
  
      const nameZh = (pj.nameZh !== undefined) ? safeText(pj.nameZh) : safeText(card.name);
      const nameEn = (pj.nameEn !== undefined) ? safeText(pj.nameEn) : safeText(card.name);
      const titleZh = (pj.titleZh !== undefined) ? safeText(pj.titleZh) : safeText(card.title);
      const titleEn = (pj.titleEn !== undefined) ? safeText(pj.titleEn) : safeText(card.title);
      const companyZh = (pj.companyZh !== undefined) ? safeText(pj.companyZh) : safeText(card.company);
      const companyEn = (pj.companyEn !== undefined) ? safeText(pj.companyEn) : safeText(card.company);

      renderBilingualName('viewerNameZh', nameZh);
      renderBilingualName('viewerNameEn', nameEn);
      document.getElementById('viewerTitleZh').textContent = titleZh || '-';
      document.getElementById('viewerTitleEn').textContent = titleEn || '-';
      document.getElementById('viewerCompanyStrongZh').textContent = companyZh || '-';
      document.getElementById('viewerCompanyStrongEn').textContent = companyEn || '-';
      
      // 套用字體樣式
      if (pj.fontStyles) {
        const applyFontStyle = (elementId, styleObj, isName) => {
          const el = document.getElementById(elementId);
          if (!el || !styleObj) return;
          
          const sizeMap = isName ? {
            'small': '18px', 'medium': '24px', 'large': '32px'
          } : {
            'small': '12px', 'medium': '16px', 'large': '20px'
          };
          
          if (styleObj.size && sizeMap[styleObj.size]) {
            el.style.fontSize = sizeMap[styleObj.size];
          }
          if (styleObj.weight) {
            el.style.fontWeight = styleObj.weight === 'bold' ? '700' : '400';
          }
          if (styleObj.color) {
            el.style.color = styleObj.color;
          }
        };
        
        applyFontStyle('viewerNameZh', pj.fontStyles.name, true);
        applyFontStyle('viewerNameEn', pj.fontStyles.name, true);
        applyFontStyle('viewerTitleZh', pj.fontStyles.titleZh, false);
        applyFontStyle('viewerTitleEn', pj.fontStyles.titleEn, false);
      }

      // 恢復自定義標語（若有）- 過濾系統佔位文字
      if (pj.slogansZhHtml) {
        const container = document.getElementById('viewerSlogansZh');
        if (container) {
          container.innerHTML = filterSystemHtml(pj.slogansZhHtml);
          // 清除編輯模式可能帶來的屬性
          container.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
          container.querySelectorAll('.slogan-delete-btn').forEach(el => el.remove());
          container.querySelectorAll('.edit-clickable').forEach(el => el.classList.remove('edit-clickable'));
        }
      }
      if (pj.slogansEnHtml) {
        const container = document.getElementById('viewerSlogansEn');
        if (container) {
          container.innerHTML = filterSystemHtml(pj.slogansEnHtml);
          container.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
          container.querySelectorAll('.slogan-delete-btn').forEach(el => el.remove());
          container.querySelectorAll('.edit-clickable').forEach(el => el.classList.remove('edit-clickable'));
        }
      }

      await applyAssets(pj);
      applyCompanyInfo(pj);
      applyContacts(pj, card);
    } catch (e) {
      console.error(e);
      alert('載入失敗，請稍後再試');
    } finally {
      // 套用「觀看者背景主題」+「名片主題」的規則（與 yuyuko.html 一致）
      if (typeof initViewerPage === 'function') {
        initViewerPage(ownerTheme);
      } else if (typeof setTheme === 'function') {
        setTheme(ownerTheme);
}
    }
  })();
});

function shareMyCard() {
  const url = window.location.href;
  const title = document.title;
  const text = '這是我的電子名片，請惠賜指教！';

  if (navigator.share) {
    navigator.share({
      title: title,
      text: text,
      url: url,
    })
    .catch((error) => console.log('Error sharing', error));
  } else {
    // Fallback for browsers that don't support Web Share API
    copyCardLink();
  }
}

// 複製名片連結
function copyCardLink() {
  const url = window.location.href;
  const lang = localStorage.getItem('lang') || 'zh';
  
  navigator.clipboard.writeText(url).then(function() {
    // 顯示成功提示
    showCopyToast(lang === 'zh' ? '連結已複製！' : 'Link copied!');
  }, function(err) {
    console.error('Could not copy text: ', err);
    prompt(lang === 'zh' ? '請手動複製連結：' : 'Please copy manually:', url);
  });
}

// 顯示複製成功提示
function showCopyToast(message) {
  // 移除舊的 toast
  const oldToast = document.getElementById('copyToast');
  if (oldToast) oldToast.remove();
  
  // 建立新的 toast
  const toast = document.createElement('div');
  toast.id = 'copyToast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--uvaco-green, #22c55e);
    color: white;
    padding: 12px 24px;
    border-radius: 24px;
    font-size: 14px;
    font-weight: 600;
    z-index: 9999;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    animation: toastFadeIn 0.3s ease;
  `;
  document.body.appendChild(toast);
  
  // 2 秒後移除
  setTimeout(() => {
    toast.style.animation = 'toastFadeOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// 社群分享功能
function getShareInfo() {
  const url = window.location.href;
  const nameEl = document.getElementById('viewerNameZh');
  const name = nameEl?.textContent?.trim() || '數位名片';
  const lang = localStorage.getItem('lang') || 'zh';
  const text = lang === 'zh' 
    ? `${name} 的數位名片，歡迎交流！` 
    : `${name}'s Digital Business Card`;
  return { url, name, text };
}

// 分享到 LINE
function shareToLine() {
  const { url, text } = getShareInfo();
  const lineUrl = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  window.open(lineUrl, '_blank', 'width=600,height=500');
}

// 分享到 Facebook
function shareToFacebook() {
  const { url } = getShareInfo();
  const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  window.open(fbUrl, '_blank', 'width=600,height=500');
}

// 分享到 Twitter/X
function shareToTwitter() {
  const { url, text } = getShareInfo();
  const twitterUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  window.open(twitterUrl, '_blank', 'width=600,height=500');
}

// 分享到 Email
function shareToEmail() {
  const { url, text, name } = getShareInfo();
  const lang = localStorage.getItem('lang') || 'zh';
  const subject = lang === 'zh' ? `${name} 的數位名片` : `${name}'s Digital Business Card`;
  const body = `${text}\n\n${url}`;
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// QR Code 功能
let qrCodeInstance = null;

async function showQRCode() {
  try {
    await loadQRCodeScript();
  } catch (e) {
    console.error(e);
    alert('QR Code 函式庫載入失敗');
    return;
  }
  const modal = document.getElementById('qrModal');
  const qrcodeContainer = document.getElementById('qrcode');
  const url = window.location.href;
  
  // 清除舊的 QR Code
  qrcodeContainer.innerHTML = '';
  
  // 生成新的 QR Code
  qrCodeInstance = new QRCode(qrcodeContainer, {
    text: url,
    width: 220,
    height: 220,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });
  
  modal.style.display = 'flex';
}

function closeQRModal() {
  document.getElementById('qrModal').style.display = 'none';
}

function downloadQRCode() {
  const qrcodeContainer = document.getElementById('qrcode');
  const canvas = qrcodeContainer.querySelector('canvas');
  const nameEl = document.getElementById('viewerNameZh');
  const cardName = nameEl?.textContent || '名片';
  
  if (canvas) {
    // 創建一個新的 canvas 來添加邊距和背景
    const newCanvas = document.createElement('canvas');
    const padding = 40;
    newCanvas.width = canvas.width + padding * 2;
    newCanvas.height = canvas.height + padding * 2;
    
    const ctx = newCanvas.getContext('2d');
    // 白色背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, newCanvas.width, newCanvas.height);
    // 繪製 QR Code
    ctx.drawImage(canvas, padding, padding);
    
    const link = document.createElement('a');
    link.download = `${cardName}_QRCode.png`;
    link.href = newCanvas.toDataURL('image/png');
    link.click();
  } else {
    // 如果是 img 元素
    const img = qrcodeContainer.querySelector('img');
    if (img) {
      const link = document.createElement('a');
      link.download = `${cardName}_QRCode.png`;
      link.href = img.src;
      link.click();
    }
  }
}

// ===== 加入主畫面提示功能 =====

// 檢查是否應該顯示提示
function shouldShowAddHomeBanner() {
  // 已經關閉過，不再顯示
  if (localStorage.getItem('addHomeBannerDismissed') === 'true') {
    return false;
  }
  
  // 已經是 PWA 模式（已加入主畫面），不顯示
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
    return false;
  }
  
  return true;
}

// 檢查是否為自己的名片並顯示提示
async function checkAndShowAddHomeBanner() {
  try {
    if (!shouldShowAddHomeBanner()) return;
    
    // 取得 URL 中的 id 參數
    const urlParams = new URLSearchParams(window.location.search);
    const cardId = urlParams.get('id');
    if (!cardId) return;
    
    // 檢查是否已登入
    if (!window.UVACO_CLOUD || !UVACO_CLOUD.hasConfig()) return;
    
    const sessionResult = await UVACO_CLOUD.getSession();
    const session = sessionResult && sessionResult.session;
    const user = session && session.user;
    const userId = user ? String(user.id || '').trim() : '';
    
    // 只有在查看自己的名片時才顯示
    if (userId && cardId === userId) {
      // 延遲 2 秒後顯示，避免打擾用戶瀏覽
      setTimeout(() => {
        const banner = document.getElementById('addHomeBanner');
        if (banner) {
          banner.classList.add('show');
        }
      }, 2000);
    }
  } catch (e) {
    console.error('檢查加入主畫面提示失敗:', e);
  }
}

// 關閉提示並記住選擇
function dismissAddHomeBanner() {
  const banner = document.getElementById('addHomeBanner');
  if (banner) {
    banner.classList.remove('show');
  }
  localStorage.setItem('addHomeBannerDismissed', 'true');
}

// 顯示加入主畫面說明
function showAddHomeInstructions() {
  const lang = localStorage.getItem('lang') || 'zh';
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);
  
  let instructions = '';
  
  if (lang === 'zh') {
    if (isIOS) {
      instructions = `📱 iOS 加入主畫面步驟：

1. 點擊瀏覽器底部的「分享」按鈕 (方形+箭頭圖示)
2. 向下滑動找到「加入主畫面」
3. 點擊「新增」確認

完成後，主畫面會出現「我的名片」圖示，點擊即可快速開啟您的名片！`;
    } else if (isAndroid) {
      instructions = `📱 Android 加入主畫面步驟：

1. 點擊瀏覽器右上角的「選單」(⋮)
2. 選擇「加入主畫面」或「安裝應用程式」
3. 點擊「新增」確認

完成後，主畫面會出現「我的名片」圖示，點擊即可快速開啟您的名片！`;
    } else {
      instructions = `📱 加入主畫面步驟：

1. 在瀏覽器中找到「分享」或「選單」按鈕
2. 選擇「加入主畫面」或「安裝」
3. 確認新增

完成後，主畫面會出現「我的名片」圖示！`;
    }
  } else {
    if (isIOS) {
      instructions = `📱 iOS - Add to Home Screen:

1. Tap the "Share" button at the bottom (square with arrow)
2. Scroll down and tap "Add to Home Screen"
3. Tap "Add" to confirm

Done! You'll see "My Card" icon on your home screen.`;
    } else if (isAndroid) {
      instructions = `📱 Android - Add to Home Screen:

1. Tap the menu button (⋮) in the browser
2. Select "Add to Home Screen" or "Install App"
3. Tap "Add" to confirm

Done! You'll see "My Card" icon on your home screen.`;
    } else {
      instructions = `📱 Add to Home Screen:

1. Find the "Share" or "Menu" button in your browser
2. Select "Add to Home Screen" or "Install"
3. Confirm

Done! You'll see the icon on your home screen.`;
    }
  }
  
  alert(instructions);
  dismissAddHomeBanner();
}

// 頁面載入後檢查是否顯示提示
document.addEventListener('DOMContentLoaded', function() {
  // 延遲執行，等待頁面資料載入
  setTimeout(checkAndShowAddHomeBanner, 1000);
});

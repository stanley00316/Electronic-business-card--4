// 編輯頁主邏輯：聯絡方式類型與連結輸入。
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
      defaultLink = '';
      placeholderText = '例：https://line.me/ti/p/xxxxx';
      buttonTextZh = '<img src="line-logo.svg" alt="LINE" class="btn-icon-line"> LINE';
      buttonTextEn = '<img src="line-logo.svg" alt="LINE" class="btn-icon-line"> LINE';
      break;
    case 'official-line':
      defaultLink = '';
      placeholderText = '例：@632nedvu 或 line.me/R/ti/p/%40yourid';
      buttonTextZh = '<img src="line-logo.svg" alt="LINE" class="btn-icon-line"> 官方 LINE';
      buttonTextEn = '<img src="line-logo.svg" alt="LINE" class="btn-icon-line"> Official LINE';
      break;
    case 'facebook':
      defaultLink = '';
      placeholderText = '例：facebook.com/yourpage 或 yourpage';
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
      placeholderText = '例：linkedin.com/in/yourprofile 或 yourprofile';
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
      placeholderText = '例：@yourchannel 或 youtube.com/@yourchannel';
      buttonTextZh = '<img src="youtube-logo.svg" alt="YouTube" class="btn-icon-youtube"> YouTube';
      buttonTextEn = '<img src="youtube-logo.svg" alt="YouTube" class="btn-icon-youtube"> YouTube';
      break;
    case 'wechat':
      defaultLink = '';
      placeholderText = '例：wxid_0endyjaii0ju12';
      buttonTextZh = '<img src="wechat-logo.svg" alt="WeChat" class="btn-icon-wechat"> 微信';
      buttonTextEn = '<img src="wechat-logo.svg" alt="WeChat" class="btn-icon-wechat"> WeChat';
      break;
    case 'whatsapp':
      defaultLink = '';
      placeholderText = '例：0912345678 或 +886912345678';
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
  const t = window.isEditingContact && window.editingContactInfo ? window.editingContactInfo.type : (window.currentContactType ? window.currentContactType.type : '');

  if (overlay && inputField) {
    inputField.value = defaultLink || '';
    // 使用 currentContactType 中的 placeholder，若無則使用預設值
    const customPlaceholder = window.currentContactType && window.currentContactType.placeholder;
    inputField.placeholder = customPlaceholder || (currentLang === 'zh' ? '請輸入連結' : 'Please enter link');
    // 依聯絡方式改成白話標題，讓不熟手機的使用者知道要填什麼。
    const titleZh = overlay.querySelector('.link-input-title.lang-zh');
    const titleEn = overlay.querySelector('.link-input-title.lang-en');
    const titles = {
      line: ['輸入 LINE 加好友連結', 'Enter LINE friend link'],
      'official-line': ['輸入官方 LINE ID 或連結', 'Enter Official LINE ID or link'],
      instagram: ['輸入 IG 帳號或連結', 'Enter IG username or link'],
      twitter: ['輸入 X 帳號或連結', 'Enter X username or link'],
      youtube: ['輸入 YouTube 頻道或連結', 'Enter YouTube channel or link'],
      whatsapp: ['輸入 WhatsApp 手機號碼', 'Enter WhatsApp phone number']
    };
    if (titleZh) titleZh.textContent = titles[t] ? titles[t][0] : '輸入連結';
    if (titleEn) titleEn.textContent = titles[t] ? titles[t][1] : 'Enter Link';
    // 重置提交標記（包括全局標記）
    inputField.dataset.submitted = 'false';
    window.isSubmittingLink = false;
    overlay.classList.add('show');
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // 範例/說明（A）
    if (help) {
      let zh = '請輸入完整連結（包含 https://）。';
      let en = 'Please enter a full link (including https://).';
      if (t === 'line') {
        zh = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">📱 如何取得 LINE 個人連結：</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> 開啟 LINE App</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> 新版：聊天頁右上角「＋」→「顯示行動條碼」；舊版：主頁 → 加入好友 → 行動條碼 → 顯示行動條碼</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> 點「複製連結」，不要貼 LINE ID</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">可貼上格式：</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://line.me/ti/p/7QENOpjTy5</code>
            <div style="font-size:11px;opacity:0.75;margin-top:6px;">提醒：公開後別人可加好友；若外流，可在 LINE 更新行動條碼讓舊連結失效。</div>
          </div>
        </div>`;
        en = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">📱 How to get your LINE link:</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> Open LINE App</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> New UI: Chats → "+" → "Show QR code"; old UI: Home → Add friends → QR code → Show QR code</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> Tap "Copy link". Do not paste a LINE ID.</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">Accepted format:</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://line.me/ti/p/7QENOpjTy5</code>
            <div style="font-size:11px;opacity:0.75;margin-top:6px;">Anyone can add you after this is public. Refresh your LINE QR code if the link leaks.</div>
          </div>
        </div>`;
      } else if (t === 'official-line') {
        zh = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">📱 如何取得 LINE 官方帳號連結：</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> 登入 LINE Official Account Manager</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> 選擇官方帳號 → 增加好友 / Gain friends</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> 可貼加好友連結，或直接輸入官方帳號 ID</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">可輸入格式：</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">@632nedvu</code>
            <code style="display:block;color:var(--uvaco-green);word-break:break-all;margin-top:4px;">https://line.me/R/ti/p/%40yourid</code>
          </div>
        </div>`;
        en = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">📱 How to get LINE Official Account link:</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> Login to LINE Official Account Manager</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> Select the account → Gain friends</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> Paste the add-friend link, or enter the Official Account ID</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">Accepted formats:</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">@632nedvu</code>
            <code style="display:block;color:var(--uvaco-green);word-break:break-all;margin-top:4px;">https://line.me/R/ti/p/%40yourid</code>
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
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> 點「...」→「複製連結」；看不到時可直接輸入帳號名稱</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">可輸入格式：</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://www.facebook.com/yourname</code>
            <code style="display:block;color:var(--uvaco-green);word-break:break-all;margin-top:4px;">yourname</code>
          </div>
        </div>`;
        en = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">📘 How to get your Facebook link:</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> Open Facebook App or website</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> Tap your profile picture</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> Tap "..." → "Copy link"; if you do not see it, enter the username</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">Accepted formats:</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://www.facebook.com/yourname</code>
            <code style="display:block;color:var(--uvaco-green);word-break:break-all;margin-top:4px;">yourname</code>
          </div>
        </div>`;
      } else if (t === 'instagram') {
        zh = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">📸 如何取得 Instagram 個人連結：</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> 開啟 Instagram App</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> 點擊右下角自己的頭像，進入個人檔案</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> 點擊「分享個人檔案」</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">4</span> 點擊「複製連結」；看不到按鈕時，直接輸入 @帳號也可以</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">可輸入格式：</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://www.instagram.com/yourname</code>
            <code style="display:block;color:var(--uvaco-green);word-break:break-all;margin-top:4px;">@yourname</code>
          </div>
        </div>`;
        en = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">📸 How to get your Instagram link:</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> Open Instagram App</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> Tap your profile picture at the bottom right</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> Tap "Share profile"</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">4</span> Tap "Copy link"; if you do not see it, enter @username instead</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">Accepted formats:</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://www.instagram.com/yourname</code>
            <code style="display:block;color:var(--uvaco-green);word-break:break-all;margin-top:4px;">@yourname</code>
          </div>
        </div>`;
      } else if (t === 'linkedin') {
        zh = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">💼 如何取得 LinkedIn 個人連結：</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> 開啟 LinkedIn App 或網頁版</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> 點擊「我」→「查看個人檔案」</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> 點「更多」或「聯絡資訊」，複製公開個人檔案網址</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">可輸入格式：</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://www.linkedin.com/in/yourname</code>
            <code style="display:block;color:var(--uvaco-green);word-break:break-all;margin-top:4px;">yourname</code>
          </div>
        </div>`;
        en = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">💼 How to get your LinkedIn link:</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> Open LinkedIn App or website</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> Tap "Me" → "View Profile"</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> Tap "More" or "Contact info", then copy the public profile URL</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">Accepted formats:</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://www.linkedin.com/in/yourname</code>
            <code style="display:block;color:var(--uvaco-green);word-break:break-all;margin-top:4px;">yourname</code>
          </div>
        </div>`;
      } else if (t === 'twitter') {
        zh = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">X 如何輸入個人帳號：</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> 開啟 X (Twitter) App</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> 點擊左上角頭像 → 「個人檔案」</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> 直接輸入 @ 後面的帳號；有複製到連結也可以貼上</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">可輸入格式：</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">@yourname</code>
            <code style="display:block;color:var(--uvaco-green);word-break:break-all;margin-top:4px;">https://x.com/yourname</code>
          </div>
        </div>`;
        en = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">How to enter your X account:</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> Open X (Twitter) App</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> Tap profile icon (top left) → "Profile"</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> Enter the @username, or paste the copied profile link</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">Accepted formats:</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">@yourname</code>
            <code style="display:block;color:var(--uvaco-green);word-break:break-all;margin-top:4px;">https://x.com/yourname</code>
          </div>
        </div>`;
      } else if (t === 'youtube') {
        zh = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">🎬 如何取得 YouTube 頻道連結：</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> 開啟 YouTube App 或網頁版</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> 點擊右下角「您」→「查看頻道」</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> 點「分享」→「複製連結」；也可直接輸入 @頻道帳號</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">可輸入格式：</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://www.youtube.com/@yourchannel</code>
            <code style="display:block;color:var(--uvaco-green);word-break:break-all;margin-top:4px;">@yourchannel</code>
          </div>
        </div>`;
        en = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">🎬 How to get your YouTube channel link:</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> Open YouTube App or website</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> Tap "You" (bottom right) → "View Channel"</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> Tap "Share" → "Copy link", or enter the @handle directly</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">Accepted formats:</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">https://www.youtube.com/@yourchannel</code>
            <code style="display:block;color:var(--uvaco-green);word-break:break-all;margin-top:4px;">@yourchannel</code>
          </div>
        </div>`;
      } else if (t === 'wechat') {
        zh = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">💬 如何輸入微信 ID：</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> 開啟微信 App</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> 點擊「我」→ 查看微信號</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> 直接輸入您的微信號，系統會自動轉成可開啟微信的按鈕</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">輸入格式範例：</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">wxid_0endyjaii0ju12</code>
          </div>
        </div>`;
        en = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">💬 How to enter WeChat ID:</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> Open WeChat App</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> Tap "Me" → View WeChat ID</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> Enter your WeChat ID. The button will try to open WeChat automatically.</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">Input format example:</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">wxid_0endyjaii0ju12</code>
          </div>
        </div>`;
      } else if (t === 'whatsapp') {
        zh = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">📱 如何輸入 WhatsApp 號碼：</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> 台灣手機可直接輸入 0912345678</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> 系統會自動轉成 886912345678</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> 也可貼完整 wa.me 連結</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">可輸入格式：</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">0912345678</code>
            <code style="display:block;color:var(--uvaco-green);word-break:break-all;margin-top:4px;">https://wa.me/886912345678</code>
          </div>
        </div>`;
        en = `<div style="text-align:left;">
          <div style="font-weight:600;color:var(--uvaco-green);margin-bottom:10px;">📱 How to enter WhatsApp number:</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">1</span> Taiwan mobile numbers can be entered as 0912345678</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">2</span> The system converts it to 886912345678</div>
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;min-width:20px;border-radius:50%;background:var(--uvaco-green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">3</span> A full wa.me link is also accepted</div>
          </div>
          <div style="padding:10px;background:rgba(0,200,83,0.1);border-radius:8px;">
            <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">Accepted formats:</div>
            <code style="color:var(--uvaco-green);word-break:break-all;">0912345678</code>
            <code style="display:block;color:var(--uvaco-green);word-break:break-all;margin-top:4px;">https://wa.me/886912345678</code>
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

  if (newLink === '') {
    if (fail('請先輸入內容。', 'Please enter a value.')) return;
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

  // LINE 個人帳號：只接受 LINE App 複製出來的加好友連結，不把 LINE ID 誤當連結。
  if (t === 'line') {
    const normalizedLine = normalizeLinePersonalContactLink(newLink);
    if (!normalizedLine) {
      if (fail(
        'LINE 個人帳號請貼「加好友連結」，例如：https://line.me/ti/p/7QENOpjTy5\n請不要只貼 LINE ID。',
        'Please paste a LINE friend link, e.g. https://line.me/ti/p/7QENOpjTy5. Do not paste only a LINE ID.'
      )) return;
    }
    newLink = normalizedLine;
  }

  // LINE 官方帳號：可貼官方加好友連結，也可直接填 @官方帳號ID。
  if (t === 'official-line') {
    const normalizedOfficialLine = normalizeOfficialLineContactLink(newLink);
    if (!normalizedOfficialLine) {
      if (fail(
        '官方 LINE 請輸入 @官方帳號ID，例如：@632nedvu，或貼 line.me 加好友連結。',
        'Please enter an Official LINE ID, e.g. @632nedvu, or paste a line.me add-friend link.'
      )) return;
    }
    newLink = normalizedOfficialLine;
  }

  // Facebook：可貼完整網址，也可直接輸入公開帳號名稱。
  if (t === 'facebook') {
    const normalizedFacebook = normalizeFacebookContactLink(newLink);
    if (!normalizedFacebook) {
      if (fail('Facebook 請貼個人檔案連結，或輸入公開帳號名稱，例如：yourname', 'Please paste a Facebook profile link, or enter a public username, e.g. yourname')) return;
    }
    newLink = normalizedFacebook;
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

  // LinkedIn：可貼完整網址，也可直接輸入 /in/ 後面的公開帳號名稱。
  if (t === 'linkedin') {
    const normalizedLinkedIn = normalizeLinkedInContactLink(newLink);
    if (!normalizedLinkedIn) {
      if (fail('LinkedIn 請貼公開個人檔案網址，或輸入 /in/ 後面的帳號名稱。', 'Please paste a LinkedIn public profile URL, or enter the username after /in/.')) return;
    }
    newLink = normalizedLinkedIn;
  }

  // Twitter/X：自動添加 https://
  if (t === 'twitter') {
    const normalizedTwitter = normalizeTwitterContactLink(newLink);
    if (!normalizedTwitter) {
      if (fail('X 帳號請輸入 @ 後面的英數帳號，例如：@yourname', 'Please enter an X handle, e.g. @yourname')) return;
    }
    newLink = normalizedTwitter;
  }

  // YouTube：可貼頻道網址，也可直接輸入 @頻道帳號。
  if (t === 'youtube') {
    const normalizedYouTube = normalizeYouTubeContactLink(newLink);
    if (!normalizedYouTube) {
      if (fail('YouTube 請貼頻道連結，或輸入 @頻道帳號，例如：@yourchannel', 'Please paste a YouTube channel link, or enter a channel handle, e.g. @yourchannel')) return;
    }
    newLink = normalizedYouTube;
  }

  // WeChat：可輸入微信號，系統轉成手機可嘗試開啟的 weixin:// 連結。
  if (t === 'wechat') {
    const v = newLink.trim();
    if (!/^weixin:/i.test(v) && !/^https?:\/\//i.test(v)) {
      const wechatId = (typeof getWeChatIdFromLink === 'function') ? getWeChatIdFromLink(v) : v.replace(/^@+/, '').trim();
      if (!wechatId || (typeof isSafeWeChatId === 'function' && !isSafeWeChatId(wechatId))) {
        if (fail(
          '請輸入有效的微信號，例如：wxid_0endyjaii0ju12\n微信號只接受英文字母、數字、底線或連字號。',
          'Please enter a valid WeChat ID, e.g. wxid_0endyjaii0ju12'
        )) return;
      }
      newLink = (typeof normalizeWeChatContactLink === 'function') ? normalizeWeChatContactLink(wechatId) : ('weixin://dl/chat?' + encodeURIComponent(wechatId));
    }
  }

  // WhatsApp：台灣手機可輸入 09 開頭；儲存前轉成 wa.me 需要的國碼格式。
  if (t === 'whatsapp') {
    const normalizedWhatsApp = normalizeWhatsAppContactLink(newLink);
    if (!normalizedWhatsApp) {
      if (fail(
        'WhatsApp 請輸入台灣手機 09 開頭，或含國碼的號碼，例如：+886912345678。',
        'Please enter a Taiwan mobile number, or an international number, e.g. +886912345678.'
      )) return;
    }
    newLink = normalizedWhatsApp;
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

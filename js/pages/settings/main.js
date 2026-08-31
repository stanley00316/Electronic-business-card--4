/**
 * settings.html
 */
// 前往「我的名片」頁面
async function gotoMyCard(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  try {
    if (!window.UVACO_CLOUD || !UVACO_CLOUD.hasConfig()) {
      window.location.href = 'auth.html?next=settings.html';
      return false;
    }
    const s = await UVACO_CLOUD.getSession();
    const uid = s && s.session && s.session.user ? String(s.session.user.id || '').trim() : '';
    if (!uid) {
      window.location.href = 'auth.html?next=settings.html';
      return false;
    }
    window.location.href = 'card.html?id=' + encodeURIComponent(uid);
    return false;
  } catch (e) {
    window.location.href = 'auth.html?next=settings.html';
    return false;
  }
}

async function initUserId() {
  try {
    if (window.UVACO_CLOUD) {
      const s = await UVACO_CLOUD.getSession();
      const uid = s.session ? s.session.user.id : '尚未登入';
      document.getElementById('myUserIdDisplay').textContent = uid;
      
      // 載入邀請連結
      if (s.session && uid) {
        loadInviteLink(uid);
        loadReferralStats();
        loadHomeScreenLink(uid);
        if (window.__uvacoSetupPersonalManifest) window.__uvacoSetupPersonalManifest(uid);
      }

      // 訂閱管理僅企業帳號可見：個人使用不需要付費，避免個人帳號誤觸付款頁
      if (s.session && window.UVACO_CLOUD && UVACO_CLOUD.getMyCard) {
        try {
          const { card } = await UVACO_CLOUD.getMyCard();
          const subscriptionItem = document.getElementById('subscriptionMenuItem');
          if (subscriptionItem && (!card || card.is_enterprise !== true)) {
            subscriptionItem.remove();
          }
        } catch (e) {}
      }
      
      // 檢查管理員狀態 - 僅「超級管理員」可見以下三個項目
      if (s.session && UVACO_CLOUD.isAdmin) {
        const adminStatus = await UVACO_CLOUD.isAdmin();
        const statusItem = document.getElementById('adminStatusItem');
        const statusDisplay = document.getElementById('adminStatusDisplay');
        const adminLink = document.getElementById('adminBackendLink');
        const userIdItem = document.getElementById('userIdItem');
        
        // 只有「超級管理員」才顯示這三個項目（企業管理員不顯示）
        const isSuperAdmin = adminStatus && adminStatus.isAdmin &&
          adminStatus.canManageAdmins && !adminStatus.managedCompany;
        
        if (isSuperAdmin) {
          // 顯示管理後台連結
          if (adminLink) adminLink.style.display = 'flex';
          // 顯示使用者 ID
          if (userIdItem) userIdItem.style.display = 'flex';
          // 顯示管理員狀態
          if (statusItem) statusItem.style.display = 'flex';
          
          if (statusDisplay) {
            statusDisplay.innerHTML = '<span style="color:#22c55e;">✓ 超級管理員</span>';
          }
        }
        // 企業管理員和一般用戶：這三個項目保持隱藏（預設 display: none）
      }
    }
  } catch (e) {
    document.getElementById('myUserIdDisplay').textContent = 'Error';
    console.error('initUserId error:', e);
  }
}

function copyMyUserId() {
  const uid = document.getElementById('myUserIdDisplay').textContent;
  if (uid && uid !== '...' && uid !== '尚未登入') {
    navigator.clipboard.writeText(uid).then(() => {
      alert('User ID 已複製：' + uid);
    });
  }
}

// 載入邀請連結
let myInviteLink = '';
function loadInviteLink(userId) {
  if (!UVACO_CLOUD.generateInviteLink) return;
  
  const inviteItem = document.getElementById('inviteLinkItem');
  const inviteDisplay = document.getElementById('inviteLinkDisplay');
  
  myInviteLink = UVACO_CLOUD.generateInviteLink(userId);
  inviteItem.style.display = 'flex';
  
  // 顯示縮短版的連結
  const shortLink = myInviteLink.length > 50 ? myInviteLink.substring(0, 47) + '...' : myInviteLink;
  inviteDisplay.textContent = shortLink;
}

// 分享邀請連結（優先使用系統分享介面）
async function shareInviteLink() {
  if (!myInviteLink) return;
  
  const savedLang = localStorage.getItem('lang') || 'zh';
  const shareData = {
    title: savedLang === 'zh' ? '加入數位身分平台' : 'Join Digital Identity Platform',
    text: savedLang === 'zh' 
      ? '我邀請你加入數位身分平台，一起建立專屬電子名片！' 
      : 'I invite you to join the Digital Identity Platform!',
    url: myInviteLink
  };
  
  // 優先使用系統分享（支援 LINE、訊息、Email 等）
  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch (err) {
      // 用戶取消分享，直接返回
      if (err.name === 'AbortError') return;
      // 其他錯誤，fallback 到複製
      console.log('Share failed, fallback to copy:', err);
    }
  }
  
  // Fallback: 複製到剪貼簿
  try {
    await navigator.clipboard.writeText(myInviteLink);
    alert(savedLang === 'zh' 
      ? '邀請連結已複製！\n分享給朋友即可邀請他們加入。' 
      : 'Invite link copied!\nShare with friends to invite them.');
  } catch (err) {
    prompt(savedLang === 'zh' ? '請手動複製連結：' : 'Please copy the link:', myInviteLink);
  }
}

// 保留舊函數名稱以防其他地方調用
function copyInviteLink() {
  shareInviteLink();
}

// 主畫面捷徑連結：把使用者編號直接寫進網址，之後不管手機本機資料被清掉幾次，
// 點這個捷徑一律能直接看到名片，不需要靠登入紀錄「記住」身分。
let myHomeScreenLink = '';
function loadHomeScreenLink(userId) {
  const item = document.getElementById('homeScreenLinkItem');
  const display = document.getElementById('homeScreenLinkDisplay');
  if (!item || !display) return;

  const base = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
  myHomeScreenLink = base + 'my-card.html?id=' + encodeURIComponent(userId);
  item.style.display = 'flex';

  const shortLink = myHomeScreenLink.length > 50 ? myHomeScreenLink.substring(0, 47) + '...' : myHomeScreenLink;
  display.textContent = shortLink;
}

async function copyHomeScreenLink() {
  if (!myHomeScreenLink) return;
  const savedLang = localStorage.getItem('lang') || 'zh';

  // Android / Chrome：瀏覽器支援「加入主畫面」原生視窗時，直接跳出來，不必再手動複製貼上。
  const deferred = window.__uvacoDeferredInstallPrompt;
  if (deferred) {
    window.__uvacoDeferredInstallPrompt = null;
    try {
      deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice && choice.outcome === 'accepted') return;
    } catch (e) {}
  }

  // iOS Safari 等不支援原生安裝視窗的瀏覽器：複製連結 + 顯示操作步驟。
  const tip = savedLang === 'zh'
    ? '連結已複製！\n\n請到 Safari 貼上這個連結並開啟，再用「加入主畫面」建立新的捷徑。\n建議刪除舊的「我的名片」捷徑，改用這個新的，之後點擊就會保證每次都直接開啟名片。'
    : 'Link copied!\n\nOpen it in Safari, then use "Add to Home Screen" to create a new shortcut.\nPlease delete the old shortcut and use this new one — it will always open directly.';
  try {
    await navigator.clipboard.writeText(myHomeScreenLink);
    alert(tip);
  } catch (err) {
    prompt(savedLang === 'zh' ? '請手動複製連結：' : 'Please copy manually:', myHomeScreenLink);
  }
}

// 載入推薦統計
async function loadReferralStats() {
  if (!UVACO_CLOUD.getMyReferralCount) return;
  
  const statsItem = document.getElementById('referralStatsItem');
  const statsDisplay = document.getElementById('referralStatsDisplay');
  
  try {
    const result = await UVACO_CLOUD.getMyReferralCount();
    const count = result.count || 0;
    
    statsItem.style.display = 'flex';
    
    const savedLang = localStorage.getItem('lang') || 'zh';
    if (savedLang === 'zh') {
      statsDisplay.innerHTML = `已成功邀請 <strong>${count}</strong> 位好友加入`;
    } else {
      statsDisplay.innerHTML = `Successfully invited <strong>${count}</strong> friends`;
    }
  } catch (e) {
    console.log('[Referral] 無法載入推薦統計');
    statsItem.style.display = 'none';
  }
}

// 連結 Google 帳號：顯示目前是否已連結，未連結才可點擊觸發連結流程
async function initGoogleLink() {
  try {
    if (!window.UVACO_CLOUD || !UVACO_CLOUD.hasGoogleConfig || !UVACO_CLOUD.hasGoogleConfig()) return;
    const s = await UVACO_CLOUD.getSession();
    const uid = s && s.session && s.session.user ? String(s.session.user.id || '').trim() : '';
    if (!uid) return;

    const item = document.getElementById('googleLinkItem');
    if (!item) return;
    item.style.display = 'flex';

    const status = await UVACO_CLOUD.getGoogleLinkStatus();
    const icon = document.getElementById('googleLinkIcon');
    const titleZh = document.getElementById('googleLinkTitleZh');
    const titleEn = document.getElementById('googleLinkTitleEn');
    const display = document.getElementById('googleLinkDisplay');
    const arrow = document.getElementById('googleLinkArrow');

    if (status && status.ok && status.linked) {
      item.onclick = null;
      item.style.cursor = 'default';
      if (icon) icon.textContent = '✅';
      if (titleZh) titleZh.textContent = '已連結 Google 帳號';
      if (titleEn) titleEn.textContent = 'Google Account Linked';
      if (display) display.textContent = status.email || '';
      if (arrow) arrow.style.display = 'none';
    } else {
      if (icon) icon.textContent = '🔗';
      if (titleZh) titleZh.textContent = '連結 Google 帳號';
      if (titleEn) titleEn.textContent = 'Link Google Account';
      if (display) display.textContent = '防止未來資料遺失，建議現在連結';
    }
  } catch (e) {
    console.error('initGoogleLink error:', e);
  }
}

function startGoogleLinkFlow() {
  if (window.UVACO_CLOUD && UVACO_CLOUD.startGoogleLink) {
    UVACO_CLOUD.startGoogleLink('settings.html');
  }
}

// 處理連結 Google 帳號流程完成後，網址帶回來的 ?linked=1 / ?linkError=... 參數
function handleGoogleLinkResultFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const linked = params.get('linked');
  const linkError = params.get('linkError');
  if (!linked && !linkError) return;

  const savedLang = localStorage.getItem('lang') || 'zh';
  if (linked) {
    alert(savedLang === 'zh'
      ? '🎉 Google 帳號連結成功！以後不管用 LINE 還是 Google 登入，看到的都會是同一份名片資料。'
      : '🎉 Google account linked! Your card data stays the same whether you log in with LINE or Google.');
  } else if (linkError) {
    const messages = {
      GOOGLE_ALREADY_LINKED_ELSEWHERE: savedLang === 'zh'
        ? '這個 Google 帳號已經連結過其他帳號了，請換一個尚未使用過的 Google 帳號再試一次。'
        : 'This Google account is already linked to another account. Please try a different Google account.',
      NO_SESSION: savedLang === 'zh'
        ? '連結逾時或登入狀態已失效，請重新登入後再試一次。'
        : 'Session expired. Please log in again and retry.'
    };
    alert(messages[linkError] || (savedLang === 'zh' ? '連結失敗，請稍後再試一次。' : 'Link failed. Please try again later.'));
  }

  try {
    params.delete('linked');
    params.delete('linkError');
    const qs = params.toString();
    history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
  } catch (e) {}
}

// 登出處理
function handleLogout() {
  if (confirm('確定要登出系統嗎？\nAre you sure you want to logout?')) {
    if (window.UVACO_CLOUD) {
      UVACO_CLOUD.clearCustomJwt();
    } else {
      // Fallback if cloud.js not loaded
      try { localStorage.removeItem('UVACO_CUSTOM_JWT'); } catch (e) {}
    }
    // 回到首頁（會自動判斷是否需登入）
    window.location.replace('index.html');
  }
}

// 前往「我的編輯頁」：一律帶 uid/next，確保編輯到自己的名片
async function gotoMyEdit(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  try {
    if (!window.UVACO_CLOUD || !UVACO_CLOUD.hasConfig()) {
      window.location.href = 'edit.html';
      return false;
    }
    const s = await UVACO_CLOUD.getSession();
    const uid = s && s.session && s.session.user ? String(s.session.user.id || '').trim() : '';
    if (!uid) {
      window.location.href = 'auth.html?next=' + encodeURIComponent('settings.html');
      return false;
    }
    const next = 'card.html?id=' + encodeURIComponent(uid);
    window.location.href = 'edit.html?uid=' + encodeURIComponent(uid) + '&next=' + encodeURIComponent(next);
    return false;
  } catch (e) {
    window.location.href = 'edit.html';
    return false;
  }
}

// 處理設定選項點擊
function handleSettingsClick(action) {
  const zhElements = document.querySelectorAll('.lang-zh');
  const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';
  
  const messages = {
    'edit': { zh: '編輯名片功能開發中', en: 'Edit card feature coming soon' },
    'admin': { zh: '管理後台功能開發中', en: 'Admin backend feature coming soon' },
    'import': { zh: '匯入聯絡人已整合到平台通訊錄的「新增好友」中', en: 'Import contacts is now inside Platform Directory → Add Friend' }
  };
  
  const msg = messages[action] ? messages[action][currentLang] : (currentLang === 'zh' ? '功能開發中' : 'Feature coming soon');
  alert(msg);
}

// 更新設定頁面的語言按鈕狀態
function updateSettingsLangButtons() {
  const zhBtn = document.getElementById('langZhBtn');
  const enBtn = document.getElementById('langEnBtn');
  
  if (zhBtn && enBtn) {
    const zhElements = document.querySelectorAll('.lang-zh');
    const isZh = zhElements.length > 0 && zhElements[0].style.display !== 'none';
    
    zhBtn.classList.remove('active');
    enBtn.classList.remove('active');
    
    if (isZh) {
      zhBtn.classList.add('active');
    } else {
      enBtn.classList.add('active');
    }
  }
}


// 覆寫 setLang 函數以更新設定頁面的語言按鈕
// 確保在 common.js 載入後執行
(function() {
  function setupSetLangOverride() {
    if (typeof window.setLang === 'function') {
      const originalSetLang = window.setLang;
      window.setLang = function(lang) {
        // 先調用原始函數（它會更新 body class 和所有元素）
        originalSetLang(lang);
        
        // 延遲一下確保 DOM 已更新
        setTimeout(function() {
          updateSettingsLangButtons();
          
          // 再次確保所有元素都正確顯示/隱藏（雙重保險）
          // 特別針對 settings-panel 內的元素
          const allZhElements = document.querySelectorAll('.lang-zh');
          const allEnElements = document.querySelectorAll('.lang-en');
          const isZh = lang === 'zh';
          
          allZhElements.forEach(el => {
            el.style.display = isZh ? 'block' : 'none';
          });
          allEnElements.forEach(el => {
            el.style.display = isZh ? 'none' : 'block';
          });
          
          // 確保 settings-panel 和 settings-menu 容器可見
          const settingsPanel = document.querySelector('.settings-panel');
          const settingsMenu = document.querySelector('.settings-menu');
          if (settingsPanel) {
            settingsPanel.style.display = 'block';
          }
          if (settingsMenu) {
            settingsMenu.style.display = 'flex';
          }
        }, 50);
      };
      return true;
    }
    return false;
  }
  
  // 嘗試立即設置
  if (!setupSetLangOverride()) {
    // 如果失敗，等待 DOM 載入
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        setTimeout(setupSetLangOverride, 100);
      });
    } else {
      setTimeout(setupSetLangOverride, 100);
    }
  }
})();


// 頁面載入時更新按鈕狀態並確保語言正確顯示
function initSettingsPage() {
  // 顯示 User ID
  initUserId();

  // 連結 Google 帳號狀態
  initGoogleLink();

  // 處理連結完成後從網址帶回來的結果訊息
  handleGoogleLinkResultFromUrl();

  // 確保語言切換正確
  const savedLang = localStorage.getItem('lang') || 'zh';
  if (typeof setLang === 'function') {
    // 重新應用語言設定，確保所有元素正確顯示
    setLang(savedLang);
  }
  
  setTimeout(function() {
    updateSettingsLangButtons();
  }, 100);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSettingsPage);
} else {
  initSettingsPage();
}

window.gotoMyCard = gotoMyCard;
window.gotoMyEdit = gotoMyEdit;
window.copyMyUserId = copyMyUserId;
window.shareInviteLink = shareInviteLink;
window.copyInviteLink = copyInviteLink;
window.copyHomeScreenLink = copyHomeScreenLink;
window.handleLogout = handleLogout;
window.handleSettingsClick = handleSettingsClick;
window.startGoogleLinkFlow = startGoogleLinkFlow;

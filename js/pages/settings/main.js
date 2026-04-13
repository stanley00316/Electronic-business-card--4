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
      }
      
      // 檢查管理員狀態 - 僅「超級管理員」可見以下三個項目
      if (s.session && UVACO_CLOUD.isAdmin) {
        const adminStatus = await UVACO_CLOUD.isAdmin();
        const statusItem = document.getElementById('adminStatusItem');
        const statusDisplay = document.getElementById('adminStatusDisplay');
        const adminLink = document.getElementById('adminBackendLink');
        const userIdItem = document.getElementById('userIdItem');
        
        // 只有「超級管理員」才顯示這三個項目（企業管理員不顯示）
        const isSuperAdmin = adminStatus && adminStatus.isAdmin && !adminStatus.managedCompany;
        
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
window.handleLogout = handleLogout;
window.handleSettingsClick = handleSettingsClick;

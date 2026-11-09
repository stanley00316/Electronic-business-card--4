// 編輯頁面：背景預載入所有主題以改善切換體驗
if (typeof preloadAllThemes === 'function') {
  preloadAllThemes();
}

// 畫面完整載好前都不能儲存；讀取失敗和登入轉頁也不會解除這道保護。
window.__uvacoEditLoadState = 'loading';

// 每次等雲端最多 10 秒；逾時後只接受下一次嘗試，不採用遲到的舊回應。
async function waitForEditRequest(request) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(request),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('EDIT_LOAD_TIMEOUT')), 10000);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// 讀名片小工具：網路一時不穩會讀失敗，這裡自動重試（共 3 次，間隔 1 秒、2 秒）。
// 回傳 { card, error }：error 有值代表「真的沒讀到」，絕對不能當成「這個人還沒有名片」，
// 否則會把老用戶切成新手模式，按下儲存還會用空白資料蓋掉原本的名片。
async function loadCardWithRetry(loadFn) {
  const MAX_ATTEMPTS = 3;
  let last = { card: null, error: null };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await waitForEditRequest(loadFn);
      if (!res || !Object.prototype.hasOwnProperty.call(res, 'card')) {
        throw new Error('INVALID_CARD_RESPONSE');
      }
      last = { card: (res && res.card) || null, error: (res && res.error) || null };
    } catch (e) {
      last = { card: null, error: e || new Error('LOAD_FAILED') };
    }
    if (!last.error) return last;
    console.warn('[Edit] 讀取名片失敗（第 ' + attempt + ' 次）', last.error);
    if (attempt < MAX_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
  }
  return last;
}

// 等整個編輯頁畫面載完（提示視窗寫在 edit.html 比較後面，要等它出現才能顯示）
function whenEditDomReady() {
  return new Promise(resolve => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', resolve, { once: true });
    } else {
      resolve();
    }
  });
}

// 名片沒讀到時的白話提示：請使用者重新載入，不要在空白畫面上編輯、儲存
async function showCardLoadFailedNotice() {
  await whenEditDomReady();
  if (typeof showSaveFeedback !== 'function') return;
  await showSaveFeedback('error', {
    titleZh: '名片內容還沒讀到', titleEn: 'Card Not Loaded Yet',
    msgZh: '網路好像不太穩定，名片內容還沒讀到。為了避免蓋掉您原本的資料，請按「重新載入」再試一次。',
    msgEn: 'The network seems unstable and your card has not loaded yet. To avoid overwriting your saved card, please tap "Reload" and try again.',
    actions: [
      { labelZh: '重新載入', labelEn: 'Reload', primary: true, onClick: function () { window.location.reload(); } },
      { labelZh: '稍後', labelEn: 'Later', primary: false }
    ]
  });
}

// 雲端版：需要登入才可編輯；雲端程式缺失時保護既有資料，不開放空白儲存。
// 結果存在 window.__uvacoEditInitReady，「歡迎使用」新手視窗要等這裡讀完名片才判斷（見 edit-chunk-5.js）。
window.__uvacoEditInitReady = (async function () {
  // 預設為編輯自己的名片
  let cardData = null;
  // 名片是否「讀取失敗」（網路不穩等），跟「這個人還沒有名片」是兩回事
  let loadFailed = false;
  try {
    await whenEditDomReady();
    if (!window.UVACO_CLOUD || !UVACO_CLOUD.hasConfig()) throw new Error('CLOUD_UNAVAILABLE');
    // 以 edit.html 作為入口：未登入則導向 auth.html；登入後回到此頁
    const here = 'edit.html' + (window.location.search || '');
    const r = await waitForEditRequest(() => UVACO_CLOUD.requireAuth(here));
    if (!r.ok) {
      window.__uvacoEditLoadState = 'redirecting';
      return { redirecting: true };
    }

    // 若有待領取的邀請，確認領取完成才繼續；暫時失敗保留邀請，方便重新載入。
    let invTok = '';
    try { invTok = localStorage.getItem('UVACO_INVITE_TOKEN') || ''; } catch (e) {}
    if (invTok && UVACO_CLOUD.claimCardInvite) {
      try {
        await waitForEditRequest(() => UVACO_CLOUD.claimCardInvite(invTok));
        try { localStorage.removeItem('UVACO_INVITE_TOKEN'); } catch (e) {}
      } catch (e) {
        if (e.message === 'INVITE_INVALID_OR_EXPIRED') {
          // 已確定過期的邀請清掉即可，不讓舊邀請永遠擋住使用者編輯自己的名片。
          try { localStorage.removeItem('UVACO_INVITE_TOKEN'); } catch (e) {}
        } else {
          throw e;
        }
      }
    }

    // Admin Mode: 支援：
    // - edit.html?adminMode=true&targetUserId=<uuid>
    // - edit.html?uid=<uuid>
    // - edit.html?id=<uuid>（同 uid）
    // 規則：
    // - 只要網址有 uid/id/targetUserId，就以該 id 為「要編輯的目標」。
    // - 若目標不是本人 → 需要管理員權限。
    const params = new URLSearchParams(window.location.search || '');
    const targetUserId = params.get('targetUserId') || params.get('uid') || params.get('id');
    let adminMode = params.get('adminMode') === 'true';

    // 取得目前登入者 id，用於判斷是否為「編輯本人」或「編輯他人」
    const s = await waitForEditRequest(() => UVACO_CLOUD.getSession());
    const myUserId = s && s.session && s.session.user ? String(s.session.user.id || '') : '';
    if (!myUserId || s.error) throw new Error('EDIT_SESSION_UNAVAILABLE');

    // 若指定的 targetUserId 不是本人 → 走管理員模式（不管有沒有帶 adminMode=true）
    if (targetUserId && myUserId && String(targetUserId) !== String(myUserId)) {
      adminMode = true;
    }

    if (adminMode && targetUserId && myUserId && String(targetUserId) !== String(myUserId)) {
      // 管理員模式：檢查權限並讀取目標名片
      const adminStatus = await waitForEditRequest(() => UVACO_CLOUD.isAdmin());
      if (!adminStatus || !adminStatus.isAdmin) {
        alert('權限不足：您不是管理員');
        window.location.href = 'directory.html';
        window.__uvacoEditLoadState = 'redirecting';
        return { redirecting: true };
      }
      
      // 顯示管理員提示條
      showAdminBanner(targetUserId);

      // 讀取目標名片（網路不穩會自動重試）
      const res = await loadCardWithRetry(() => UVACO_CLOUD.getCardByUserId(targetUserId));
      cardData = res.card;
      if (res.error) loadFailed = true;

      if (!cardData && !loadFailed) {
        const current = await waitForEditRequest(() => UVACO_CLOUD.getSession());
        if (current.error || String(current.session?.user?.id || '') !== myUserId) {
          throw new Error('EDIT_SESSION_CHANGED');
        }
      }

      // 如果該用戶還沒名片（而且不是讀取失敗），cardData 為 null，視為幫他新建
    } else {
      // 一般模式：
      // - 若網址有指定 uid/id/targetUserId（且是本人），就用 getCardByUserId() 明確讀取，避免載入錯誤或落回示例。
      // - 否則才用 getMyCard()
      // 讀名片一律走 loadCardWithRetry：網路不穩會自動重試，最後還是失敗就標記 loadFailed
      let res;
      if (targetUserId && myUserId && String(targetUserId) === String(myUserId)) {
        res = await loadCardWithRetry(() => UVACO_CLOUD.getCardByUserId(targetUserId));
      } else {
        res = await loadCardWithRetry(() => UVACO_CLOUD.getMyCard());
      }
      cardData = res.card;
      if (res.error) loadFailed = true;
      
      // 雲端工具在登入中途失效時也可能回傳空名片，必須再確認身分仍相同。
      if (!cardData && !loadFailed) {
        const current = await waitForEditRequest(() => UVACO_CLOUD.getSession());
        if (current.error || String(current.session?.user?.id || '') !== myUserId) {
          throw new Error('EDIT_SESSION_CHANGED');
        }
      }

      // 若使用者已經有名片：視為已 onboarding（避免清掉 localStorage 後又被當新手）
      if (cardData) {
        try { localStorage.setItem('UVACO_ONBOARDED', '1'); } catch (e) {}
      }

      // 若尚未建立名片，且網址未指定 mode：自動切換為 onboarding
      // （讀取失敗不算「尚未建立名片」，不能切換，否則老用戶會被當成新手）
      if (!cardData && !loadFailed && !params.get('mode')) {
        params.set('mode', 'onboarding');
        if (!params.get('next')) params.set('next', 'directory.html');
        const qs = params.toString();
        const newUrl = 'edit.html' + (qs ? ('?' + qs) : '');
        window.history.replaceState({}, '', newUrl);
      }
    }

    // 如果有讀到名片資料，載入到介面
    if (cardData) {
      loadCardToUI(cardData);
    }

    // 套用公司管理員設定的鎖定欄位（不在管理員模式時才套用）
    if (!adminMode && cardData && cardData.company && window.UVACO_CLOUD && UVACO_CLOUD.getCompanySettings) {
      try {
        const cfg = await waitForEditRequest(() => UVACO_CLOUD.getCompanySettings(cardData.company));
        if (cfg.lockedFields && cfg.lockedFields.length) {
          applyLockedFields(cfg.lockedFields);
        }
      } catch (e) {
        console.log('[LockFields] 讀取公司設定失敗:', e.message || e);
      }
    }

    // 注入公司選擇器按鈕（與語系同步顯示）
    try {
      setTimeout(() => injectCompanyPickerButtons(), 0);
    } catch (e) {}
  } catch (e) {
    console.error('Init failed', e);
    // 即使資料讀到了，只要套到畫面時出錯，也不能儲存不完整的畫面。
    loadFailed = true;
  }

  window.__uvacoEditLoadState = loadFailed ? 'failed' : 'ready';
  if (loadFailed) {
    // 給 saveCard() 檢查用：名片沒讀到時不准儲存，避免用空白資料蓋掉原本的名片
    window.__uvacoCardLoadFailed = true;
    showCardLoadFailedNotice();
  }
  return { hasCard: !!cardData, loadFailed };
})();


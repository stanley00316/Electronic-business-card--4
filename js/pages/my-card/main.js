/**
 * my-card.html
 */
    const HOME_SCREEN_CARD_ID_KEY = 'UVACO_HOME_CARD_ID';

    function isStandaloneApp() {
      try {
        return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
          || window.navigator.standalone === true;
      } catch (e) {
        return false;
      }
    }

    function normalizeRememberedCardId(value) {
      const id = String(value || '').trim();
      if (!id || id.length > 80 || !/^[A-Za-z0-9_-]+$/.test(id)) return '';
      return id;
    }

    function getRememberedHomeCardId() {
      try {
        return normalizeRememberedCardId(localStorage.getItem(HOME_SCREEN_CARD_ID_KEY));
      } catch (e) {
        return '';
      }
    }

    function rememberHomeCardId(userId) {
      const id = normalizeRememberedCardId(userId);
      if (!id) return;
      try {
        localStorage.setItem(HOME_SCREEN_CARD_ID_KEY, id);
      } catch (e) {}
    }

    function redirectToCard(userId) {
      window.location.replace('card.html?id=' + encodeURIComponent(userId));
    }

    function redirectToLogin() {
      window.location.replace('auth.html?next=my-card.html');
    }

    // 載入超時提示（8秒後顯示）
    var loadingTimeout = setTimeout(function() {
      var loadingText = document.querySelector('.loading-text');
      if (loadingText) {
        loadingText.innerHTML = '載入時間較長，請檢查網路連線...<br><a href="auth.html?next=my-card.html">點此重新登入</a>';
      }
    }, 8000);

    (async function() {
      try {
        // 檢查是否有 Supabase 配置
        if (!window.UVACO_CLOUD || !UVACO_CLOUD.hasConfig()) {
          clearTimeout(loadingTimeout);
          // 未配置，導向登入頁
          redirectToLogin();
          return;
        }

        // 取得使用者 session
        const sessionResult = await UVACO_CLOUD.getSession();
        const session = sessionResult && sessionResult.session;
        const user = session && session.user;
        const userId = user ? String(user.id || '').trim() : '';

        clearTimeout(loadingTimeout);

        if (!userId) {
          // 手機主畫面/PWA 模式只負責快速打開「已記住的公開名片」，不放寬編輯與後台權限。
          const rememberedCardId = isStandaloneApp() ? getRememberedHomeCardId() : '';
          if (rememberedCardId) {
            redirectToCard(rememberedCardId);
            return;
          }

          // 未登入，導向登入頁
          redirectToLogin();
          return;
        }

        rememberHomeCardId(userId);

        // 導向使用者的名片頁面
        redirectToCard(userId);

      } catch (e) {
        console.error('載入失敗:', e);
        clearTimeout(loadingTimeout);
        // 發生錯誤，導向登入頁
        const rememberedCardId = isStandaloneApp() ? getRememberedHomeCardId() : '';
        if (rememberedCardId) {
          redirectToCard(rememberedCardId);
          return;
        }
        redirectToLogin();
      }
    })();

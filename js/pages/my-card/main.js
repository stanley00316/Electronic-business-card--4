/**
 * my-card.html
 */
    const HOME_SCREEN_CARD_ID_KEY = 'UVACO_HOME_CARD_ID';
    const CUSTOM_JWT_KEY = 'UVACO_CUSTOM_JWT';

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

    function decodeCardIdFromJwtPayload(token) {
      try {
        const parts = String(token || '').split('.');
        if (parts.length < 2) return '';
        const raw = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = raw + (raw.length % 4 ? '='.repeat(4 - (raw.length % 4)) : '');
        const payload = JSON.parse(atob(padded));
        return normalizeRememberedCardId(payload && payload.sub);
      } catch (e) {
        return '';
      }
    }

    function getCardIdFromStoredJwt() {
      try {
        return decodeCardIdFromJwtPayload(localStorage.getItem(CUSTOM_JWT_KEY));
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

    function showStableLoginPrompt() {
      const loading = document.querySelector('.loading');
      const loadingText = document.querySelector('.loading-text');
      if (loading) loading.classList.add('needs-login');
      if (loadingText) {
        loadingText.innerHTML =
          '這支手機尚未記住您的名片。<br>' +
          '請先登入一次，開啟自己的名片後，下次從手機主畫面即可直接開啟。<br><br>' +
          '<a class="login-once-link" href="auth.html?next=my-card.html">登入一次</a>';
      }
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
        // 網址若已直接帶著 ?id=，代表這是「專屬主畫面捷徑連結」（settings 頁面產生），
        // 名片編號已經寫死在網址上，不需要再靠手機本機資料或登入狀態才能認得使用者。
        // 這樣就算手機清除了瀏覽資料，捷徑一樣能保證每次直接開啟名片。
        const urlCardId = normalizeRememberedCardId(
          new URLSearchParams(window.location.search || '').get('id')
        );
        if (urlCardId) {
          clearTimeout(loadingTimeout);
          rememberHomeCardId(urlCardId);
          redirectToCard(urlCardId);
          return;
        }

        const standaloneFallbackCardId = isStandaloneApp()
          ? (getRememberedHomeCardId() || getCardIdFromStoredJwt())
          : '';
        if (standaloneFallbackCardId) {
          rememberHomeCardId(standaloneFallbackCardId);
        }

        // 檢查是否有 Supabase 配置
        if (!window.UVACO_CLOUD || !UVACO_CLOUD.hasConfig()) {
          clearTimeout(loadingTimeout);
          if (standaloneFallbackCardId) {
            redirectToCard(standaloneFallbackCardId);
            return;
          }
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
          if (isStandaloneApp()) {
            const rememberedCardId = getRememberedHomeCardId() || standaloneFallbackCardId;
            if (rememberedCardId) {
              redirectToCard(rememberedCardId);
              return;
            }
            showStableLoginPrompt();
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
        if (isStandaloneApp()) {
          const rememberedCardId = getRememberedHomeCardId() || getCardIdFromStoredJwt();
          if (rememberedCardId) {
            rememberHomeCardId(rememberedCardId);
            redirectToCard(rememberedCardId);
            return;
          }
          showStableLoginPrompt();
          return;
        }
        redirectToLogin();
      }
    })();

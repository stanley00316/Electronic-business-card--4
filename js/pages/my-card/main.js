/**
 * my-card.html
 */
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
          window.location.replace('auth.html?next=my-card.html');
          return;
        }

        // 取得使用者 session
        const sessionResult = await UVACO_CLOUD.getSession();
        const session = sessionResult && sessionResult.session;
        const user = session && session.user;
        const userId = user ? String(user.id || '').trim() : '';

        clearTimeout(loadingTimeout);

        if (!userId) {
          // 未登入，導向登入頁
          window.location.replace('auth.html?next=my-card.html');
          return;
        }

        // 導向使用者的名片頁面
        window.location.replace('card.html?id=' + encodeURIComponent(userId));

      } catch (e) {
        console.error('載入失敗:', e);
        clearTimeout(loadingTimeout);
        // 發生錯誤，導向登入頁
        window.location.replace('auth.html?next=my-card.html');
      }
    })();

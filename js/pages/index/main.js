/**
 * index.html 導向邏輯
 */
    // 首次進站導向（雲端版）：
    // - 未登入：去 auth.html
    // - 已登入但尚未建立名片：去 edit.html onboarding
    // - 已登入且已有名片：去 directory.html
    (async function () {
      try {
        if (!window.UVACO_CLOUD || !UVACO_CLOUD.hasConfig()) {
          // 尚未配置 Supabase 時，維持原本行為：先進通訊錄
          window.location.replace('directory.html');
          return;
        }

        var p = new URLSearchParams(window.location.search || '');
        if (p.get('skipOnboarding') === '1') {
          window.location.replace('directory.html');
          return;
        }

        var s = await UVACO_CLOUD.getSession();
        if (!s.session) {
          // 回到 index.html 讓它依「是否已有名片」自動導向：
          // - 無名片：edit.html?mode=onboarding
          // - 有名片：directory.html
          // 這樣新使用者登入後不會先落到通訊錄再多一次確認視窗。
          var next = 'index.html' + (window.location.search || '');
          window.location.replace('auth.html?next=' + encodeURIComponent(next));
          return;
        }

        var my = await UVACO_CLOUD.getMyCard();
        if (!my.card) {
          window.location.replace('edit.html?mode=onboarding&next=directory.html');
          return;
        }

        window.location.replace('directory.html');
      } catch (e) {
        window.location.replace('directory.html');
      }
    })();

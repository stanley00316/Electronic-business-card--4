/**
 * auth.html
 */
    const authDebugPageStartedAt = performance.now();

    function isAuthDebugEnabled() {
      try {
        const h = window.location.hostname;
        const isLocal = h === 'localhost' || h === '127.0.0.1' ||
          h.startsWith('192.168.') || h.startsWith('172.') || h.startsWith('10.');
        const p = new URLSearchParams(window.location.search || '');
        const forcedOn = localStorage.getItem('UVACO_FORCE_AUTH_DEBUG') === '1';
        return isLocal || p.get('debugAuth') === '1' || forcedOn;
      } catch (e) {
        return false;
      }
    }

    // 一鍵開啟詳細登入診斷：不用麻煩使用者自己在網址後面加 &debugAuth=1，
    // 開發者選項按一下就好，之後不管重整或被導去 LINE 再導回來都會繼續顯示。
    function enableAuthDebugMode() {
      try { localStorage.setItem('UVACO_FORCE_AUTH_DEBUG', '1'); } catch (e) {}
      renderAuthDebugPanel();
      alert('已開啟詳細登入診斷模式。\n請重新點「用 LINE 登入」測試一次，畫面下方會即時顯示登入過程的詳細紀錄。\n測完後可以點「複製登入診斷紀錄」把內容傳給我。');
    }

    function disableAuthDebugMode() {
      try { localStorage.removeItem('UVACO_FORCE_AUTH_DEBUG'); } catch (e) {}
      const panel = document.getElementById('authDebugPanel');
      if (panel) panel.remove();
      alert('已關閉詳細登入診斷模式。');
    }

    function copyAuthDebugLog() {
      const lines = readAuthDebugPanelEvents();
      const text = lines.length ? lines.join('\n') : '（目前沒有診斷紀錄，請先開啟詳細登入診斷模式並重新測試登入一次）';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          alert('登入診斷紀錄已複製，貼給開發人員即可。');
        }).catch(function () {
          prompt('請手動複製以下內容：', text);
        });
      } else {
        prompt('請手動複製以下內容：', text);
      }
    }

    function getAuthDebugPanelStorageKey() {
      return 'UVACO_AUTH_DEBUG_PANEL_EVENTS';
    }

    function clearAuthDebugPanelEvents() {
      if (!isAuthDebugEnabled()) return;
      try {
        localStorage.removeItem(getAuthDebugPanelStorageKey());
      } catch (e) {}
    }

    function readAuthDebugPanelEvents() {
      try {
        const raw = localStorage.getItem(getAuthDebugPanelStorageKey());
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        return [];
      }
    }

    function writeAuthDebugPanelEvent(line) {
      if (!isAuthDebugEnabled()) return;
      try {
        const events = readAuthDebugPanelEvents();
        events.push(line);
        localStorage.setItem(getAuthDebugPanelStorageKey(), JSON.stringify(events.slice(-12)));
      } catch (e) {}
      renderAuthDebugPanel();
    }

    function ensureAuthDebugPanel() {
      if (!isAuthDebugEnabled()) return null;
      let panel = document.getElementById('authDebugPanel');
      if (panel) return panel;
      panel = document.createElement('pre');
      panel.id = 'authDebugPanel';
      panel.style.cssText = [
        'position:fixed',
        'left:10px',
        'right:10px',
        'bottom:10px',
        'z-index:9999',
        'max-height:34vh',
        'overflow:auto',
        'padding:10px 12px',
        'margin:0',
        'border-radius:12px',
        'background:rgba(0,0,0,.82)',
        'border:1px solid rgba(34,197,94,.45)',
        'color:#d1fae5',
        'font:12px/1.45 monospace',
        'white-space:pre-wrap',
        'word-break:break-word',
        'box-shadow:0 8px 24px rgba(0,0,0,.25)'
      ].join(';');
      document.body.appendChild(panel);
      return panel;
    }

    function renderAuthDebugPanel() {
      if (!isAuthDebugEnabled()) return;
      if (!document.body) return;
      const panel = ensureAuthDebugPanel();
      if (!panel) return;
      const lines = readAuthDebugPanelEvents();
      panel.textContent = lines.length ? lines.join('\n') : 'Auth debug panel ready';
    }

    window.__uvacoAuthDebugPanelLog = function(location, message, data) {
      if (!isAuthDebugEnabled()) return;
      const compact = [];
      if (data && data.durationMs != null) compact.push('ms=' + data.durationMs);
      if (data && data.sinceStartLineMs != null) compact.push('sinceStart=' + data.sinceStartLineMs);
      if (data && data.pageInitMs != null) compact.push('page=' + data.pageInitMs);
      if (data && data.error) compact.push('error=' + data.error);
      if (data && data.status != null) compact.push('status=' + data.status);
      if (data && data.hasSession != null) compact.push('hasSession=' + data.hasSession);
      if (data && data.handled != null) compact.push('handled=' + data.handled);
      if (data && data.action) compact.push('action=' + data.action);
      if (data && data.mode) compact.push('mode=' + data.mode);
      writeAuthDebugPanelEvent(message + ' [' + location + ']' + (compact.length ? ' ' + compact.join(' ') : ''));
    };

    function logAuthDebug(hypothesisId, location, message, data = {}, runId = 'initial') {
      try {
        if (typeof window.__uvacoAuthDebugPanelLog === 'function') {
          window.__uvacoAuthDebugPanelLog(location, message, data);
        }
      } catch (_) {}
    }

    function readStartLineDebug() {
      try {
        const raw = Number(localStorage.getItem('UVACO_DEBUG_AUTH_START_TS') || '');
        return Number.isFinite(raw) && raw > 0 ? raw : null;
      } catch (e) {
        return null;
      }
    }

    // 幫任何 Promise 加上「等太久就放棄」的保護。
    // 用途：liff.init()/liff.login() 是 LINE 官方 SDK 呼叫，不像一般 fetch 可以用 AbortController 中斷；
    // 如果 LINE App 端卡住沒回應，畫面會永遠停在「正在自動登入...」、好友感覺卡住進不去。
    // 等超過 timeoutMs 就當作失敗，讓畫面退回一般登入按鈕，不會無限期卡住。
    function withTimeout(promise, timeoutMs, timeoutValue) {
      return new Promise(function (resolve) {
        var settled = false;
        var timer = window.setTimeout(function () {
          if (settled) return;
          settled = true;
          resolve(timeoutValue);
        }, timeoutMs);
        promise.then(
          function (value) {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            resolve(value);
          },
          function (err) {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            resolve({ ok: false, error: 'LIFF_AUTO_LOGIN_THROWN', detail: String((err && err.message) || err || '') });
          }
        );
      });
    }

    // 語言切換
    function switchLang(lang) {
      setLang(lang);
      updateLangButtons(lang);
    }

    function updateLangButtons(lang) {
      const zhBtn = document.getElementById('langZhBtn');
      const enBtn = document.getElementById('langEnBtn');
      if (zhBtn && enBtn) {
        zhBtn.classList.toggle('active', lang === 'zh');
        enBtn.classList.toggle('active', lang === 'en');
      }
    }

    /* =========================================================================
     * 登入處理中畫面（避免使用者重複點擊「用 LINE 登入」）
     *
     * 規則很簡單：使用者按過一次登入之後，一直到「真的登入完成」或「真的失敗」之前，
     * 都不該再看到（也不該點得到）登入按鈕。
     * 只要 <html> 上有 auth-processing 這個 class，auth.html 的樣式就會把整張登入卡片
     * 藏起來、蓋上等待畫面（實作在 auth.html 的 <style> 與 #authProcessingOverlay）。
     * ========================================================================= */

    // 網址帶著 code + state＝這是某個 OAuth 服務導回來的 callback，登入已經在進行中。
    function isOAuthCallbackUrl() {
      try {
        var p = new URLSearchParams(window.location.search || '');
        return !!(String(p.get('code') || '').trim() && String(p.get('state') || '').trim());
      } catch (e) {
        return false;
      }
    }

    // 進一步判斷「這是我們自己送出的 LINE 官方登入頁 callback」。
    // 要跟 LIFF 自己的導回（網址會帶 liff=1）與 Google 的 callback（state 以 google_ 開頭）分開，
    // 否則會把別人的 callback 誤攔下來處理。
    function isOwnLineCallbackUrl() {
      try {
        var p = new URLSearchParams(window.location.search || '');
        var code = String(p.get('code') || '').trim();
        var state = String(p.get('state') || '').trim();
        if (!code || !state) return false;
        if (state.indexOf('google_') === 0) return false;
        if (String(p.get('liff') || '') === '1') return false;
        return true;
      } catch (e) {
        return false;
      }
    }

    function setProcessingText(titleZh, titleEn, descZh, descEn) {
      var map = {
        apTitleZh: titleZh,
        apTitleEn: titleEn,
        apDescZh: descZh,
        apDescEn: descEn
      };
      Object.keys(map).forEach(function (id) {
        if (!map[id]) return;
        var el = document.getElementById(id);
        if (el) el.textContent = map[id];
      });
    }

    function enterProcessingMode(titleZh, titleEn, descZh, descEn) {
      setProcessingText(titleZh, titleEn, descZh, descEn);
      try { document.documentElement.classList.add('auth-processing'); } catch (e) {}
    }

    // 只有在「確定不會再往下走」時才呼叫：把登入卡片放回來讓使用者重試。
    function exitProcessingMode() {
      try { document.documentElement.classList.remove('auth-processing'); } catch (e) {}
    }

    function setStatus(type, msg) {
      // 顯示錯誤訊息代表這一輪登入已經結束了，一定要先把畫面還給使用者，
      // 否則訊息會被等待遮罩蓋住，使用者只會看到一個永遠轉不完的圈圈。
      if (type !== 'ok') exitProcessingMode();
      var box = document.getElementById('statusBox');
      box.className = 'auth-status show ' + (type === 'ok' ? 'ok' : 'err');
      box.textContent = msg;
    }

    function normalizeNext(value) {
      var s = String(value || '').trim();
      if (!s || /^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('//') || s.includes('\\')) {
        return 'directory.html';
      }
      return s;
    }

    function getNextFromLiffState(params) {
      try {
        var raw = String(params.get('liff.state') || '').trim();
        if (!raw) return '';
        var queryText = raw;
        if (queryText.indexOf('?') >= 0) queryText = queryText.slice(queryText.indexOf('?') + 1);
        if (queryText.charAt(0) === '?') queryText = queryText.slice(1);
        var stateParams = new URLSearchParams(queryText);
        return stateParams.get('next') || '';
      } catch (e) {
        return '';
      }
    }

    function getNext() {
      try {
        var p = new URLSearchParams(window.location.search || '');
        return normalizeNext(p.get('next') || getNextFromLiffState(p) || 'directory.html');
      } catch (e) {
        return 'directory.html';
      }
    }

    // 手機主畫面圖示（加入主畫面後）開啟的 PWA 模式，跟一般瀏覽器分頁是「不同的儲存空間」。
    // 若在這裡切去 LINE App 再切回來，系統有時會把畫面切回一般瀏覽器而不是切回這個 PWA，
    // 導致登入成功寫入的資料進了「另一邊」，下次從主畫面圖示打開時還是看不到，又要重新登入。
    // 所以這裡偵測到是 PWA 模式時，一律跳過「切去 LINE App」，直接用網頁內登入，
    // 全程留在同一個畫面、同一份儲存空間，登入結果才能確實被主畫面圖示記住。
    function isStandaloneApp() {
      try {
        return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
          || window.navigator.standalone === true;
      } catch (e) {
        return false;
      }
    }

    // 取得推薦人 ID
    function getReferrerId() {
      try {
        var p = new URLSearchParams(window.location.search || '');
        var ref = p.get('ref');
        if (ref) {
          // 儲存到 localStorage，登入成功後使用
          localStorage.setItem('UVACO_REFERRER_ID', ref);
          return ref;
        }
        // 如果 URL 沒有，檢查 localStorage
        return localStorage.getItem('UVACO_REFERRER_ID') || null;
      } catch (e) {
        return null;
      }
    }

    // 記錄推薦關係（登入成功後呼叫）
    async function recordReferralIfNeeded() {
      const referrerId = localStorage.getItem('UVACO_REFERRER_ID');
      if (!referrerId) return;
      
      try {
        if (UVACO_CLOUD.recordReferral) {
          await UVACO_CLOUD.recordReferral(referrerId);
          // 記錄後清除，避免重複記錄
          localStorage.removeItem('UVACO_REFERRER_ID');
        }
      } catch (e) {
        console.log('[Referral] 記錄推薦失敗:', e);
      }
    }

    // Google 登入：GOOGLE_CLIENT_ID 還沒設定完成前，按鈕保持隱藏（見 auth.html #googleLoginBtn），
    // 避免使用者看到一顆點了沒反應的按鈕。等 js/cloud/constants.js 填好 Client ID 就會自動出現。
    function checkGoogleLoginAvailable() {
      try {
        var btn = document.getElementById('googleLoginBtn');
        if (btn && window.UVACO_CLOUD && UVACO_CLOUD.hasGoogleConfig && UVACO_CLOUD.hasGoogleConfig()) {
          btn.style.display = 'block';
        }
      } catch (e) {}
    }

    function startGoogle() {
      if (__uvacoLoginRedirecting) return;
      try {
        __uvacoLoginRedirecting = true;
        enterProcessingMode(
          '正在前往 Google 登入…',
          'Opening Google sign-in…',
          '請稍候，不需要重複點擊登入按鈕。',
          'Please wait — no need to tap the sign-in button again.'
        );
        if (UVACO_CLOUD.startGoogleLogin(getNext()) === false) {
          __uvacoLoginRedirecting = false;
          exitProcessingMode();
        }
      } catch (e) {
        __uvacoLoginRedirecting = false;
        setStatus('err', 'Google 登入尚未設定完成。');
      }
    }

    async function bootstrap() {
      const startedFromLineAt = readStartLineDebug();
      const hasCode = /[?&]code=/.test(window.location.search || '');
      const hasState = /[?&]state=/.test(window.location.search || '');
      const isOwnLineCallback = isOwnLineCallbackUrl();
      if (isOAuthCallbackUrl()) {
        // auth.html 的早期 script 已經先蓋上遮罩了，這裡只是補上正確文案。
        enterProcessingMode(
          '正在完成登入…',
          'Finishing sign-in…',
          '請稍候，登入已在進行中，不需要再按一次登入。',
          'Please wait — sign-in is already in progress. No need to tap again.'
        );
      }
      if (!hasCode) clearAuthDebugPanelEvents();
      renderAuthDebugPanel();
      // #region agent log
      logAuthDebug(
        'H1',
        'js/pages/auth/main.js:bootstrap:start',
        'auth bootstrap start',
        {
          hasLiffConfig: !!(window.UVACO_CLOUD && UVACO_CLOUD.hasLiffConfig && UVACO_CLOUD.hasLiffConfig()),
          hasCode,
          hasState,
          next: getNext(),
          sinceStartLineMs: startedFromLineAt ? Date.now() - startedFromLineAt : null,
          pageInitMs: Number(performance.now().toFixed(1))
        }
      );
      // #endregion

      // 初始化語言按鈕狀態
      const savedLang = localStorage.getItem('lang') || 'zh';
      updateLangButtons(savedLang);

      // 儲存邀請 Token（OAuth 跳轉後頁面重載，URL 參數會消失，所以存入 localStorage）
      try {
        const invToken = new URLSearchParams(window.location.search || '').get('invite');
        if (invToken) localStorage.setItem('UVACO_INVITE_TOKEN', invToken);
      } catch (e) {}

      // 檢查是否有推薦人
      const referrerId = getReferrerId();
      if (referrerId) {
        document.getElementById('referralBanner').style.display = 'block';
      }

      if (!window.UVACO_CLOUD || !UVACO_CLOUD.hasConfig()) {
        setStatus('err', '尚未設定 Supabase（請在 cloud.js 填入 SUPABASE_URL / SUPABASE_ANON_KEY）。');
        return;
      }

      checkGoogleLoginAvailable();

      // 處理 Google OAuth callback：一定要放在 LINE callback 處理「之前」——
      // Google 的 state 會帶 google_ 前綴，自己會先判斷這不是它的 callback 就跳過（handled:false）；
      // 但 LINE 那邊的判斷比較寬鬆（只要网址帶著 code/state 就會嘗試當成自己的 callback 處理），
      // 如果順序反過來，從 Google 導回來的網址會被 LINE 那段邏輯搶先攔截、誤判成 LINE 登入失敗。
      if (UVACO_CLOUD.finishGoogleLoginFromUrl) {
        var googleRes = await UVACO_CLOUD.finishGoogleLoginFromUrl();
        if (googleRes && googleRes.ok === false) {
          setStatus('err', 'Google 登入失敗，請重試。');
          return;
        }
        if (googleRes && googleRes.handled) {
          return;
        }
      }

      // LIFF 自動登入：從 LINE App 內開啟時免輸入帳號密碼。
      //
      // 重要：如果這次是「我們自己的 LINE 官方登入頁 callback」（網址帶 code/state、沒有 liff=1），
      // 就要整段跳過。原因有二：
      // 1) 一般瀏覽器裡 liff.isInClient() 必定是 false，這段最久會空等 8 秒（withTimeout）才放棄，
      //    使用者就是在這 8 秒裡看著登入畫面、以為失敗而再按一次登入，造成重複跳轉。
      // 2) liff.init() 自己也會去解析網址上的 code/state，跟我們自己的 callback 互搶同一組參數。
      if (!isOwnLineCallback && UVACO_CLOUD.hasLiffConfig && UVACO_CLOUD.hasLiffConfig()) {
        var liffTimedOut = false;
        try {
          setStatus('ok', '正在自動登入...');
          const liffStartedAt = performance.now();
          // 最多等 8 秒：LINE 那邊卡住沒回應時，別讓畫面永遠停在「正在自動登入...」
          var liffRes = await withTimeout(
            UVACO_CLOUD.liffAutoLogin(getNext()),
            8000,
            { ok: false, error: 'LIFF_AUTO_LOGIN_TIMEOUT' }
          );
          // #region agent log
          logAuthDebug(
            'H1',
            'js/pages/auth/main.js:bootstrap:after-liff',
            'liff auto login finished',
            {
              durationMs: Number((performance.now() - liffStartedAt).toFixed(1)),
              ok: !!(liffRes && liffRes.ok),
              handled: !!(liffRes && liffRes.handled),
              error: liffRes && liffRes.error ? liffRes.error : null,
              action: liffRes && liffRes.action ? liffRes.action : null
            }
          );
          // #endregion
          if (liffRes && liffRes.handled) return;
          if (liffRes && liffRes.ok === false
              && liffRes.error !== 'LIFF_NOT_AVAILABLE'
              && liffRes.error !== 'LIFF_NOT_IN_CLIENT') {
            console.log('[LIFF] 自動登入未成功，回退到一般登入:', liffRes.error);
            liffTimedOut = (liffRes.error === 'LIFF_AUTO_LOGIN_TIMEOUT');
          }
        } catch (e) {
          console.log('[LIFF] 初始化失敗，回退到一般登入:', e);
        }
        if (liffTimedOut) {
          // 逾時：明確告知使用者改用手動按鈕，而不是讓畫面停在「正在自動登入...」看起來像當機
          setStatus('err', '自動登入等待逾時，請點下方「用 LINE 登入」再試一次。');
        } else {
          // LIFF 失敗時清除狀態提示，繼續一般登入流程
          document.getElementById('statusBox').className = 'auth-status';
        }
      }

      // 處理 LINE OAuth callback
      const lineCallbackStartedAt = performance.now();
      var lineRes = await UVACO_CLOUD.finishLineLoginFromUrl();
      // #region agent log
      logAuthDebug(
        'H2',
        'js/pages/auth/main.js:bootstrap:after-line-callback',
        'line callback handling finished',
        {
          durationMs: Number((performance.now() - lineCallbackStartedAt).toFixed(1)),
          ok: !!(lineRes && lineRes.ok),
          handled: !!(lineRes && lineRes.handled),
          error: lineRes && lineRes.error ? lineRes.error : null,
          status: lineRes && lineRes.status ? lineRes.status : null
        }
      );
      // #endregion
      if (lineRes && lineRes.ok === false) {
        var detail = '';
        try {
          if (lineRes.status) detail += 'HTTP ' + lineRes.status + ' ';
          if (lineRes.error) detail += String(lineRes.error) + ' ';
          if (lineRes.detail) detail += JSON.stringify(lineRes.detail);
        } catch (e) {}
        setStatus('err', 'LINE 登入失敗，請重試。' + (detail ? ('\n' + detail) : ''));
        return;
      }
      
      // 如果 LINE 登入已處理跳轉，不要再執行後續跳轉
      if (lineRes && lineRes.handled) {
        return;
      }

      const getSessionStartedAt = performance.now();
      var s = await UVACO_CLOUD.getSession();
      // #region agent log
      logAuthDebug(
        'H3',
        'js/pages/auth/main.js:bootstrap:after-session',
        'session lookup finished',
        {
          durationMs: Number((performance.now() - getSessionStartedAt).toFixed(1)),
          hasSession: !!(s && s.session),
          mode: s && s.session && s.session.user ? 'authenticated' : 'anonymous',
          totalSinceBootstrapMs: Number((performance.now() - authDebugPageStartedAt).toFixed(1))
        }
      );
      // #endregion
      if (s.session) {
        // 記錄推薦關係（如果有）
        await recordReferralIfNeeded();
        // 已登入時直接領取待領取的邀請
        try {
          const tok = localStorage.getItem('UVACO_INVITE_TOKEN');
          if (tok && UVACO_CLOUD.claimCardInvite) {
            await UVACO_CLOUD.claimCardInvite(tok);
          }
        } catch (e) {
          console.log('[Invite] 自動領取失敗:', e.message || e);
        } finally {
          try { localStorage.removeItem('UVACO_INVITE_TOKEN'); } catch (e) {}
        }
        window.location.replace(getNext());
        return;
      }

      // 若從手機主畫面入口來但尚未登入，不再自動啟動 LINE。
      // 使用者需點「用 LINE 登入」，避免 LINE App / PWA 之間反覆跳轉造成畫面閃爍。
      var next = getNext();
      // 走到這裡代表這一輪沒有登入成功、也不會再自動跳轉了，
      // 一定要把等待遮罩收掉，讓使用者看得到（也按得到）登入按鈕。
      exitProcessingMode();
      if (next === 'my-card.html') {
        setStatus('ok', isStandaloneApp()
          ? '請點下方按鈕登入一次。完成後，下次從手機主畫面圖示可直接開啟名片。'
          : '請點「用 LINE 登入」登入一次。完成後，下次從手機主畫面可直接開啟名片。');
        return;
      }
    }

    // 注意：這裡不要自己土法煉鋼「先切去 LINE App，沒反應再改用其他方式」。
    // 手機上的 LINE App 是一個獨立的瀏覽器環境，跟原本這個分頁是「兩份不同的儲存空間」；
    // 登入完成後憑證只會寫進 LINE App 那一份，切回原本分頁時還是看不到登入結果，
    // 使用者只好一直重複點擊「登入」才能真正進入系統。
    // 直接交給 LINE 官方登入頁（跟電腦走同一條路），手機上它自己就會提供「用 LINE App 開啟」的
    // 官方選項，並且保證登入完成後正確導回「原本這個分頁」，不會有上述問題。

    // 「已經按過登入、正在導往 LINE / Google」的旗標。
    // 手機網路慢的時候，從按下按鈕到瀏覽器真的離開這一頁可能要好幾秒，
    // 這段期間按鈕還在畫面上，使用者很容易連按好幾次，等於同時開好幾輪登入
    // （而且每一輪都會覆蓋掉 UVACO_LINE_STATE，最後反而全部驗證失敗）。
    var __uvacoLoginRedirecting = false;

    function startLine() {
      if (__uvacoLoginRedirecting) return;
      try {
        try { localStorage.setItem('UVACO_DEBUG_AUTH_START_TS', String(Date.now())); } catch (e) {}
        var next = getNext();
        __uvacoLoginRedirecting = true;
        enterProcessingMode(
          '正在前往 LINE 登入…',
          'Opening LINE sign-in…',
          '請稍候，不需要重複點擊登入按鈕。',
          'Please wait — no need to tap the sign-in button again.'
        );
        // #region agent log
        logAuthDebug(
          'H4',
          'js/pages/auth/main.js:startLine',
          'line login button pressed',
          {
            next,
            pageAliveMs: Number((performance.now() - authDebugPageStartedAt).toFixed(1))
          }
        );
        // #endregion
        // startLineLogin() 回傳 false 代表設定有問題、根本沒有導頁（它自己會跳 alert 說明），
        // 這時要把旗標與遮罩還原，否則畫面會卡在等待中、使用者也無法重試。
        if (UVACO_CLOUD.startLineLogin(next) === false) {
          __uvacoLoginRedirecting = false;
          exitProcessingMode();
        }
      } catch (e) {
        __uvacoLoginRedirecting = false;
        setStatus('err', 'LINE 登入尚未設定完成。');
      }
    }

    async function diagAll() {
      try {
        var result = await UVACO_CLOUD.lineAuthDiag();
        setStatus('ok', 'LINE 登入診斷結果：\n' + JSON.stringify(result, null, 2));
      } catch (e) {
        setStatus('err', '診斷失敗：' + String(e && e.message ? e.message : e));
      }
    }

    function explainAuth() {
      const zhMsg = '=== LINE 登入設定說明 ===\n\n' +
        '1) Supabase SQL Editor 執行：supabase-setup.sql\n' +
        '2) Supabase Edge Functions 設定 Secrets\n' +
        '3) 部署 Edge Function：line-auth';
      
      const enMsg = '=== LINE Login Setup Guide ===\n\n' +
        '1) Run supabase-setup.sql in Supabase SQL Editor\n' +
        '2) Set Secrets in Supabase Edge Functions\n' +
        '3) Deploy Edge Function: line-auth';
      
      const lang = localStorage.getItem('lang') || 'zh';
      alert(lang === 'zh' ? zhMsg : enMsg);
    }

    function checkDevMode() {
      const h = window.location.hostname;
      if (h === 'localhost' || h === '127.0.0.1' || 
          h.startsWith('192.168.') || h.startsWith('172.') || h.startsWith('10.')) {
        const el = document.getElementById('devLoginArea');
        if (el) el.style.display = 'block';
      }
    }

    async function doDevLogin() {
      const input = document.getElementById('devJwtInput');
      const token = (input.value || '').trim();
      if (!token) {
        alert('請輸入 Token / Please enter Token');
        return;
      }
      if (!token.includes('.')) {
        alert('Token 格式不正確 / Invalid Token format');
        return;
      }
      
      if (UVACO_CLOUD.setCustomJwt(token)) {
        try {
          const s = await UVACO_CLOUD.getSession();
          if (s && s.session && s.session.user && s.session.user.id) {
            alert('Token 驗證成功 / Token verified (User ID: ' + s.session.user.id + ')');
            window.location.replace(getNext());
          } else {
            alert('Token 無效或已過期 / Token invalid or expired');
            UVACO_CLOUD.clearCustomJwt();
          }
        } catch (e) {
          alert('驗證錯誤 / Verification error: ' + e.message);
          UVACO_CLOUD.clearCustomJwt();
        }
      } else {
        alert('設定失敗 / Setup failed');
      }
    }

    bootstrap();
    checkDevMode();

window.switchLang = switchLang;
window.startLine = startLine;
window.startGoogle = startGoogle;
window.diagAll = diagAll;
window.explainAuth = explainAuth;
window.doDevLogin = doDevLogin;
window.enableAuthDebugMode = enableAuthDebugMode;
window.disableAuthDebugMode = disableAuthDebugMode;
window.copyAuthDebugLog = copyAuthDebugLog;

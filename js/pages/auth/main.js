/**
 * auth.html
 */
    const authDebugPageStartedAt = performance.now();

    function getAuthDebugPanelStorageKey() {
      return 'UVACO_AUTH_DEBUG_PANEL_EVENTS';
    }

    function clearAuthDebugPanelEvents() {
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
      try {
        const events = readAuthDebugPanelEvents();
        events.push(line);
        localStorage.setItem(getAuthDebugPanelStorageKey(), JSON.stringify(events.slice(-12)));
      } catch (e) {}
      renderAuthDebugPanel();
    }

    function ensureAuthDebugPanel() {
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
      if (!document.body) return;
      const panel = ensureAuthDebugPanel();
      const lines = readAuthDebugPanelEvents();
      panel.textContent = lines.length ? lines.join('\n') : 'Auth debug panel ready';
    }

    window.__uvacoAuthDebugPanelLog = function(location, message, data) {
      const compact = [];
      if (data && data.durationMs != null) compact.push('ms=' + data.durationMs);
      if (data && data.sinceStartLineMs != null) compact.push('sinceStart=' + data.sinceStartLineMs);
      if (data && data.pageInitMs != null) compact.push('page=' + data.pageInitMs);
      if (data && data.error) compact.push('error=' + data.error);
      if (data && data.status != null) compact.push('status=' + data.status);
      if (data && data.hasSession != null) compact.push('hasSession=' + data.hasSession);
      if (data && data.handled != null) compact.push('handled=' + data.handled);
      if (data && data.action) compact.push('action=' + data.action);
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

    function setStatus(type, msg) {
      var box = document.getElementById('statusBox');
      box.className = 'auth-status show ' + (type === 'ok' ? 'ok' : 'err');
      box.textContent = msg;
    }

    function getNext() {
      try {
        var p = new URLSearchParams(window.location.search || '');
        return p.get('next') || 'directory.html';
      } catch (e) {
        return 'directory.html';
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

    async function bootstrap() {
      const startedFromLineAt = readStartLineDebug();
      const hasCode = /[?&]code=/.test(window.location.search || '');
      const hasState = /[?&]state=/.test(window.location.search || '');
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

      // 檢查是否有推薦人
      const referrerId = getReferrerId();
      if (referrerId) {
        document.getElementById('referralBanner').style.display = 'block';
      }

      if (!window.UVACO_CLOUD || !UVACO_CLOUD.hasConfig()) {
        setStatus('err', '尚未設定 Supabase（請在 cloud.js 填入 SUPABASE_URL / SUPABASE_ANON_KEY）。');
        return;
      }

      // LIFF 自動登入：從 LINE App 內開啟時免輸入帳號密碼
      if (UVACO_CLOUD.hasLiffConfig && UVACO_CLOUD.hasLiffConfig()) {
        try {
          setStatus('ok', '正在自動登入...');
          const liffStartedAt = performance.now();
          var liffRes = await UVACO_CLOUD.liffAutoLogin(getNext());
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
          }
        } catch (e) {
          console.log('[LIFF] 初始化失敗，回退到一般登入:', e);
        }
        // LIFF 失敗時清除狀態提示，繼續一般登入流程
        document.getElementById('statusBox').className = 'auth-status';
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
        window.location.replace(getNext());
        return;
      }

      // 如果未登入且來源是「我的名片」(next=my-card.html)，自動啟動 LINE 登入
      // 這讓 PWA 用戶開啟 app 後直接進入 LINE 登入，無需點擊按鈕
      var next = getNext();
      if (next === 'my-card.html') {
        startLine();
        return;
      }
    }

    function startLine() {
      try {
        try { localStorage.setItem('UVACO_DEBUG_AUTH_START_TS', String(Date.now())); } catch (e) {}
        // #region agent log
        logAuthDebug(
          'H4',
          'js/pages/auth/main.js:startLine',
          'line login button pressed',
          {
            next: getNext(),
            pageAliveMs: Number((performance.now() - authDebugPageStartedAt).toFixed(1))
          }
        );
        // #endregion
        UVACO_CLOUD.startLineLogin(getNext());
      } catch (e) {
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
window.diagAll = diagAll;
window.explainAuth = explainAuth;
window.doDevLogin = doDevLogin;

/**
 * auth.html
 */
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
          var liffRes = await UVACO_CLOUD.liffAutoLogin(getNext());
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
      var lineRes = await UVACO_CLOUD.finishLineLoginFromUrl();
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

      var s = await UVACO_CLOUD.getSession();
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

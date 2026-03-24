const SENTRY_DSN = ''; // 填入你的 Sentry DSN，例如：https://xxx@xxx.ingest.sentry.io/xxx

// 初始化 Sentry（如果已配置）
(function initSentry() {
  if (!SENTRY_DSN) return;
  if (typeof Sentry === 'undefined') {
    console.warn('[Sentry] SDK 未載入，請在 HTML 加入 Sentry script');
    return;
  }
  
  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: location.hostname.includes('github.io') ? 'production' : 'development',
      release: '2026.01.26',
      tracesSampleRate: 0.1, // 10% 的請求追蹤效能
      beforeSend(event) {
        // 過濾掉一些不重要的錯誤
        if (event.exception) {
          const msg = event.exception.values?.[0]?.value || '';
          // 忽略網路錯誤（這些通常是用戶端問題）
          if (msg.includes('Load failed') || msg.includes('NetworkError')) {
            return null;
          }
        }
        return event;
      }
    });
    console.log('[Sentry] 錯誤監控已啟用');
  } catch (e) {
    console.error('[Sentry] 初始化失敗', e);
  }
})();

// 全域錯誤捕獲（即使 Sentry 未啟用也會記錄到 console）
window.onerror = function(message, source, lineno, colno, error) {
  console.error('[Error]', { message, source, lineno, colno, error });
  // 如果 Sentry 已初始化，它會自動捕獲這個錯誤
  return false;
};

window.onunhandledrejection = function(event) {
  console.error('[Unhandled Promise Rejection]', event.reason);
  // 如果 Sentry 已初始化，它會自動捕獲這個錯誤
};

export {};

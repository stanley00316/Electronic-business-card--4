(function initServiceWorkerUpdateListener() {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('message', function(event) {
      if (event.data && event.data.type === 'SW_UPDATED') {
        console.log('[SW] 檢測到新版本:', event.data.version);
        // 自動重新載入頁面以獲取最新版本
        window.location.reload();
      }
    });
  }
})();
export {};

(function initServiceWorkerUpdateListener() {
  const TOAST_ID = 'uvacoSwUpdateToast';
  const STYLE_ID = 'uvacoSwUpdateStyle';
  const UPDATE_MESSAGE_TYPES = ['SW_UPDATED', 'SW_UPDATE_AVAILABLE'];
  let pendingVersion = '';

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function ensureToastStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${TOAST_ID} {
        position: fixed;
        left: 16px;
        right: 16px;
        bottom: max(16px, env(safe-area-inset-bottom));
        z-index: 2147483000;
        max-width: 560px;
        margin: 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px;
        color: #f9fafb;
        background: rgba(17, 24, 39, .96);
        border: 1px solid rgba(34, 197, 94, .38);
        border-radius: 8px;
        box-shadow: 0 18px 42px rgba(0, 0, 0, .36);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${TOAST_ID} .uvaco-sw-update-text {
        min-width: 0;
        font-size: 13px;
        line-height: 1.5;
      }
      #${TOAST_ID} .uvaco-sw-update-title {
        display: block;
        color: #bbf7d0;
        font-size: 13px;
        font-weight: 800;
      }
      #${TOAST_ID} .uvaco-sw-update-desc {
        color: #d1d5db;
      }
      #${TOAST_ID} .uvaco-sw-update-actions {
        display: flex;
        flex: 0 0 auto;
        gap: 8px;
      }
      #${TOAST_ID} button {
        min-height: 36px;
        padding: 0 12px;
        border: 0;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 800;
        cursor: pointer;
        white-space: nowrap;
      }
      #${TOAST_ID} [data-action="reload"] {
        color: #06210f;
        background: #22c55e;
      }
      #${TOAST_ID} [data-action="later"] {
        color: #e5e7eb;
        background: rgba(255, 255, 255, .1);
      }
      @media (max-width: 520px) {
        #${TOAST_ID} {
          left: 10px;
          right: 10px;
          align-items: stretch;
          flex-direction: column;
        }
        #${TOAST_ID} .uvaco-sw-update-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function removeToast() {
    const existing = document.getElementById(TOAST_ID);
    if (existing) existing.remove();
  }

  function showUpdatePrompt(version) {
    pendingVersion = version || pendingVersion || 'latest';

    onReady(function() {
      ensureToastStyle();
      removeToast();

      const toast = document.createElement('div');
      toast.id = TOAST_ID;
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      toast.innerHTML = `
        <div class="uvaco-sw-update-text">
          <span class="uvaco-sw-update-title">已有新版可使用</span>
          <span class="uvaco-sw-update-desc">等目前操作告一段落後，再按更新即可套用。</span>
        </div>
        <div class="uvaco-sw-update-actions">
          <button type="button" data-action="later">稍後</button>
          <button type="button" data-action="reload">更新</button>
        </div>
      `;

      toast.querySelector('[data-action="later"]').addEventListener('click', removeToast);
      toast.querySelector('[data-action="reload"]').addEventListener('click', function() {
        try {
          localStorage.setItem('UVACO_SW_ACCEPTED_VERSION', pendingVersion);
        } catch (_) {}
        window.location.reload();
      });

      document.body.appendChild(toast);
    });
  }

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('message', function(event) {
      const data = event.data || {};
      if (UPDATE_MESSAGE_TYPES.includes(data.type)) {
        console.log('[SW] 檢測到新版本:', data.version);
        showUpdatePrompt(data.version);
      }
    });
  }
})();
export {};

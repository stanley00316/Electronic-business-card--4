// 數位身分平台 - Service Worker
// 版本號：每次更新資源時需要更新此版本
const CACHE_VERSION = 'v1.1.0';
const CACHE_NAME = `digital-identity-${CACHE_VERSION}`;

// 需要快取的靜態資源
const STATIC_ASSETS = [
  './',
  './index.html',
  './auth.html',
  './edit.html',
  './card.html',
  './directory.html',
  './settings.html',
  './privacy.html',
  './styles.css',
  './common.js',
  './cloud.js',
  './uvaco-logo.svg',
  './default-avatar.svg',
  './icon-192.svg',
  './icon-512.svg',
  // 主題 CSS
  './theme-1.css',
  './theme-2.css',
  './theme-3.css',
  './theme-4.css',
  './theme-5.css',
  './theme-6.css',
  './theme-7.css',
  './theme-8.css',
  './theme-9.css',
  // 社群圖示
  './line-logo.svg',
  './facebook-logo.svg',
  './instagram-logo.svg',
  './youtube-logo.svg',
  './twitter-logo.svg',
  './linkedin-logo.svg',
  './wechat-logo.svg',
  './whatsapp-logo.svg',
  './email-icon.svg',
  './phone-icon.svg',
  './mobile-icon.svg',
  './website-icon.svg',
  './file-icon.svg'
];

// 安裝事件：快取靜態資源
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Static assets cached');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Failed to cache:', error);
      })
  );
});

// 啟動事件：清理舊快取
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('digital-identity-') && name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated');
        return self.clients.claim();
      })
  );
});

// 判斷是否為靜態資源
function isStaticAsset(pathname) {
  // 檢查是否為已知的靜態資源
  return STATIC_ASSETS.some(asset => {
    const assetPath = asset.replace('./', '/');
    return pathname === assetPath || pathname.endsWith(assetPath);
  });
}

// 請求攔截：靜態資源快取優先，其他網路優先
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 只處理同源請求
  if (url.origin !== location.origin) {
    return;
  }

  // API 請求不快取（Supabase 等）
  if (url.pathname.includes('/functions/') || 
      url.pathname.includes('/rest/') ||
      url.pathname.includes('/storage/')) {
    return;
  }

  // 靜態資源使用 Cache First 策略（快取優先，大幅提升手機載入速度）
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            // 有快取，直接返回（同時背景更新）
            fetch(request).then((response) => {
              if (response.ok) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, response);
                });
              }
            }).catch(() => {});
            return cachedResponse;
          }
          // 無快取，從網路取得
          return fetch(request).then((response) => {
            if (response.ok) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return response;
          });
        })
        .catch(() => {
          return new Response('Offline', { status: 503 });
        })
    );
    return;
  }

  // 其他請求使用 Network First 策略
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(request, responseClone);
            });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request)
          .then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            if (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) {
              return caches.match('./index.html');
            }
            return new Response('Offline', { status: 503 });
          });
      })
  );
});

// 訊息處理：手動更新快取
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

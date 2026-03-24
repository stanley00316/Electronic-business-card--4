export const ANALYTICS_CONFIG = {
  enabled: true,
  provider: 'cloudflare',
  cloudflare: {
    token: '32d77b5b3e864374950c6bd32227e3c9'
  },
  plausible: {
    domain: 'stanley00316.github.io',
    scriptUrl: 'https://plausible.io/js/script.js'
  },
  umami: {
    websiteId: '',
    scriptUrl: ''
  },
  ga: {
    measurementId: ''
  }
};

(function initAnalytics() {
  if (!ANALYTICS_CONFIG.enabled) return;

  const provider = ANALYTICS_CONFIG.provider;

  if (provider === 'cloudflare' && ANALYTICS_CONFIG.cloudflare.token) {
    const script = document.createElement('script');
    script.defer = true;
    script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    script.setAttribute('data-cf-beacon', JSON.stringify({
      token: ANALYTICS_CONFIG.cloudflare.token
    }));
    document.head.appendChild(script);
    console.log('[Analytics] Cloudflare Web Analytics 已啟用');
  }

  if (provider === 'plausible' && ANALYTICS_CONFIG.plausible.domain) {
    const script = document.createElement('script');
    script.defer = true;
    script.setAttribute('data-domain', ANALYTICS_CONFIG.plausible.domain);
    script.src = ANALYTICS_CONFIG.plausible.scriptUrl;
    document.head.appendChild(script);
    console.log('[Analytics] Plausible 已啟用');
  }

  if (provider === 'umami' && ANALYTICS_CONFIG.umami.websiteId) {
    const script = document.createElement('script');
    script.async = true;
    script.setAttribute('data-website-id', ANALYTICS_CONFIG.umami.websiteId);
    script.src = ANALYTICS_CONFIG.umami.scriptUrl;
    document.head.appendChild(script);
    console.log('[Analytics] Umami 已啟用');
  }

  if (provider === 'ga' && ANALYTICS_CONFIG.ga.measurementId) {
    const gtagScript = document.createElement('script');
    gtagScript.async = true;
    gtagScript.src = `https://www.googletagmanager.com/gtag/js?id=${ANALYTICS_CONFIG.ga.measurementId}`;
    document.head.appendChild(gtagScript);

    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    gtag('js', new Date());
    gtag('config', ANALYTICS_CONFIG.ga.measurementId);
    window.gtag = gtag;
    console.log('[Analytics] Google Analytics 已啟用');
  }
})();

export function trackEvent(eventName, eventData = {}) {
  if (!ANALYTICS_CONFIG.enabled) return;

  const provider = ANALYTICS_CONFIG.provider;

  if (provider === 'plausible' && window.plausible) {
    window.plausible(eventName, { props: eventData });
  }

  if (provider === 'umami' && window.umami) {
    window.umami.track(eventName, eventData);
  }

  if (provider === 'ga' && window.gtag) {
    window.gtag('event', eventName, eventData);
  }

  console.log('[Analytics] Event:', eventName, eventData);
}

(()=>{(function(){let e="uvacoSwUpdateToast",o="uvacoSwUpdateStyle",n=["SW_UPDATED","SW_UPDATE_AVAILABLE"],a="";function c(i){document.readyState==="loading"?document.addEventListener("DOMContentLoaded",i,{once:!0}):i()}function r(){if(document.getElementById(o))return;let i=document.createElement("style");i.id=o,i.textContent=`
      #${e} {
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
      #${e} .uvaco-sw-update-text {
        min-width: 0;
        font-size: 13px;
        line-height: 1.5;
      }
      #${e} .uvaco-sw-update-title {
        display: block;
        color: #bbf7d0;
        font-size: 13px;
        font-weight: 800;
      }
      #${e} .uvaco-sw-update-desc {
        color: #d1d5db;
      }
      #${e} .uvaco-sw-update-actions {
        display: flex;
        flex: 0 0 auto;
        gap: 8px;
      }
      #${e} button {
        min-height: 36px;
        padding: 0 12px;
        border: 0;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 800;
        cursor: pointer;
        white-space: nowrap;
      }
      #${e} [data-action="reload"] {
        color: #06210f;
        background: #22c55e;
      }
      #${e} [data-action="later"] {
        color: #e5e7eb;
        background: rgba(255, 255, 255, .1);
      }
      @media (max-width: 520px) {
        #${e} {
          left: 10px;
          right: 10px;
          align-items: stretch;
          flex-direction: column;
        }
        #${e} .uvaco-sw-update-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
        }
      }
    `,document.head.appendChild(i)}function u(){let i=document.getElementById(e);i&&i.remove()}function p(i){a=i||a||"latest",c(function(){r(),u();let l=document.createElement("div");l.id=e,l.setAttribute("role","status"),l.setAttribute("aria-live","polite"),l.innerHTML=`
        <div class="uvaco-sw-update-text">
          <span class="uvaco-sw-update-title">\u5DF2\u6709\u65B0\u7248\u53EF\u4F7F\u7528</span>
          <span class="uvaco-sw-update-desc">\u7B49\u76EE\u524D\u64CD\u4F5C\u544A\u4E00\u6BB5\u843D\u5F8C\uFF0C\u518D\u6309\u66F4\u65B0\u5373\u53EF\u5957\u7528\u3002</span>
        </div>
        <div class="uvaco-sw-update-actions">
          <button type="button" data-action="later">\u7A0D\u5F8C</button>
          <button type="button" data-action="reload">\u66F4\u65B0</button>
        </div>
      `,l.querySelector('[data-action="later"]').addEventListener("click",u),l.querySelector('[data-action="reload"]').addEventListener("click",function(){try{localStorage.setItem("UVACO_SW_ACCEPTED_VERSION",a)}catch{}window.location.reload()}),document.body.appendChild(l)})}"serviceWorker"in navigator&&navigator.serviceWorker.controller&&navigator.serviceWorker.addEventListener("message",function(i){let l=i.data||{};n.includes(l.type)&&(console.log("[SW] \u6AA2\u6E2C\u5230\u65B0\u7248\u672C:",l.version),p(l.version))})})();(function(){function e(){let n=document.querySelector(".bottom-nav");if(!n)return;let a=n.querySelectorAll(".nav-item");a.length&&a.forEach(function(c){c.addEventListener("touchstart",function(){this.classList.add("tapped")},{passive:!0}),c.addEventListener("touchend",function(){let r=this;setTimeout(function(){r.classList.remove("tapped")},300)},{passive:!0}),c.addEventListener("touchcancel",function(){this.classList.remove("tapped")},{passive:!0}),c.addEventListener("mousedown",function(){this.classList.add("tapped")}),c.addEventListener("mouseup",function(){let r=this;setTimeout(function(){r.classList.remove("tapped")},300)}),c.addEventListener("mouseleave",function(){this.classList.remove("tapped")})})}function o(){e(),setTimeout(e,300)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",o):o()})();window.onerror=function(t,e,o,n,a){return console.error("[Error]",{message:t,source:e,lineno:o,colno:n,error:a}),!1};window.onunhandledrejection=function(t){console.error("[Unhandled Promise Rejection]",t.reason)};var s={enabled:!0,provider:"cloudflare",cloudflare:{token:"32d77b5b3e864374950c6bd32227e3c9"},plausible:{domain:"stanley00316.github.io",scriptUrl:"https://plausible.io/js/script.js"},umami:{websiteId:"",scriptUrl:""},ga:{measurementId:""}};(function(){if(!s.enabled)return;let e=s.provider;if(e==="cloudflare"&&s.cloudflare.token){let o=document.createElement("script");o.defer=!0,o.src="https://static.cloudflareinsights.com/beacon.min.js",o.setAttribute("data-cf-beacon",JSON.stringify({token:s.cloudflare.token})),document.head.appendChild(o),console.log("[Analytics] Cloudflare Web Analytics \u5DF2\u555F\u7528")}if(e==="plausible"&&s.plausible.domain){let o=document.createElement("script");o.defer=!0,o.setAttribute("data-domain",s.plausible.domain),o.src=s.plausible.scriptUrl,document.head.appendChild(o),console.log("[Analytics] Plausible \u5DF2\u555F\u7528")}if(e==="umami"&&s.umami.websiteId){let o=document.createElement("script");o.async=!0,o.setAttribute("data-website-id",s.umami.websiteId),o.src=s.umami.scriptUrl,document.head.appendChild(o),console.log("[Analytics] Umami \u5DF2\u555F\u7528")}if(e==="ga"&&s.ga.measurementId){let n=function(){dataLayer.push(arguments)},o=document.createElement("script");o.async=!0,o.src=`https://www.googletagmanager.com/gtag/js?id=${s.ga.measurementId}`,document.head.appendChild(o),window.dataLayer=window.dataLayer||[],n("js",new Date),n("config",s.ga.measurementId),window.gtag=n,console.log("[Analytics] Google Analytics \u5DF2\u555F\u7528")}})();function B(t,e={}){if(!s.enabled)return;let o=s.provider;o==="plausible"&&window.plausible&&window.plausible(t,{props:e}),o==="umami"&&window.umami&&window.umami.track(t,e),o==="ga"&&window.gtag&&window.gtag("event",t,e),console.log("[Analytics] Event:",t,e)}function w(t){if(document.body.classList.remove("lang-zh","lang-en"),document.body.classList.add("lang-"+t),document.querySelectorAll(".lang-btn").forEach(n=>n.classList.remove("lang-active")),t==="zh"){let n=document.querySelectorAll(".lang-btn");n[0]&&n[0].classList.add("lang-active")}else{let n=document.querySelectorAll(".lang-btn");n[1]&&n[1].classList.add("lang-active")}let e=document.getElementById("langZhBtn"),o=document.getElementById("langEnBtn");e&&o&&(e.classList.remove("active"),o.classList.remove("active"),t==="zh"?e.classList.add("active"):o.classList.add("active")),document.querySelectorAll(".lang-zh").forEach(n=>{n.style.display=t==="zh"?"block":"none"}),document.querySelectorAll(".lang-en").forEach(n=>{n.style.display=t==="en"?"block":"none"}),document.querySelectorAll(".settings-panel .lang-zh").forEach(n=>{n.style.display=t==="zh"?"block":"none"}),document.querySelectorAll(".settings-panel .lang-en").forEach(n=>{n.style.display=t==="en"?"block":"none"}),document.querySelectorAll(".bottom-nav .lang-zh").forEach(n=>{n.style.display=t==="zh"?"block":"none"}),document.querySelectorAll(".bottom-nav .lang-en").forEach(n=>{n.style.display=t==="en"?"block":"none"}),document.querySelectorAll(".settings-panel .lang-zh").forEach(n=>{n.style.display=t==="zh"?"block":"none"}),document.querySelectorAll(".settings-panel .lang-en").forEach(n=>{n.style.display=t==="en"?"block":"none"}),document.querySelectorAll(".directory-page .lang-zh").forEach(n=>{n.style.display=t==="zh"?"block":"none"}),document.querySelectorAll(".directory-page .lang-en").forEach(n=>{n.style.display=t==="en"?"block":"none"}),I(),typeof updateNavList=="function"&&updateNavList(),localStorage.setItem("lang",t)}var f={loaded:new Set,preloading:new Set};function L(t){let e=document.getElementById("theme-css");if(e&&e.remove(),t>=1&&t<=14){let o=document.createElement("link");o.id="theme-css",o.rel="stylesheet",o.href=`theme-${t}.css`,document.head.appendChild(o),f.loaded.add(t)}}function A(t){if(t<1||t>14||f.loaded.has(t)||f.preloading.has(t)||document.getElementById(`theme-preload-${t}`))return;f.preloading.add(t);let o=document.createElement("link");o.id=`theme-preload-${t}`,o.rel="preload",o.as="style",o.href=`theme-${t}.css`,o.onload=()=>{f.preloading.delete(t),f.loaded.add(t)},document.head.appendChild(o)}function _(){let t=e=>{e>14||(A(e),window.requestIdleCallback?requestIdleCallback(()=>t(e+1),{timeout:100}):setTimeout(()=>t(e+1),50))};setTimeout(()=>t(1),500)}function m(t){document.body.classList.remove("theme-dark","theme-light","theme-1","theme-2","theme-3","theme-4","theme-5","theme-6","theme-7","theme-8","theme-9","theme-10","theme-11","theme-12","theme-13","theme-14"),t>=1&&t<=14?(document.body.classList.add(t===2||t===7||t===9||t===11?"theme-light":"theme-dark"),document.body.classList.add("theme-"+t),L(t)):t==="light"?(document.body.classList.add("theme-light"),L(2),t=2):(document.body.classList.add("theme-dark"),L(1),t=1),localStorage.setItem("theme",t),T(t)}function T(t){document.querySelectorAll(".theme-selector-btn").forEach(o=>{o.classList.remove("active")});let e=document.querySelector(`.theme-selector-btn[data-theme="${t}"]`);e&&e.classList.add("active")}function O(t){let e=localStorage.getItem("lang")||"zh",o=localStorage.getItem("theme")||"1";w(e);let n=parseInt(o);isNaN(n)&&(n=o==="light"?2:1),m(n);let a=document.getElementById("previewCard");a&&t&&(C(t),a.classList.add("card-theme-"+t))}function C(t){if(t<1||t>14)return;let e=`owner-theme-${t}`;if(!document.getElementById(e)){let o=document.createElement("link");o.id=e,o.rel="stylesheet",o.href=`theme-${t}.css`,document.head.appendChild(o)}}function q(){let t=localStorage.getItem("lang")||"zh",e=localStorage.getItem("theme")||"1";w(t);let o=parseInt(e);isNaN(o)&&(o=e==="light"?2:1),m(o)}function I(){let t=document.querySelectorAll(".lang-zh"),e=t.length>0&&t[0].style.display!=="none"?"zh":"en",o=e==="zh"?"data-lang-zh":"data-lang-en",n=document.getElementById("directorySearchInput");if(n){let a=e==="zh"?n.getAttribute("data-placeholder-zh"):n.getAttribute("data-placeholder-en");a&&n.setAttribute("placeholder",a)}document.querySelectorAll("input[data-placeholder-zh], textarea[data-placeholder-zh]").forEach(a=>{let c=e==="zh"?a.getAttribute("data-placeholder-zh"):a.getAttribute("data-placeholder-en");c&&a.setAttribute("placeholder",c)}),document.querySelectorAll("[data-placeholder-zh][data-placeholder-en]").forEach(a=>{if(a===n)return;let c=(a.tagName||"").toLowerCase();if(c!=="input"&&c!=="textarea")return;let r=e==="zh"?a.getAttribute("data-placeholder-zh"):a.getAttribute("data-placeholder-en");r&&a.setAttribute("placeholder",r)}),document.querySelectorAll(".directory-filter-select").forEach(a=>{a.querySelectorAll("option").forEach(c=>{let r=c.getAttribute(o);r&&(c.textContent=r)})}),document.querySelectorAll(".add-friend-form-select").forEach(a=>{a.querySelectorAll("option").forEach(c=>{let r=c.getAttribute(o);r&&(c.textContent=r)})})}var S=(function(){return typeof IntersectionObserver>"u"?null:new IntersectionObserver((t,e)=>{t.forEach(o=>{if(o.isIntersecting){let n=o.target,a=n.dataset.src;a&&(n.src=a,n.removeAttribute("data-src"),n.classList.remove("lazy"),n.classList.add("lazy-loaded")),e.unobserve(n)}})},{rootMargin:"50px 0px",threshold:.01})})();function U(t,e){if(!(!t||!e)){if("loading"in HTMLImageElement.prototype){t.loading="lazy",t.src=e;return}S?(t.dataset.src=e,t.classList.add("lazy"),S.observe(t)):t.src=e}}function P(){S&&document.querySelectorAll("img[data-src]").forEach(t=>{S.observe(t)})}async function D(t,e){let o=Math.max(64,parseInt(e?.maxDim||512,10)||512),n=Math.max(50*1024,parseInt(e?.maxBytes||1024*1024,10)||1024*1024),a=String(e?.mime||"image/webp");if(!t||!t.type&&!(t instanceof Blob))throw new Error("NOT_IMAGE");if(t.type&&!t.type.startsWith("image/"))throw new Error("NOT_IMAGE");let c=URL.createObjectURL(t);try{let r=new Image;r.decoding="async",r.src=c,await new Promise((g,h)=>{r.onload=g,r.onerror=()=>h(new Error("LOAD_FAILED"))});let u=r.naturalWidth||r.width||1,p=r.naturalHeight||r.height||1,i=o,l=a,d=null,b=0,v=0,x=document.createElement("canvas"),z=x.getContext("2d",{alpha:!0});async function E(g){return await new Promise(h=>x.toBlob(h,l,g))}for(let g=0;g<6;g++){let h=Math.min(1,i/Math.max(u,p));b=Math.max(1,Math.round(u*h)),v=Math.max(1,Math.round(p*h)),x.width=b,x.height=v,z.clearRect(0,0,b,v),z.drawImage(r,0,0,b,v),l=a;let y=.9;if(d=await E(y),d||(l="image/jpeg",y=.9,d=await E(y)),!d)throw new Error("ENCODE_FAILED");for(;d.size>n&&y>.3&&(y-=.1,d=await E(y),!!d););if(d&&d.size<=n)break;if(i=Math.floor(i*.75),i<64)throw new Error("TOO_LARGE")}if(!d||d.size>n)throw new Error("TOO_LARGE");return{blob:d,contentType:l,ext:l==="image/webp"?"webp":l==="image/jpeg"?"jpg":"png",width:b,height:v}}finally{URL.revokeObjectURL(c)}}function M(){let t=document.createElement("canvas");return t.width=1,t.height=1,t.toDataURL("image/webp").indexOf("data:image/webp")===0}function R(){try{let t=window.location&&window.location.pathname?window.location.pathname:"";if(!/edit\.html$/i.test(t))return;let e=document.getElementById("previewContacts");if(!e||document.getElementById("contactLayoutListBtn")||document.querySelector(".contact-layout-toolbar"))return;if(!document.getElementById("uvaco-contact-layout-style")){let r=document.createElement("style");r.id="uvaco-contact-layout-style",r.textContent=`
        .contact-layout-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:-8px;margin-bottom:10px}
        .contact-layout-label{font-size:12px;letter-spacing:.12em;opacity:.85;user-select:none}
        body.theme-dark .contact-layout-label{color:#9ca3af}
        body.theme-light .contact-layout-label{color:#6b7280}
        .contact-layout-toggle{display:inline-flex;gap:6px;padding:6px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.15);backdrop-filter:blur(10px)}
        body.theme-light .contact-layout-toggle{background:rgba(255,255,255,.75);border-color:rgba(15,23,42,.10)}
        .contact-layout-btn{border:none;border-radius:999px;padding:8px 12px;font-size:13px;cursor:pointer;background:transparent;color:inherit;opacity:.9;transition:.2s}
        .contact-layout-btn.is-active{background:rgba(var(--uvaco-green-rgb),.20);color:var(--uvaco-green);opacity:1}
        .contact-layout-btn:hover{transform:translateY(-1px)}
        /* Grid mode\uFF1A\u56FA\u5B9A\u81F3\u5C11 3 \u5F35\uFF1B\u5BEC\u5EA6\u5920\u5C31 4 \u5F35\uFF08\u4E0D\u5141\u8A31 2/1\uFF09 */
        .btn-group.contact-layout-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
        @media (min-width:980px){.btn-group.contact-layout-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
        .btn-group.contact-layout-grid .btn{border-radius:18px;height:92px;font-size:clamp(11px,2.6vw,14px);line-height:1.15;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:10px;padding:14px 12px;text-align:center;overflow:hidden;white-space:normal}
        .btn-group.contact-layout-grid .btn .contact-btn-label{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;word-break:break-word;overflow-wrap:anywhere}
        .btn-group.contact-layout-grid .btn img{margin:0 auto;display:block}
        /* Grid \u5C3E\u5217\u88DC\u6EFF\uFF1A\u907F\u514D 3 \u6B04\u6642\u6700\u5F8C\u4E00\u6392\u7559\u5927\u7A7A\u767D */
        .btn-group.contact-layout-grid .contact-btn-wrapper{min-width:0}
        .btn-group.contact-layout-grid .contact-btn-wrapper:nth-last-of-type(1):nth-of-type(3n+1){grid-column:1/-1}
        .btn-group.contact-layout-grid .contact-btn-wrapper:nth-last-of-type(1):nth-of-type(3n+2){grid-column:span 2}
        @media (min-width:980px){
          .btn-group.contact-layout-grid .contact-btn-wrapper:nth-last-of-type(1):nth-of-type(4n+1){grid-column:1/-1}
          .btn-group.contact-layout-grid .contact-btn-wrapper:nth-last-of-type(1):nth-of-type(4n+2){grid-column:span 3}
          .btn-group.contact-layout-grid .contact-btn-wrapper:nth-last-of-type(1):nth-of-type(4n+3){grid-column:span 2}
        }
        .btn-group.contact-layout-grid .btn:hover{transform:translateY(-1px)}
      `,document.head.appendChild(r)}let o=document.createElement("div");o.className="contact-layout-toolbar",o.innerHTML=`
      <div class="contact-layout-label">
        <span class="lang-zh">\u986F\u793A\u65B9\u5F0F</span><span class="lang-en">Layout</span>
      </div>
      <div class="contact-layout-toggle" role="group" aria-label="Contact layout">
        <button type="button" class="contact-layout-btn" id="contactLayoutListBtn">
          <span class="lang-zh">\u5217\u8868</span><span class="lang-en">List</span>
        </button>
        <button type="button" class="contact-layout-btn" id="contactLayoutGridBtn">
          <span class="lang-zh">\u5C0F\u5361</span><span class="lang-en">Cards</span>
        </button>
      </div>
    `,e.parentNode.insertBefore(o,e);let n=()=>{try{return String(localStorage.getItem("UVACO_CONTACT_LAYOUT")||"").toLowerCase()==="grid"?"grid":"list"}catch{return"list"}};typeof window.applyContactLayout!="function"&&(window.applyContactLayout=function(r){let u=r==="grid"?"grid":"list",p=document.getElementById("previewContacts"),i=document.getElementById("contactLayoutListBtn"),l=document.getElementById("contactLayoutGridBtn");p&&p.classList.toggle("contact-layout-grid",u==="grid"),i&&i.classList.toggle("is-active",u==="list"),l&&l.classList.toggle("is-active",u==="grid")}),typeof window.setContactLayout!="function"&&(window.setContactLayout=function(r){window.__uvacoContactLayout=r==="grid"?"grid":"list";try{localStorage.setItem("UVACO_CONTACT_LAYOUT",window.__uvacoContactLayout)}catch{}typeof window.applyContactLayout=="function"&&window.applyContactLayout(window.__uvacoContactLayout)}),window.__uvacoContactLayout=window.__uvacoContactLayout||n();let a=document.getElementById("contactLayoutListBtn"),c=document.getElementById("contactLayoutGridBtn");a&&a.addEventListener("click",()=>window.setContactLayout("list")),c&&c.addEventListener("click",()=>window.setContactLayout("grid")),typeof window.applyContactLayout=="function"&&window.applyContactLayout(window.__uvacoContactLayout);try{let r=localStorage.getItem("lang")||"zh";w(r)}catch{}}catch{}}function W(){let e=new URLSearchParams(window.location.search).get("cardTheme");if(e){let o=parseInt(e);o>=1&&o<=9&&m(o)}}function j(){let t=document.querySelector(".card");if(t&&t.dataset.cardTheme){let e=parseInt(t.dataset.cardTheme);e>=1&&e<=9&&m(e)}}function $(){new URLSearchParams(window.location.search).get("cardTheme")?W():j()}window.setLang=w;window.setTheme=m;window.preloadAllThemes=_;window.initViewerPage=O;window.loadThemeCSS=L;window.preloadThemeCSS=A;window.loadOwnerThemeCSS=C;window.updateThemeButtons=T;window.updateDirectorySelectOptions=I;window.setupLazyImage=U;window.initLazyImages=P;window.compressImageToWebP=D;window.isWebPSupported=M;window.trackEvent=B;function k(t){document.readyState==="loading"?document.addEventListener("DOMContentLoaded",t):t()}k(q);k(R);k($);})();

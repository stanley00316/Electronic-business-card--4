import { setLang } from './theme-lang.js';

// ===== 編輯名片：聯絡方式 CONTACT 版型切換（列表 / 小卡）=====
// 保險機制：若 edit.html（或舊版）沒有渲染切換器，這裡會自動注入，避免被快取舊 HTML 卡住。
export function ensureEditContactLayoutToggle() {
  try {
    const path = (window.location && window.location.pathname) ? window.location.pathname : '';
    if (!/edit\.html$/i.test(path)) return;

    const contacts = document.getElementById('previewContacts');
    if (!contacts) return;

    // 已存在就不重複注入
    if (document.getElementById('contactLayoutListBtn') || document.querySelector('.contact-layout-toolbar')) {
      return;
    }

    // 注入最小 CSS（即使 styles.css 還在被快取，也能顯示）
    if (!document.getElementById('uvaco-contact-layout-style')) {
      const s = document.createElement('style');
      s.id = 'uvaco-contact-layout-style';
      s.textContent = `
        .contact-layout-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:-8px;margin-bottom:10px}
        .contact-layout-label{font-size:12px;letter-spacing:.12em;opacity:.85;user-select:none}
        body.theme-dark .contact-layout-label{color:#9ca3af}
        body.theme-light .contact-layout-label{color:#6b7280}
        .contact-layout-toggle{display:inline-flex;gap:6px;padding:6px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.15);backdrop-filter:blur(10px)}
        body.theme-light .contact-layout-toggle{background:rgba(255,255,255,.75);border-color:rgba(15,23,42,.10)}
        .contact-layout-btn{border:none;border-radius:999px;padding:8px 12px;font-size:13px;cursor:pointer;background:transparent;color:inherit;opacity:.9;transition:.2s}
        .contact-layout-btn.is-active{background:rgba(var(--uvaco-green-rgb),.20);color:var(--uvaco-green);opacity:1}
        .contact-layout-btn:hover{transform:translateY(-1px)}
        /* Grid mode：固定至少 3 張；寬度夠就 4 張（不允許 2/1） */
        .btn-group.contact-layout-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
        @media (min-width:980px){.btn-group.contact-layout-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
        .btn-group.contact-layout-grid .btn{border-radius:18px;height:92px;font-size:clamp(11px,2.6vw,14px);line-height:1.15;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:10px;padding:14px 12px;text-align:center;overflow:hidden;white-space:normal}
        .btn-group.contact-layout-grid .btn .contact-btn-label{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;word-break:break-word;overflow-wrap:anywhere}
        .btn-group.contact-layout-grid .btn img{margin:0 auto;display:block}
        /* Grid 尾列補滿：避免 3 欄時最後一排留大空白 */
        .btn-group.contact-layout-grid .contact-btn-wrapper{min-width:0}
        .btn-group.contact-layout-grid .contact-btn-wrapper:nth-last-of-type(1):nth-of-type(3n+1){grid-column:1/-1}
        .btn-group.contact-layout-grid .contact-btn-wrapper:nth-last-of-type(1):nth-of-type(3n+2){grid-column:span 2}
        @media (min-width:980px){
          .btn-group.contact-layout-grid .contact-btn-wrapper:nth-last-of-type(1):nth-of-type(4n+1){grid-column:1/-1}
          .btn-group.contact-layout-grid .contact-btn-wrapper:nth-last-of-type(1):nth-of-type(4n+2){grid-column:span 3}
          .btn-group.contact-layout-grid .contact-btn-wrapper:nth-last-of-type(1):nth-of-type(4n+3){grid-column:span 2}
        }
        .btn-group.contact-layout-grid .btn:hover{transform:translateY(-1px)}
      `;
      document.head.appendChild(s);
    }

    const toolbar = document.createElement('div');
    toolbar.className = 'contact-layout-toolbar';
    toolbar.innerHTML = `
      <div class="contact-layout-label">
        <span class="lang-zh">顯示方式</span><span class="lang-en">Layout</span>
      </div>
      <div class="contact-layout-toggle" role="group" aria-label="Contact layout">
        <button type="button" class="contact-layout-btn" id="contactLayoutListBtn">
          <span class="lang-zh">列表</span><span class="lang-en">List</span>
        </button>
        <button type="button" class="contact-layout-btn" id="contactLayoutGridBtn">
          <span class="lang-zh">小卡</span><span class="lang-en">Cards</span>
        </button>
      </div>
    `;

    // 插到 contacts 前面
    contacts.parentNode.insertBefore(toolbar, contacts);

    // ===== 與新版 edit.html 對齊：使用同一個 key + 同一個全域狀態名稱 =====
    // - localStorage: UVACO_CONTACT_LAYOUT
    // - window.__uvacoContactLayout
    const getLayout = () => {
      try {
        const v = String(localStorage.getItem('UVACO_CONTACT_LAYOUT') || '').toLowerCase();
        return (v === 'grid') ? 'grid' : 'list';
      } catch (e) {
        return 'list';
      }
    };

    // 若舊版 edit.html 沒有這兩個函數，這裡補上（避免切換器能顯示但按了沒反應）
    if (typeof window.applyContactLayout !== 'function') {
      window.applyContactLayout = function (layout) {
        const mode = (layout === 'grid') ? 'grid' : 'list';
        const group = document.getElementById('previewContacts');
        const listBtn = document.getElementById('contactLayoutListBtn');
        const gridBtn = document.getElementById('contactLayoutGridBtn');
        if (group) group.classList.toggle('contact-layout-grid', mode === 'grid');
        if (listBtn) listBtn.classList.toggle('is-active', mode === 'list');
        if (gridBtn) gridBtn.classList.toggle('is-active', mode === 'grid');
      };
    }

    if (typeof window.setContactLayout !== 'function') {
      window.setContactLayout = function (layout) {
        window.__uvacoContactLayout = (layout === 'grid') ? 'grid' : 'list';
        try { localStorage.setItem('UVACO_CONTACT_LAYOUT', window.__uvacoContactLayout); } catch (e) {}
        if (typeof window.applyContactLayout === 'function') {
          window.applyContactLayout(window.__uvacoContactLayout);
        }
      };
    }

    // 初始值：沿用新版變數名稱，讓 saveCard()（若存在）能直接吃到
    window.__uvacoContactLayout = window.__uvacoContactLayout || getLayout();

    // 綁事件（優先呼叫全域 setContactLayout）
    const lb = document.getElementById('contactLayoutListBtn');
    const gb = document.getElementById('contactLayoutGridBtn');
    if (lb) lb.addEventListener('click', () => window.setContactLayout('list'));
    if (gb) gb.addEventListener('click', () => window.setContactLayout('grid'));

    // 初始套用
    if (typeof window.applyContactLayout === 'function') {
      window.applyContactLayout(window.__uvacoContactLayout);
    }

    // 再跑一次語言切換（避免 setLang 把 span display 搞到不一致）
    try {
      const savedLang = localStorage.getItem('lang') || 'zh';
      setLang(savedLang);
    } catch (e) {}
  } catch (e) {}
}

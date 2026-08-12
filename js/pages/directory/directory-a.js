// 前往「我的編輯頁」：一律帶 uid/next，確保編輯到自己的名片
async function gotoMyEditFromDirectory(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  try {
    if (!window.UVACO_CLOUD || !UVACO_CLOUD.hasConfig()) {
      window.location.href = 'edit.html';
      return false;
    }
    const s = await UVACO_CLOUD.getSession();
    const uid = s && s.session && s.session.user ? String(s.session.user.id || '').trim() : '';
    if (!uid) {
      window.location.href = 'auth.html?next=' + encodeURIComponent('directory.html');
      return false;
    }
    const next = 'card.html?id=' + encodeURIComponent(uid);
    window.location.href = 'edit.html?uid=' + encodeURIComponent(uid) + '&next=' + encodeURIComponent(next);
    return false;
  } catch (e) {
    window.location.href = 'edit.html';
    return false;
  }
}

// 前往「我的名片」頁面
async function gotoMyCard(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  try {
    if (!window.UVACO_CLOUD || !UVACO_CLOUD.hasConfig()) {
      window.location.href = 'auth.html?next=directory.html';
      return false;
    }
    const s = await UVACO_CLOUD.getSession();
    const uid = s && s.session && s.session.user ? String(s.session.user.id || '').trim() : '';
    if (!uid) {
      window.location.href = 'auth.html?next=directory.html';
      return false;
    }
    window.location.href = 'card.html?id=' + encodeURIComponent(uid);
    return false;
  } catch (e) {
    window.location.href = 'auth.html?next=directory.html';
    return false;
  }
}

// 雲端版：需要登入才可使用（未設定 Supabase 則略過）
(async function () {
  try {
    if (window.UVACO_CLOUD && UVACO_CLOUD.hasConfig()) {
      const here = 'directory.html' + (window.location.search || '');
      const r = await UVACO_CLOUD.requireAuth(here);
      if (!r.ok) return;

      // 若已登入但尚未建立名片，提示前往編輯（不強制跳轉，避免「平台目錄」導向錯覺）
      const my = await UVACO_CLOUD.getMyCard();
      renderMyCardPanel(my.card);
      // 避免「我的名片」在下方全平台清單重複出現（你回報的兩個預覽）
      window.__uvacoDirectoryState = window.__uvacoDirectoryState || { rows: [], loading: false };
      window.__uvacoDirectoryState.myUserId = my && my.card ? (my.card.user_id || '') : '';
      if (!my.card) {
        const msg = getCurrentLang && getCurrentLang() === 'en'
          ? 'You have not created your business card yet. Go to Edit page now?'
          : '你尚未建立名片，是否前往「編輯名片」？';
        if (confirm(msg)) {
          window.location.href = 'edit.html?mode=onboarding&next=directory.html';
        }
      }

      // 把舊版只存在瀏覽器本機的「新增好友」資料，一次性搬到雲端帳號底下（換裝置也看得到）
      await migrateLegacyLocalFriends();

      // 全平台名片搜尋（登入後可搜尋所有已建立名片的人）
      await refreshDirectoryResults();
    }
  } catch (e) {}
})();

function getCurrentLang() {
  const zhElements = document.querySelectorAll('.lang-zh');
  return zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';
}

function safeText(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

function renderMyCardPanel(card) {
  const panel = document.getElementById('myCardPanel');
  if (!panel) return;
  if (!card) {
    panel.style.display = 'none';
    return;
  }

  // profile_json：保留雙語資訊；沒有就退回 cards 的欄位
  let pj = card.profile_json;
  if (typeof pj === 'string') {
    try { pj = JSON.parse(pj); } catch (e) { pj = null; }
  }
  pj = (pj && typeof pj === 'object') ? pj : {};

  const nameZh = safeText(pj.nameZh) || safeText(card.name);
  const nameEn = safeText(pj.nameEn) || safeText(card.name);
  const titleZh = safeText(pj.titleZh) || safeText(card.title);
  const titleEn = safeText(pj.titleEn) || safeText(card.title);
  const companyZh = safeText(pj.companyZh) || safeText(card.company);
  const companyEn = safeText(pj.companyEn) || safeText(card.company);
  const email = safeText(card.email);

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val || '-';
  };
  set('myCardNameZh', nameZh);
  set('myCardNameEn', nameEn);
  set('myCardTitleZh', titleZh);
  set('myCardTitleEn', titleEn);
  set('myCardCompanyZh', companyZh);
  set('myCardCompanyEn', companyEn);
  set('myCardEmail', email || '-');

  // 更新預覽連結
  const uid = card.user_id || '';
  const previewUrl = uid ? `card.html?id=${encodeURIComponent(uid)}` : 'card.html';
  const previewZh = document.getElementById('myCardPreviewZh');
  const previewEn = document.getElementById('myCardPreviewEn');
  if (previewZh) previewZh.href = previewUrl;
  if (previewEn) previewEn.href = previewUrl;

  panel.style.display = 'block';
}

// ===== 平台通訊錄：全平台公開搜尋（登入者）=====
window.__uvacoDirectoryState = window.__uvacoDirectoryState || {
  rows: [],
  loading: false
};

// 「新增好友」手動存下的聯絡人：改存 Supabase 的 directory_contacts（換裝置、換瀏覽器登入也看得到）
// 用一個記憶體快取包住，避免每次搜尋/篩選都重打一次 API；新增或刪除後會強制重新抓取。
window.__uvacoDirectoryState.contacts = window.__uvacoDirectoryState.contacts || [];
window.__uvacoDirectoryState.contactsLoaded = false;

async function getStoredFriends(forceRefresh) {
  if (!window.UVACO_CLOUD || !UVACO_CLOUD.hasConfig() || typeof UVACO_CLOUD.getMyContacts !== 'function') {
    return [];
  }
  if (window.__uvacoDirectoryState.contactsLoaded && !forceRefresh) {
    return window.__uvacoDirectoryState.contacts;
  }
  const { contacts } = await UVACO_CLOUD.getMyContacts();
  const normalized = (contacts || []).map(row => {
    const cj = (row && row.contact_json && typeof row.contact_json === 'object') ? row.contact_json : {};
    return { ...cj, id: row.id, createdAt: row.created_at };
  });
  window.__uvacoDirectoryState.contacts = normalized;
  window.__uvacoDirectoryState.contactsLoaded = true;
  return normalized;
}

// 舊版：新增好友資料只存在瀏覽器 localStorage，換裝置或清瀏覽器資料就會不見。
// 這裡把還留在本機的舊資料一次性搬進雲端帳號，搬完就清掉本機備份，只搬一次。
const LEGACY_FRIENDS_KEY = 'directoryFriends';
const LEGACY_FRIENDS_MIGRATED_KEY = 'directoryFriendsMigratedV2';

async function migrateLegacyLocalFriends() {
  try {
    if (localStorage.getItem(LEGACY_FRIENDS_MIGRATED_KEY)) return;
    if (!window.UVACO_CLOUD || typeof UVACO_CLOUD.addMyContact !== 'function') return;

    const raw = localStorage.getItem(LEGACY_FRIENDS_KEY);
    const legacy = raw ? JSON.parse(raw) : [];
    if (Array.isArray(legacy) && legacy.length) {
      for (const f of legacy) {
        if (!f || !String(f.name || '').trim()) continue;
        await UVACO_CLOUD.addMyContact({
          name: f.name || '',
          company: f.company || '',
          position: f.position || '',
          phone: f.phone || '',
          email: f.email || '',
          category: f.category || '',
          categoryDisplay: f.categoryDisplay || '',
          regionZone: f.regionZone || '',
          regionCity: f.regionCity || '',
          regionDistrict: f.regionDistrict || '',
          field: f.field || '',
          fieldDisplay: f.fieldDisplay || ''
        });
      }
      window.__uvacoDirectoryState.contactsLoaded = false; // 搬完強制重新抓取一次
    }
    localStorage.setItem(LEGACY_FRIENDS_MIGRATED_KEY, '1');
    localStorage.removeItem(LEGACY_FRIENDS_KEY);
  } catch (e) {
    // 搬遷失敗不影響正常使用，之後還是可以繼續用雲端新增好友
  }
}

// 手動刪除一筆好友
async function removeMyContact(contactId) {
  if (!contactId) return;
  const currentLang = getCurrentLang();
  const msg = currentLang === 'zh' ? '確定要刪除這位好友嗎？' : 'Delete this contact?';
  if (!confirm(msg)) return;
  if (!window.UVACO_CLOUD || typeof UVACO_CLOUD.deleteMyContact !== 'function') return;

  try {
    const result = await UVACO_CLOUD.deleteMyContact(contactId);
    if (!result || !result.success) {
      alert(currentLang === 'zh' ? '刪除失敗，請稍後再試。' : 'Failed to delete. Please try again.');
      return;
    }
    await getStoredFriends(true);
    if (typeof refreshCompanyIndex === 'function') await refreshCompanyIndex();
    searchDirectory();
  } catch (e) {
    alert(currentLang === 'zh' ? '刪除失敗，請稍後再試。' : 'Failed to delete. Please try again.');
  }
}

// 判斷本機聯絡人是否符合搜尋關鍵字（比對姓名、公司、職務、電話、Email 與分類等欄位）
function localFriendMatchesQuery(f, q) {
  const qn = String(q || '').trim().toLowerCase();
  if (!qn) return true;
  const parts = [
    f.name,
    f.company,
    f.position,
    f.phone,
    f.email,
    f.categoryDisplay,
    f.category,
    f.fieldDisplay,
    f.field,
    f.regionZone,
    f.regionCity,
    f.regionDistrict
  ].map(x => String(x || '').toLowerCase());
  return parts.some(p => p.includes(qn));
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

async function refreshDirectoryResults() {
  if (!window.UVACO_CLOUD || !UVACO_CLOUD.hasConfig()) return;
  if (window.__uvacoDirectoryState.loading) return;
  window.__uvacoDirectoryState.loading = true;

  const resultsDiv = document.getElementById('directoryResults');
  if (resultsDiv) {
    resultsDiv.innerHTML = `
      <div class="directory-empty-icon">⏳</div>
      <div class="directory-empty-text lang-zh">載入平台名片中…</div>
      <div class="directory-empty-text lang-en">Loading directory…</div>
    `;
  }

  try {
    const q = (document.getElementById('directorySearchInput')?.value || '').trim();
    const { rows } = await UVACO_CLOUD.searchCards({ q, limit: 100 });
    const all = rows || [];
    const myId = String(window.__uvacoDirectoryState.myUserId || '').trim();
    // 排除自己（我的名片已在上方面板顯示）
    const filtered = myId ? all.filter(r => String(r?.user_id || '') !== myId) : all;

    // 合併雲端搜尋結果與「新增好友」存在自己帳號底下的聯絡人，避免只有這類資料時主列表永遠為 0
    const pals = await getStoredFriends();
    const localRows = pals
      .filter(f => f && localFriendMatchesQuery(f, q))
      .map((f, idx) => ({
        __localFriend: true,
        id: f.id || '',
        localKey: 'lf-' + String(f.id != null ? f.id : idx),
        name: String(f.name || '').trim(),
        company: String(f.company || '').trim(),
        title: String(f.position || '').trim(),
        phone: String(f.phone || '').trim(),
        email: String(f.email || '').trim()
      }));

    const merged = filtered.concat(localRows);
    window.__uvacoDirectoryState.rows = merged;

    // 平台上只有自己一張公開名片、且雲端結果為空也無本地好友時，用 emptyHint 標明原因
    const onlySelf =
      Boolean(myId) &&
      all.length === 1 &&
      String(all[0]?.user_id || '') === myId &&
      filtered.length === 0 &&
      localRows.length === 0;
    window.__uvacoDirectoryState.emptyHint = onlySelf ? 'only_self' : null;

    renderDirectoryResults(merged);
  } catch (e) {
    window.__uvacoDirectoryState.emptyHint = null;
    if (resultsDiv) {
      resultsDiv.innerHTML = `
        <div class="directory-empty-icon">⚠️</div>
        <div class="directory-empty-text lang-zh">載入失敗，請稍後重試</div>
        <div class="directory-empty-text lang-en">Failed to load. Please try again.</div>
      `;
    }
  } finally {
    window.__uvacoDirectoryState.loading = false;
    // 更新語言顯示（沿用現有邏輯）
    const zhElements = document.querySelectorAll('.lang-zh');
    const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';
    document.querySelectorAll('#directoryResults .lang-zh').forEach(el => {
      el.style.display = currentLang === 'zh' ? 'block' : 'none';
    });
    document.querySelectorAll('#directoryResults .lang-en').forEach(el => {
      el.style.display = currentLang === 'en' ? 'block' : 'none';
    });
  }
}

function renderDirectoryResults(rows) {
  const resultsDiv = document.getElementById('directoryResults');
  const list = Array.isArray(rows) ? rows : [];
  updateDirectoryResults(list.length);

  if (!resultsDiv) return;
  if (list.length === 0) {
    // 保留原空狀態
    updateDirectoryResults(0);
    return;
  }

  const itemsHtml = list.map(r => {
    if (r && r.__localFriend) {
      const name = escapeHtml(r.name || '');
      const company = escapeHtml(r.company || '');
      const title = escapeHtml(r.title || '');
      const contactId = encodeURIComponent(String(r.id || ''));
      const previewUrl = `card.html?contact=${contactId}`;

      return `
      <div class="directory-card-item" data-local-friend="1" style="width:100%;display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 12px;border-radius:14px;border:1px solid rgba(255,255,255,0.08);background:rgba(22,22,24,0.65);margin:10px 0;box-sizing:border-box;">
        <div style="min-width:0;flex:1;text-align:center;">
          <div style="font-weight:800;color:#e5e7eb;line-height:1.3;word-break:break-word;">${name || '-'}</div>
          <div style="opacity:.9;color:#cbd5e1;font-size:13px;line-height:1.3;margin-top:2px;word-break:break-word;">
            ${company ? company : ''}${(company && title) ? '\uff5c' : ''}${title ? title : ''}
          </div>
          <div style="opacity:.65;color:#94a3b8;font-size:11px;margin-top:4px;" class="lang-zh">\u624b\u52d5\u5132\u5b58\u806f\u7d61\u4eba\uff08\u50c5\u81ea\u5df1\u770b\u5f97\u5230\uff09</div>
          <div style="opacity:.65;color:#94a3b8;font-size:11px;margin-top:4px;display:none;" class="lang-en">Saved contact (private, visible to you only)</div>
        </div>
        <div style="flex:0 0 auto;display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">
          <a class="btn btn-secondary lang-zh" href="${previewUrl}" target="_blank" rel="noopener noreferrer">\ud83d\udc40 \u9810\u89bd</a>
          <a class="btn btn-secondary lang-en" href="${previewUrl}" target="_blank" rel="noopener noreferrer">\ud83d\udc40 Preview</a>
          <a class="btn btn-secondary lang-zh" href="javascript:void(0)" onclick="removeMyContact('${contactId}')" style="color:#f87171;">\u522a\u9664</a>
          <a class="btn btn-secondary lang-en" href="javascript:void(0)" onclick="removeMyContact('${contactId}')" style="color:#f87171;">Delete</a>
        </div>
      </div>
    `;
    }

    const name = escapeHtml(r?.name || '');
    const company = escapeHtml(r?.company || '');
    const title = escapeHtml(r?.title || '');
    const uid = encodeURIComponent(r?.user_id || '');
    const previewUrl = `card.html?id=${uid}`;
    return `
      <div class="directory-card-item" style="width:100%;display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 12px;border-radius:14px;border:1px solid rgba(255,255,255,0.08);background:rgba(22,22,24,0.65);margin:10px 0;box-sizing:border-box;">
        <div style="min-width:0;flex:1;text-align:center;">
          <div style="font-weight:800;color:#e5e7eb;line-height:1.3;word-break:break-word;">${name || '-'}</div>
          <div style="opacity:.9;color:#cbd5e1;font-size:13px;line-height:1.3;margin-top:2px;word-break:break-word;">
            ${company ? company : ''}${(company && title) ? '\uff5c' : ''}${title ? title : ''}
          </div>
        </div>
        <div style="flex:0 0 auto;display:flex;gap:8px;">
          <a class="btn btn-secondary lang-zh" href="${previewUrl}" target="_blank" rel="noopener noreferrer">\u{1F440} \u9810\u89bd</a>
          <a class="btn btn-secondary lang-en" href="${previewUrl}" target="_blank" rel="noopener noreferrer">\u{1F440} Preview</a>
        </div>
      </div>
    `;
  }).join('');

  resultsDiv.innerHTML = itemsHtml;
}

// ===== 完整索引：類別 / 地區 / 專業領域 / 公司 =====
// - 類別/地區/專業領域：固定完整清單
// - 公司：會從「新增好友」的 company 自動累積成索引（越用越完整）

// ===== 類別兩層式資料結構（大類 → 細項） =====
const CATEGORY_CASCADE = {
  categories: [
    { key: 'business', zh: '商業', en: 'Business' },
    { key: 'tech', zh: '科技', en: 'Technology' },
    { key: 'service', zh: '服務', en: 'Service' },
    { key: 'finance', zh: '金融', en: 'Finance' },
    { key: 'health', zh: '健康/保健', en: 'Health' },
    { key: 'education', zh: '教育', en: 'Education' },
    { key: 'real-estate', zh: '不動產', en: 'Real Estate' },
    { key: 'legal', zh: '法律', en: 'Legal' },
    { key: 'design', zh: '設計', en: 'Design' },
    { key: 'manufacturing', zh: '製造', en: 'Manufacturing' },
    { key: 'retail', zh: '零售', en: 'Retail' },
    { key: 'food', zh: '餐飲', en: 'Food & Beverage' },
    { key: 'government', zh: '政府/非營利', en: 'Government / Non-profit' }
  ],
  subcategoriesByCategory: {
    'business': ['B2B 商業', 'B2C 商業', '電商', '貿易', '批發'],
    'tech': ['軟體開發', '硬體製造', '網路服務', '資訊安全', '人工智慧'],
    'service': ['顧問服務', '專業服務', '物流服務', '清潔服務', '保全服務'],
    'finance': ['銀行', '保險', '證券', '投資', '會計'],
    'health': ['醫療', '保健', '健身', '美容', '養生'],
    'education': ['學校教育', '補習教育', '職業訓練', '線上教育', '語言教育'],
    'real-estate': ['不動產開發', '不動產仲介', '物業管理', '室內設計', '裝潢'],
    'legal': ['律師事務所', '法律顧問', '專利事務', '公證', '調解'],
    'design': ['平面設計', '網頁設計', '工業設計', '空間設計', '品牌設計'],
    'manufacturing': ['電子製造', '機械製造', '食品製造', '紡織製造', '化學製造'],
    'retail': ['百貨', '超市', '便利商店', '專賣店', '網路零售'],
    'food': ['餐廳', '咖啡廳', '飲料店', '外送', '食品製造'],
    'government': ['政府機關', '公營事業', '非營利組織', '社福機構', '研究機構']
  }
};

// ===== 專業領域兩層式資料結構（大類 → 細項） =====
const FIELD_CASCADE = {
  categories: [
    { key: 'marketing-sales', zh: '行銷 / 業務', en: 'Marketing / Sales' },
    { key: 'tech', zh: '資訊科技', en: 'Information Technology' },
    { key: 'design-creative', zh: '設計 / 創意', en: 'Design / Creative' },
    { key: 'healthcare', zh: '醫療 / 長照', en: 'Healthcare / Long-term Care' },
    { key: 'education-consulting', zh: '教育 / 顧問', en: 'Education / Consulting' },
    { key: 'food-service', zh: '餐飲 / 服務', en: 'Food & Beverage / Service' },
    { key: 'operations', zh: '營運 / 管理', en: 'Operations / Management' },
    { key: 'finance-accounting', zh: '財務 / 會計', en: 'Finance / Accounting' },
    { key: 'hr', zh: '人資', en: 'Human Resources' },
    { key: 'legal', zh: '法務', en: 'Legal' },
    { key: 'customer-success', zh: '客服 / 客戶成功', en: 'Customer Success' },
    { key: 'product', zh: '產品', en: 'Product' }
  ],
  subcategoriesByCategory: {
    'marketing-sales': ['數位行銷', '社群媒體', '內容行銷', 'SEO/SEM', '廣告投放', 'B2B 業務', 'B2C 業務', '電商銷售', '通路管理'],
    'tech': ['前端工程', '後端工程', '全端工程', 'DevOps', '資料科學', '行動開發', '資訊安全', '雲端服務'],
    'design-creative': ['UI/UX 設計', '平面設計', '網頁設計', '影音製作', '動畫', '品牌設計', '包裝設計'],
    'healthcare': ['醫療', '護理', '長照', '復健', '藥學', '醫檢', '營養'],
    'education-consulting': ['教學', '培訓', '顧問', '教練', '課程設計', '教材開發'],
    'food-service': ['餐廳管理', '廚藝', '服務生', '調酒師', '咖啡師', '外送服務'],
    'operations': ['營運管理', '專案管理', '品質管理', '供應鏈管理', '流程優化'],
    'finance-accounting': ['財務分析', '會計', '審計', '稅務', '投資分析', '風險管理'],
    'hr': ['招募', '訓練發展', '薪酬福利', '員工關係', '組織發展'],
    'legal': ['法務', '合約管理', '智慧財產', '法規遵循', '訴訟'],
    'customer-success': ['客戶服務', '客戶成功', '技術支援', '帳戶管理', '關係維護'],
    'product': ['產品管理', '產品設計', '產品行銷', '產品分析', '產品策略']
  }
};

// 向後兼容：保留 DIRECTORY_INDEX（但不再用於選擇器）
const DIRECTORY_INDEX = {
  categories: [],
  fields: []
};

// 自訂索引（使用者在「其他」輸入後會記住）
const CUSTOM_INDEX_KEY = 'directoryCustomIndex';

// ===== 兩層式選擇器（類別/專業領域共用邏輯） =====
const TWO_LEVEL_PICKER = {
  isOpen: false,
  type: null, // 'category' | 'field'
  target: null, // 'filter' | 'friend'
  step: 'category', // 'category' | 'subcategory' | 'custom'
  temp: {
    categoryKey: '',
    categoryLabel: '',
    subcategoryKey: '',
    subcategoryLabel: ''
  }
};

function setTwoLevelPickerTitle() {
  const titleZh = document.getElementById('twoLevelPickerTitleZh');
  const titleEn = document.getElementById('twoLevelPickerTitleEn');
  if (!titleZh || !titleEn) return;
  const currentLang = getCurrentLang();
  
  if (TWO_LEVEL_PICKER.step === 'category') {
    if (TWO_LEVEL_PICKER.type === 'category') {
      titleZh.textContent = '選擇類別';
      titleEn.textContent = 'Select Category';
    } else {
      titleZh.textContent = '選擇專業領域';
      titleEn.textContent = 'Select Professional Field';
    }
  } else if (TWO_LEVEL_PICKER.step === 'subcategory' || TWO_LEVEL_PICKER.step === 'custom') {
    titleZh.textContent = TWO_LEVEL_PICKER.temp.categoryLabel || '選擇細項';
    titleEn.textContent = TWO_LEVEL_PICKER.temp.categoryLabel || 'Select Subcategory';
  }
}

function setTwoLevelPickerBackVisibility() {
  const backBtn = document.getElementById('twoLevelPickerBackBtn');
  if (!backBtn) return;
  backBtn.style.visibility = (TWO_LEVEL_PICKER.step === 'category') ? 'hidden' : 'visible';
}

function openTwoLevelPicker(type, target) {
  const overlay = document.getElementById('twoLevelPickerOverlay');
  if (!overlay) return;
  TWO_LEVEL_PICKER.isOpen = true;
  TWO_LEVEL_PICKER.type = type;
  TWO_LEVEL_PICKER.target = target;
  TWO_LEVEL_PICKER.step = 'category';
  TWO_LEVEL_PICKER.temp = { categoryKey: '', categoryLabel: '', subcategoryKey: '', subcategoryLabel: '' };
  document.body.style.overflow = 'hidden';
  overlay.classList.add('show');
  renderTwoLevelPicker();
}

function closeTwoLevelPicker(event) {
  if (event && event.target && event.target.id !== 'twoLevelPickerOverlay') return;
  const overlay = document.getElementById('twoLevelPickerOverlay');
  if (!overlay) return;
  TWO_LEVEL_PICKER.isOpen = false;
  TWO_LEVEL_PICKER.type = null;
  TWO_LEVEL_PICKER.target = null;
  document.body.style.overflow = '';
  overlay.classList.remove('show');
  const custom = document.getElementById('twoLevelPickerCustom');
  const list = document.getElementById('twoLevelPickerList');
  if (custom) custom.classList.remove('show');
  if (list) list.classList.remove('hide');
}

function twoLevelPickerBack() {
  if (TWO_LEVEL_PICKER.step === 'subcategory' || TWO_LEVEL_PICKER.step === 'custom') {
    TWO_LEVEL_PICKER.step = 'category';
    TWO_LEVEL_PICKER.temp.subcategoryKey = '';
    TWO_LEVEL_PICKER.temp.subcategoryLabel = '';
  }
  renderTwoLevelPicker();
}

function twoLevelPickerCancelCustom() {
  TWO_LEVEL_PICKER.step = 'subcategory';
  renderTwoLevelPicker();
}

function twoLevelPickerConfirmCustom() {
  const input = document.getElementById('twoLevelPickerCustomInput');
  const label = String(input?.value || '').trim();
  if (!label) {
    const msg = getCurrentLang() === 'zh' ? '請輸入自訂名稱' : 'Please enter a custom name';
    alert(msg);
    return;
  }
  TWO_LEVEL_PICKER.temp.subcategoryKey = 'custom';
  TWO_LEVEL_PICKER.temp.subcategoryLabel = label;
  applyTwoLevelPickerResult();
  closeTwoLevelPicker();
}

function renderTwoLevelPicker() {
  setTwoLevelPickerTitle();
  setTwoLevelPickerBackVisibility();

  const list = document.getElementById('twoLevelPickerList');
  const custom = document.getElementById('twoLevelPickerCustom');
  if (!list || !custom) return;

  if (TWO_LEVEL_PICKER.step === 'custom') {
    list.classList.add('hide');
    custom.classList.add('show');
    const input = document.getElementById('twoLevelPickerCustomInput');
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 0);
    }
    return;
  }

  custom.classList.remove('show');
  list.classList.remove('hide');

  const currentLang = getCurrentLang();
  let items = [];
  const data = TWO_LEVEL_PICKER.type === 'category' ? CATEGORY_CASCADE : FIELD_CASCADE;

  if (TWO_LEVEL_PICKER.step === 'category') {
    items = data.categories.map(c => ({
      key: c.key,
      label: currentLang === 'zh' ? c.zh : c.en
    }));
  } else if (TWO_LEVEL_PICKER.step === 'subcategory') {
    const categoryKey = TWO_LEVEL_PICKER.temp.categoryKey;
    const subcategories = data.subcategoriesByCategory[categoryKey] || [];
    items = subcategories.map(s => ({ key: s, label: s }));
    // 第二層：添加「其他」選項（可自訂）
    items.push({ key: 'other', label: '其他' });
  }

  if (!items.length) {
    list.innerHTML = `
      <div class="region-picker-empty">
        <div class="lang-zh">此層沒有可選項目</div>
        <div class="lang-en">No options available</div>
      </div>
    `;
    return;
  }

  list.innerHTML = items.map(it => `
    <button type="button" class="region-picker-item" onclick="twoLevelPickerSelect('${TWO_LEVEL_PICKER.step}','${String(it.key).replace(/'/g,"&#39;")}')">
      ${it.label}
    </button>
  `).join('');
}

function twoLevelPickerSelect(step, key) {
  const data = TWO_LEVEL_PICKER.type === 'category' ? CATEGORY_CASCADE : FIELD_CASCADE;
  
  if (step === 'category') {
    const category = data.categories.find(c => c.key === key);
    TWO_LEVEL_PICKER.temp.categoryKey = key;
    TWO_LEVEL_PICKER.temp.categoryLabel = category ? category.zh : key;
    TWO_LEVEL_PICKER.step = 'subcategory';
    renderTwoLevelPicker();
    return;
  }

  if (step === 'subcategory') {
    if (key === 'other') {
      TWO_LEVEL_PICKER.step = 'custom';
      renderTwoLevelPicker();
      return;
    }
    TWO_LEVEL_PICKER.temp.subcategoryKey = key;
    TWO_LEVEL_PICKER.temp.subcategoryLabel = key;
    applyTwoLevelPickerResult();
    closeTwoLevelPicker();
  }
}

function applyTwoLevelPickerResult() {
  const t = TWO_LEVEL_PICKER.target;
  const type = TWO_LEVEL_PICKER.type;
  if (!t || !type) return;
  
  const valueEl = document.getElementById(t === 'filter' 
    ? (type === 'category' ? 'filterCategory' : 'filterField')
    : (type === 'category' ? 'friendCategory' : 'friendField'));
  const displayEl = document.getElementById(t === 'filter'
    ? (type === 'category' ? 'filterCategoryDisplay' : 'filterFieldDisplay')
    : (type === 'category' ? 'friendCategoryDisplay' : 'friendFieldDisplay'));

  const parts = [];
  if (TWO_LEVEL_PICKER.temp.categoryLabel) parts.push(TWO_LEVEL_PICKER.temp.categoryLabel);
  if (TWO_LEVEL_PICKER.temp.subcategoryLabel) parts.push(TWO_LEVEL_PICKER.temp.subcategoryLabel);
  const displayText = parts.join(' / ');

  if (valueEl) valueEl.value = displayText;
  if (displayEl) displayEl.value = displayText;
}

// ===== 地區（三級聯動）：區域 → 縣市 → 區 =====
// 註：英文區名為簡化處理（同中文），可後續再補正規英譯
const REGION_CASCADE = {
  zones: [
    { value: 'north', zh: '北', en: 'North' },
    { value: 'central', zh: '中', en: 'Central' },
    { value: 'south', zh: '南', en: 'South' },
    { value: 'east', zh: '東', en: 'East' },
    { value: 'islands', zh: '離島', en: 'Islands' },
    { value: 'overseas', zh: '海外', en: 'Overseas' },
    { value: 'other', zh: '其他', en: 'Other' }
  ],
  citiesByZone: {
    north: [
      { value: 'taipei', zh: '台北市', en: 'Taipei City' },
      { value: 'newtaipei', zh: '新北市', en: 'New Taipei City' },
      { value: 'keelung', zh: '基隆市', en: 'Keelung City' },
      { value: 'taoyuan', zh: '桃園市', en: 'Taoyuan City' },
      { value: 'hsinchu-city', zh: '新竹市', en: 'Hsinchu City' },
      { value: 'hsinchu-county', zh: '新竹縣', en: 'Hsinchu County' },
      { value: 'yilan', zh: '宜蘭縣', en: 'Yilan County' }
    ],
    central: [
      { value: 'miaoli', zh: '苗栗縣', en: 'Miaoli County' },
      { value: 'taichung', zh: '台中市', en: 'Taichung City' },
      { value: 'changhua', zh: '彰化縣', en: 'Changhua County' },
      { value: 'nantou', zh: '南投縣', en: 'Nantou County' },
      { value: 'yunlin', zh: '雲林縣', en: 'Yunlin County' }
    ],
    south: [
      { value: 'chiayi-city', zh: '嘉義市', en: 'Chiayi City' },
      { value: 'chiayi-county', zh: '嘉義縣', en: 'Chiayi County' },
      { value: 'tainan', zh: '台南市', en: 'Tainan City' },
      { value: 'kaohsiung', zh: '高雄市', en: 'Kaohsiung City' },
      { value: 'pingtung', zh: '屏東縣', en: 'Pingtung County' }
    ],
    east: [
      { value: 'hualien', zh: '花蓮縣', en: 'Hualien County' },
      { value: 'taitung', zh: '台東縣', en: 'Taitung County' }
    ],
    islands: [
      { value: 'penghu', zh: '澎湖縣', en: 'Penghu County' },
      { value: 'kinmen', zh: '金門縣', en: 'Kinmen County' },
      { value: 'matsu', zh: '連江縣（馬祖）', en: 'Lienchiang County (Matsu)' }
    ],
    overseas: [],
    other: []
  },
  districtsByCity: {
    taipei: ['中正區','大同區','中山區','松山區','大安區','萬華區','信義區','士林區','北投區','內湖區','南港區','文山區'],
    newtaipei: ['板橋區','三重區','中和區','永和區','新莊區','新店區','土城區','蘆洲區','汐止區','樹林區','淡水區','鶯歌區','三峽區','瑞芳區','五股區','泰山區','林口區','深坑區','石碇區','坪林區','三芝區','石門區','八里區','平溪區','雙溪區','貢寮區','金山區','萬里區','烏來區'],
    keelung: ['仁愛區','信義區','中正區','中山區','安樂區','暖暖區','七堵區'],
    taoyuan: ['桃園區','中壢區','平鎮區','八德區','楊梅區','蘆竹區','大溪區','龍潭區','龜山區','大園區','觀音區','新屋區','復興區'],
    'hsinchu-city': ['東區','北區','香山區'],
    'hsinchu-county': ['竹北市','竹東鎮','新埔鎮','關西鎮','湖口鄉','新豐鄉','芎林鄉','橫山鄉','北埔鄉','寶山鄉','峨眉鄉','尖石鄉','五峰鄉'],
    yilan: ['宜蘭市','羅東鎮','蘇澳鎮','頭城鎮','礁溪鄉','壯圍鄉','員山鄉','冬山鄉','五結鄉','三星鄉','大同鄉','南澳鄉'],
    miaoli: ['苗栗市','頭份市','苑裡鎮','通霄鎮','竹南鎮','後龍鎮','卓蘭鎮','大湖鄉','公館鄉','銅鑼鄉','南庄鄉','頭屋鄉','三義鄉','西湖鄉','造橋鄉','三灣鄉','獅潭鄉','泰安鄉'],
    taichung: ['中區','東區','南區','西區','北區','北屯區','西屯區','南屯區','太平區','大里區','霧峰區','烏日區','豐原區','后里區','石岡區','東勢區','和平區','新社區','潭子區','大雅區','神岡區','大肚區','沙鹿區','龍井區','梧棲區','清水區','大甲區','外埔區','大安區'],
    changhua: ['彰化市','員林市','和美鎮','鹿港鎮','溪湖鎮','田中鎮','北斗鎮','二林鎮','線西鄉','伸港鄉','福興鄉','秀水鄉','花壇鄉','芬園鄉','大村鄉','埔鹽鄉','埔心鄉','永靖鄉','社頭鄉','二水鄉','田尾鄉','埤頭鄉','芳苑鄉','大城鄉','竹塘鄉','溪州鄉'],
    nantou: ['南投市','埔里鎮','草屯鎮','竹山鎮','集集鎮','名間鄉','鹿谷鄉','中寮鄉','魚池鄉','國姓鄉','水里鄉','信義鄉','仁愛鄉'],
    yunlin: ['斗六市','斗南鎮','虎尾鎮','西螺鎮','土庫鎮','北港鎮','古坑鄉','大埤鄉','莿桐鄉','林內鄉','二崙鄉','崙背鄉','麥寮鄉','東勢鄉','褒忠鄉','臺西鄉','元長鄉','四湖鄉','口湖鄉','水林鄉'],
    'chiayi-city': ['東區','西區'],
    'chiayi-county': ['太保市','朴子市','布袋鎮','大林鎮','民雄鄉','溪口鄉','新港鄉','六腳鄉','東石鄉','義竹鄉','鹿草鄉','水上鄉','中埔鄉','竹崎鄉','梅山鄉','番路鄉','大埔鄉','阿里山鄉'],
    tainan: ['中西區','東區','南區','北區','安平區','安南區','永康區','歸仁區','新化區','左鎮區','玉井區','楠西區','南化區','仁德區','關廟區','龍崎區','官田區','麻豆區','佳里區','西港區','七股區','將軍區','學甲區','北門區','新營區','後壁區','白河區','東山區','六甲區','下營區','柳營區','鹽水區','善化區','大內區','山上區','新市區','安定區'],
    kaohsiung: ['楠梓區','左營區','鼓山區','三民區','鹽埕區','前金區','新興區','苓雅區','前鎮區','小港區','旗津區','鳳山區','大寮區','鳥松區','林園區','仁武區','大樹區','岡山區','路竹區','橋頭區','梓官區','彌陀區','永安區','燕巢區','田寮區','阿蓮區','茄萣區','湖內區','旗山區','美濃區','內門區','杉林區','甲仙區','六龜區','茂林區','桃源區','那瑪夏區'],
    pingtung: ['屏東市','潮州鎮','東港鎮','恆春鎮','萬丹鄉','長治鄉','麟洛鄉','九如鄉','里港鄉','鹽埔鄉','高樹鄉','萬巒鄉','內埔鄉','竹田鄉','新埤鄉','枋寮鄉','新園鄉','崁頂鄉','林邊鄉','南州鄉','佳冬鄉','琉球鄉','車城鄉','滿州鄉','枋山鄉','三地門鄉','霧臺鄉','瑪家鄉','泰武鄉','來義鄉','春日鄉','獅子鄉','牡丹鄉'],
    hualien: ['花蓮市','鳳林鎮','玉里鎮','新城鄉','吉安鄉','壽豐鄉','光復鄉','豐濱鄉','瑞穗鄉','富里鄉','秀林鄉','萬榮鄉','卓溪鄉'],
    taitung: ['臺東市','成功鎮','關山鎮','卑南鄉','鹿野鄉','池上鄉','東河鄉','長濱鄉','太麻里鄉','大武鄉','綠島鄉','蘭嶼鄉','延平鄉','金峰鄉','達仁鄉','海端鄉'],
    penghu: ['馬公市','湖西鄉','白沙鄉','西嶼鄉','望安鄉','七美鄉'],
    kinmen: ['金城鎮','金湖鎮','金沙鎮','金寧鄉','烈嶼鄉','烏坵鄉'],
    matsu: ['南竿鄉','北竿鄉','莒光鄉','東引鄉']
  }
};

// 將使用者輸入的字串轉成只含 a-z、數字、連字號的 slug（供選項 value 使用）
function safeSlug(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .slice(0, 60);
}

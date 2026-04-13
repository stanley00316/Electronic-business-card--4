function addOptionsToSelect(selectEl, options) {
  options.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.setAttribute('data-lang-zh', opt.zh);
    option.setAttribute('data-lang-en', opt.en);
    // 文字會由 common.js 的 updateDirectorySelectOptions() 依語言自動更新
    option.textContent = opt.zh;
    selectEl.appendChild(option);
  });
}

function getCustomIndex() {
  try {
    const raw = localStorage.getItem(CUSTOM_INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
      regions: Array.isArray(parsed.regions) ? parsed.regions : [],
      fields: Array.isArray(parsed.fields) ? parsed.fields : [],
      // 新版地區三級聯動的自訂選項
      regionCities: Array.isArray(parsed.regionCities) ? parsed.regionCities : [],
      regionDistricts: Array.isArray(parsed.regionDistricts) ? parsed.regionDistricts : []
    };
  } catch (e) {
    return { categories: [], regions: [], fields: [], regionCities: [], regionDistricts: [] };
  }
}

function setCustomIndex(next) {
  try {
    localStorage.setItem(CUSTOM_INDEX_KEY, JSON.stringify(next));
  } catch (e) {}
}

function normalizeCustomLabel(zh, en) {
  const a = String(zh || '').trim();
  const b = String(en || '').trim();
  if (!a && !b) return null;
  return { zh: a || b, en: b || a };
}

function makeCustomValue(kind, labelZh) {
  const base = safeSlug(labelZh) || 'custom';
  return `custom-${kind}-${base}`;
}

function upsertCustomOption(kind, label) {
  const idx = getCustomIndex();
  const list = idx[kind] || [];
  const value = makeCustomValue(kind, label.zh);
  if (!list.some(o => o && o.value === value)) {
    list.push({ value, zh: label.zh, en: label.en });
  }
  idx[kind] = list;
  setCustomIndex(idx);
  return { value, zh: label.zh, en: label.en };
}

function insertOptionBeforeOther(selectEl, opt) {
  if (!selectEl || !opt) return;
  // 避免重複
  if (selectEl.querySelector(`option[value="${opt.value}"]`)) return;
  const el = document.createElement('option');
  el.value = opt.value;
  el.setAttribute('data-lang-zh', opt.zh);
  el.setAttribute('data-lang-en', opt.en);
  el.textContent = opt.zh;

  const otherOption = selectEl.querySelector('option[value="other"]');
  if (otherOption) {
    selectEl.insertBefore(el, otherOption);
  } else {
    selectEl.appendChild(el);
  }
}

function wireOtherToCustomTargets(selectEl, storageKind, targets, promptTitleZh, promptTitleEn, triggerValue = 'other') {
  if (!selectEl) return;
  selectEl.addEventListener('change', function() {
    if (selectEl.value !== triggerValue) return;

    const zhElements = document.querySelectorAll('.lang-zh');
    const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';

    const zhLabel = prompt(
      currentLang === 'zh'
        ? `請輸入自訂${promptTitleZh}（中文）：`
        : `Enter custom ${promptTitleEn} (Chinese label):`
    );
    const enLabel = prompt(
      currentLang === 'zh'
        ? `請輸入自訂${promptTitleZh}（英文，可留空）：`
        : `Enter custom ${promptTitleEn} (English label, optional):`
    );

    const label = normalizeCustomLabel(zhLabel, enLabel);
    if (!label) {
      // 取消或空白：回到未選
      selectEl.value = '';
      return;
    }

    const saved = upsertCustomOption(storageKind, label);

    // 同步插入目標 selects
    (targets || []).forEach(sel => insertOptionBeforeOther(sel, saved));

    // 重新套用語言文字
    if (typeof updateDirectorySelectOptions === 'function') updateDirectorySelectOptions();

    // 選中自訂選項
    selectEl.value = saved.value;
  });
}

function wireOtherToCustom(selectEl, kind) {
  // 向後兼容：舊的「類別/專業領域」使用固定 targets
  if (!selectEl) return;
  if (kind === 'categories') {
    wireOtherToCustomTargets(selectEl, 'categories', [document.getElementById('filterCategory'), document.getElementById('friendCategory')], '類別', 'category');
  } else if (kind === 'fields') {
    wireOtherToCustomTargets(selectEl, 'fields', [document.getElementById('filterField'), document.getElementById('friendField')], '專業領域', 'professional field');
  }
}

function initDirectoryIndexes() {
  // 類別和專業領域已改為兩層式選擇器，不再需要初始化 select
  // 保留此函數以備其他索引初始化需求
  
  refreshCompanyIndex();

  // 讓語言切換立即反映到新加入的 option 文字
  if (typeof updateDirectorySelectOptions === 'function') {
    updateDirectorySelectOptions();
  }
}

function resetSelect(selectEl, firstValue) {
  if (!selectEl) return;
  const first = selectEl.querySelector('option[value="' + (firstValue ?? '') + '"]');
  const keep = first ? first.outerHTML : '';
  selectEl.innerHTML = keep;
}

function addSimpleOptions(selectEl, opts, includeOther) {
  if (!selectEl) return;
  opts.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.value;
    o.setAttribute('data-lang-zh', opt.zh);
    o.setAttribute('data-lang-en', opt.en);
    o.textContent = opt.zh;
    selectEl.appendChild(o);
  });
  if (includeOther) {
    const other = document.createElement('option');
    other.value = 'other';
    other.setAttribute('data-lang-zh', '其他');
    other.setAttribute('data-lang-en', 'Other');
    other.textContent = '其他';
    selectEl.appendChild(other);
  }
}

function addDistrictOptions(selectEl, districts, includeOther) {
  if (!selectEl) return;
  districts.forEach(d => {
    const o = document.createElement('option');
    const v = safeSlug(d);
    o.value = v || d;
    o.setAttribute('data-lang-zh', d);
    o.setAttribute('data-lang-en', d);
    o.textContent = d;
    selectEl.appendChild(o);
  });
  if (includeOther) {
    const other = document.createElement('option');
    other.value = 'other';
    other.setAttribute('data-lang-zh', '其他');
    other.setAttribute('data-lang-en', 'Other');
    other.textContent = '其他';
    selectEl.appendChild(other);
  }
}

function addCustomTriggerOption(selectEl) {
  if (!selectEl) return;
  if (selectEl.querySelector('option[value="custom"]')) return;
  const opt = document.createElement('option');
  opt.value = 'custom';
  opt.setAttribute('data-lang-zh', '自訂…');
  opt.setAttribute('data-lang-en', 'Custom…');
  opt.textContent = '自訂…';
  selectEl.appendChild(opt);
}

function initRegionCascade(zoneSel, citySel, distSel, opts) {
  if (!zoneSel || !citySel || !distSel) return;
  const allowOther = !!opts?.allowOther;

  // zone
  addSimpleOptions(zoneSel, REGION_CASCADE.zones.filter(z => z.value !== 'other'), allowOther);

  function rebuildCities() {
    const zone = zoneSel.value;
    // reset city & district
    resetSelect(citySel, '');
    resetSelect(distSel, '');

    if (!zone) {
      if (typeof updateDirectorySelectOptions === 'function') updateDirectorySelectOptions();
      return;
    }
    if (zone === 'overseas') {
      // overseas：直接讓縣市/區維持空白（可選其他自訂）
      if (allowOther) {
        addSimpleOptions(citySel, [], true);
        addSimpleOptions(distSel, [], true);
        addCustomTriggerOption(citySel);
        addCustomTriggerOption(distSel);
      }
      if (typeof updateDirectorySelectOptions === 'function') updateDirectorySelectOptions();
      return;
    }
    if (zone === 'other') {
      // 讓 citySel 觸發 other 自訂
      if (allowOther) {
        addSimpleOptions(citySel, [], true);
        addCustomTriggerOption(citySel);
      }
      if (typeof updateDirectorySelectOptions === 'function') updateDirectorySelectOptions();
      return;
    }

    const cities = REGION_CASCADE.citiesByZone[zone] || [];
    addSimpleOptions(citySel, cities, allowOther);
    if (allowOther) addCustomTriggerOption(citySel);
    if (typeof updateDirectorySelectOptions === 'function') updateDirectorySelectOptions();
  }

  function rebuildDistricts() {
    const city = citySel.value;
    resetSelect(distSel, '');
    if (!city) {
      if (typeof updateDirectorySelectOptions === 'function') updateDirectorySelectOptions();
      return;
    }
    if (city === 'other' || city === 'custom') {
      // 若縣市為「其他」或「自訂…」，區先提供其他與自訂…
      if (allowOther) {
        addSimpleOptions(distSel, [], true);
        addCustomTriggerOption(distSel);
      }
      if (typeof updateDirectorySelectOptions === 'function') updateDirectorySelectOptions();
      return;
    }
    const districts = REGION_CASCADE.districtsByCity[city] || [];
    addDistrictOptions(distSel, districts, allowOther);
    if (allowOther) addCustomTriggerOption(distSel);
    if (typeof updateDirectorySelectOptions === 'function') updateDirectorySelectOptions();
  }

  zoneSel.addEventListener('change', rebuildCities);
  citySel.addEventListener('change', rebuildDistricts);

  // 其他自訂（縣市 / 區）
  // 自訂邏輯已由 initDirectoryIndexes() 以 targets 方式統一掛載
}

function refreshCompanyIndex() {
  const filterCompany = document.getElementById('filterCompany');
  if (!filterCompany) return;

  // 清除除第一個（全部公司）以外的 option
  const first = filterCompany.querySelector('option[value=""]');
  filterCompany.innerHTML = '';
  if (first) {
    filterCompany.appendChild(first);
  } else {
    const allOpt = document.createElement('option');
    allOpt.value = '';
    allOpt.setAttribute('data-lang-zh', '全部公司');
    allOpt.setAttribute('data-lang-en', 'All Companies');
    allOpt.textContent = '全部公司';
    filterCompany.appendChild(allOpt);
  }

  // 基礎公司（可擴充）
  const baseCompanies = [
    { key: 'uvaco', zh: 'UVACO', en: 'UVACO' },
    { key: 'puzhong', zh: '葡眾企業', en: 'Puzhong Enterprise' }
  ];

  const friends = getStoredFriends();
  const extraNames = friends
    .map(f => (f && f.company ? String(f.company).trim() : ''))
    .filter(Boolean);

  const uniq = new Map(); // key -> {zh,en}
  baseCompanies.forEach(c => uniq.set(c.key, { zh: c.zh, en: c.en }));
  extraNames.forEach(name => {
    const key = safeSlug(name) || name;
    if (!uniq.has(key)) {
      uniq.set(key, { zh: name, en: name });
    }
  });

  // 排序：先 baseCompanies，再其餘依中文/英文名排序
  const baseKeys = new Set(baseCompanies.map(c => c.key));
  const rest = Array.from(uniq.entries())
    .filter(([k]) => !baseKeys.has(k))
    .sort((a, b) => a[1].zh.localeCompare(b[1].zh, 'zh-Hant'));

  baseCompanies.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.key;
    opt.setAttribute('data-lang-zh', c.zh);
    opt.setAttribute('data-lang-en', c.en);
    opt.textContent = c.zh;
    filterCompany.appendChild(opt);
  });

  rest.forEach(([key, label]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.setAttribute('data-lang-zh', label.zh);
    opt.setAttribute('data-lang-en', label.en);
    opt.textContent = label.zh;
    filterCompany.appendChild(opt);
  });

  if (typeof updateDirectorySelectOptions === 'function') {
    updateDirectorySelectOptions();
  }
}

// 顯示搜尋選項彈出視窗
function showSearchOptions() {
  const options = document.getElementById('directorySearchOptions');
  options.classList.add('show');
}

// 關閉搜尋選項彈出視窗
function closeSearchOptions() {
  const options = document.getElementById('directorySearchOptions');
  options.classList.remove('show');
}

// 打開進階篩選
function openAdvancedFilter() {
  closeSearchOptions(); // 關閉搜尋選項彈出視窗
  const panel = document.getElementById('directoryFilterPanel');
  
  // 如果面板未打開，則打開它
  if (!panel.classList.contains('show')) {
    panel.classList.add('show');
  }
  
  // 滾動到進階篩選面板
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// 切換進階篩選面板（保留此函數以備不時之需）
function toggleDirectoryFilter() {
  const panel = document.getElementById('directoryFilterPanel');
  panel.classList.toggle('show');
}

// 清除篩選條件
function clearDirectoryFilters() {
  document.getElementById('filterCategory').value = '';
  const filterCategoryDisplay = document.getElementById('filterCategoryDisplay');
  if (filterCategoryDisplay) filterCategoryDisplay.value = '';
  document.getElementById('filterRegionZone').value = '';
  document.getElementById('filterRegionCity').value = '';
  document.getElementById('filterRegionDistrict').value = '';
  const filterRegionDisplay = document.getElementById('filterRegionDisplay');
  if (filterRegionDisplay) filterRegionDisplay.value = '';
  document.getElementById('filterField').value = '';
  const filterFieldDisplay = document.getElementById('filterFieldDisplay');
  if (filterFieldDisplay) filterFieldDisplay.value = '';
  document.getElementById('filterCompany').value = '';
  document.getElementById('directorySearchInput').value = '';
  searchDirectory();
  // 關閉進階面板，回到通訊錄
  closeAdvancedFilter();
}

// 套用篩選條件
function applyDirectoryFilters() {
  searchDirectory();
  // 關閉進階面板，回到通訊錄
  closeAdvancedFilter();
}

// 關閉進階篩選面板
function closeAdvancedFilter() {
  const panel = document.getElementById('directoryFilterPanel');
  panel.classList.remove('show');
  closeSearchOptions();
  
  // 滾動到結果區域
  const resultsHeader = document.querySelector('.directory-results-header');
  if (resultsHeader) {
    resultsHeader.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// 搜尋處理
function handleDirectorySearch(event) {
  if (event.key === 'Enter' || event.type === 'keyup') {
    closeSearchOptions(); // 關閉搜尋選項
    searchDirectory();
  }
}

// 執行搜尋
function searchDirectory() {
  // 目前先做「全平台名片」的關鍵字搜尋（name/company/title）
  // 類別/地區/專業領域/公司索引可以後續再接到 profile_json（或 directory_contacts）
  refreshDirectoryResults();
}

// 更新搜尋結果
function updateDirectoryResults(count) {
  document.getElementById('directoryResultsCount').textContent = count;
  document.getElementById('directoryResultsCountEn').textContent = count;
  
  const resultsDiv = document.getElementById('directoryResults');
  if (count === 0) {
    // 與 directory-a 設定的 emptyHint 搭配：平台上只有自己一張名片時提示原因
    const onlySelf =
      window.__uvacoDirectoryState && window.__uvacoDirectoryState.emptyHint === 'only_self';
    if (onlySelf) {
      resultsDiv.innerHTML = `
      <div class="directory-empty-icon">ℹ️</div>
      <div class="directory-empty-text lang-zh">
        目前平台上沒有其他會員的名片可列出（此處已隱藏您自己的名片，避免與上方重複）。<br>
        請使用「+ 新增好友」儲存聯絡人，或邀請他人建立名片。
      </div>
      <div class="directory-empty-text lang-en">
        No other members' cards to list yet (your own card is hidden here to avoid duplicating the panel above).<br>
        Use "+ Add Friend" to save contacts, or invite others to create a card.
      </div>
    `;
    } else {
      resultsDiv.innerHTML = `
      <div class="directory-empty-icon">🔍</div>
      <div class="directory-empty-text lang-zh">
        找不到符合條件的名片<br>
        請嘗試調整搜尋關鍵字或篩選條件
      </div>
      <div class="directory-empty-text lang-en">
        No business cards matching the criteria found.<br>
        Please try adjusting your search keywords or filters.
      </div>
    `;
    }
    // 更新語言顯示
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

// 點擊外部關閉搜尋選項
document.addEventListener('click', function(event) {
  const searchInput = document.getElementById('directorySearchInput');
  const searchOptions = document.getElementById('directorySearchOptions');
  const filterPanel = document.getElementById('directoryFilterPanel');
  
  // 如果點擊的不是搜尋框、搜尋選項或篩選面板，則關閉選項
  if (!searchInput.contains(event.target) && 
      !searchOptions.contains(event.target) && 
      !filterPanel.contains(event.target)) {
    closeSearchOptions();
  }
});

// ===== 新增好友功能 =====

// 打開新增好友模態框
function openAddFriendModal() {
  const overlay = document.getElementById('addFriendOverlay');
  overlay.classList.add('show');
  document.body.style.overflow = 'hidden';
  // 重置表單
  switchAddFriendTab('single');
}

// 關閉新增好友模態框
function closeAddFriendModal(event) {
  if (event && event.target.id !== 'addFriendOverlay') {
    return;
  }
  const overlay = document.getElementById('addFriendOverlay');
  overlay.classList.remove('show');
  document.body.style.overflow = '';
  // 重置表單
  document.querySelector('.add-friend-form').reset();
  document.getElementById('batchFileInput').value = '';
  document.getElementById('batchFileName').textContent = '選擇檔案或拖放至此';
  document.getElementById('batchFileNameEn').textContent = 'Choose file or drag here';
  document.getElementById('batchUploadBtn').disabled = true;
  const friendRegionDisplay = document.getElementById('friendRegionDisplay');
  if (friendRegionDisplay) friendRegionDisplay.value = '';
}

// ===== 地區三層式選擇器（Modal/Bottom Sheet）=====
const REGION_PICKER = {
  isOpen: false,
  target: null, // 'filter' | 'friend'
  step: 'zone', // 'zone' | 'city' | 'district' | 'customZone'
  temp: {
    zoneKey: '',
    zoneLabel: '',
    cityKey: '',
    cityLabel: '',
    districtKey: '',
    districtLabel: ''
  }
};

function getZoneItemsForStep1() {
  // 需求：只顯示五區域 + 自訂…
  return [
    { key: 'north', zh: '北部', en: 'North' },
    { key: 'central', zh: '中部', en: 'Central' },
    { key: 'south', zh: '南部', en: 'South' },
    { key: 'east', zh: '東部', en: 'East' },
    { key: 'islands', zh: '離島', en: 'Islands' },
    { key: 'custom', zh: '自訂…', en: 'Custom…', isCustom: true }
  ];
}

function getAllCitiesUnique() {
  const all = [];
  Object.keys(REGION_CASCADE.citiesByZone || {}).forEach(zone => {
    (REGION_CASCADE.citiesByZone[zone] || []).forEach(c => all.push(c));
  });
  const uniq = new Map(); // value -> item
  all.forEach(c => { if (c && c.value && !uniq.has(c.value)) uniq.set(c.value, c); });
  return Array.from(uniq.values());
}

function setRegionPickerTitle() {
  const titleZh = document.getElementById('regionPickerTitleZh');
  const titleEn = document.getElementById('regionPickerTitleEn');
  if (!titleZh || !titleEn) return;
  if (REGION_PICKER.step === 'zone') {
    titleZh.textContent = '選擇區域';
    titleEn.textContent = 'Select Area';
  } else if (REGION_PICKER.step === 'city') {
    titleZh.textContent = REGION_PICKER.temp.zoneLabel || '選擇縣市';
    titleEn.textContent = REGION_PICKER.temp.zoneLabel || 'Select City/County';
  } else if (REGION_PICKER.step === 'district') {
    titleZh.textContent = REGION_PICKER.temp.cityLabel || '選擇區/鄉鎮市';
    titleEn.textContent = REGION_PICKER.temp.cityLabel || 'Select District';
  } else if (REGION_PICKER.step === 'customZone') {
    titleZh.textContent = '自訂區域';
    titleEn.textContent = 'Custom Area';
  }
}

function setRegionPickerBackVisibility() {
  const backBtn = document.getElementById('regionPickerBackBtn');
  if (!backBtn) return;
  backBtn.style.visibility = (REGION_PICKER.step === 'zone') ? 'hidden' : 'visible';
}

function openRegionPicker(target) {
  const overlay = document.getElementById('regionPickerOverlay');
  if (!overlay) return;
  REGION_PICKER.isOpen = true;
  REGION_PICKER.target = target;
  REGION_PICKER.step = 'zone';
  REGION_PICKER.temp = { zoneKey:'', zoneLabel:'', cityKey:'', cityLabel:'', districtKey:'', districtLabel:'' };
  document.body.style.overflow = 'hidden';
  overlay.classList.add('show');
  renderRegionPicker();
}

function closeRegionPicker(event) {
  if (event && event.target && event.target.id !== 'regionPickerOverlay') return;
  const overlay = document.getElementById('regionPickerOverlay');
  if (!overlay) return;
  REGION_PICKER.isOpen = false;
  REGION_PICKER.target = null;
  document.body.style.overflow = '';
  overlay.classList.remove('show');
  const custom = document.getElementById('regionPickerCustom');
  const list = document.getElementById('regionPickerList');
  if (custom) custom.classList.remove('show');
  if (list) list.classList.remove('hide');
}

function regionPickerBack() {
  if (REGION_PICKER.step === 'district') {
    REGION_PICKER.step = 'city';
    REGION_PICKER.temp.districtKey = '';
    REGION_PICKER.temp.districtLabel = '';
  } else if (REGION_PICKER.step === 'city') {
    REGION_PICKER.step = 'zone';
    REGION_PICKER.temp.cityKey = '';
    REGION_PICKER.temp.cityLabel = '';
  } else if (REGION_PICKER.step === 'customZone') {
    REGION_PICKER.step = 'zone';
  }
  renderRegionPicker();
}

function regionPickerCancelCustom() {
  REGION_PICKER.step = 'zone';
  renderRegionPicker();
}

function regionPickerConfirmCustom() {
  const input = document.getElementById('regionPickerCustomInput');
  const label = String(input?.value || '').trim();
  if (!label) {
    const msg = getCurrentLang() === 'zh' ? '請輸入自訂區域名稱' : 'Please enter a custom area name';
    alert(msg);
    return;
  }
  REGION_PICKER.temp.zoneKey = 'custom';
  REGION_PICKER.temp.zoneLabel = label;
  REGION_PICKER.step = 'city';
  renderRegionPicker();
}

function renderRegionPicker() {
  setRegionPickerTitle();
  setRegionPickerBackVisibility();

  const list = document.getElementById('regionPickerList');
  const custom = document.getElementById('regionPickerCustom');
  if (!list || !custom) return;

  if (REGION_PICKER.step === 'customZone') {
    list.classList.add('hide');
    custom.classList.add('show');
    const input = document.getElementById('regionPickerCustomInput');
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

  if (REGION_PICKER.step === 'zone') {
    items = getZoneItemsForStep1().map(z => ({
      key: z.key,
      label: currentLang === 'zh' ? z.zh : z.en
    }));
  } else if (REGION_PICKER.step === 'city') {
    const zoneKey = REGION_PICKER.temp.zoneKey;
    const cityItems = zoneKey === 'custom'
      ? getAllCitiesUnique()
      : (REGION_CASCADE.citiesByZone[zoneKey] || []);
    items = cityItems.map(c => ({
      key: c.value,
      label: currentLang === 'zh' ? c.zh : c.en
    }));
  } else if (REGION_PICKER.step === 'district') {
    const cityKey = REGION_PICKER.temp.cityKey;
    const districts = REGION_CASCADE.districtsByCity[cityKey] || [];
    items = districts.map(d => ({ key: d, label: d }));
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
    <button type="button" class="region-picker-item" onclick="regionPickerSelect('${REGION_PICKER.step}','${String(it.key).replace(/'/g,"&#39;")}')">
      ${it.label}
    </button>
  `).join('');
}

function regionPickerSelect(step, key) {
  if (step === 'zone') {
    if (key === 'custom') {
      REGION_PICKER.step = 'customZone';
      renderRegionPicker();
      return;
    }
    const zone = getZoneItemsForStep1().find(z => z.key === key);
    REGION_PICKER.temp.zoneKey = key;
    REGION_PICKER.temp.zoneLabel = zone ? zone.zh : key;
    REGION_PICKER.step = 'city';
    renderRegionPicker();
    return;
  }

  if (step === 'city') {
    const zoneKey = REGION_PICKER.temp.zoneKey;
    const cities = zoneKey === 'custom' ? getAllCitiesUnique() : (REGION_CASCADE.citiesByZone[zoneKey] || []);
    const city = cities.find(c => c.value === key);
    REGION_PICKER.temp.cityKey = key;
    REGION_PICKER.temp.cityLabel = city ? city.zh : key;
    REGION_PICKER.step = 'district';
    renderRegionPicker();
    return;
  }

  if (step === 'district') {
    REGION_PICKER.temp.districtKey = key;
    REGION_PICKER.temp.districtLabel = key;
    applyRegionPickerResult();
    closeRegionPicker();
  }
}

function applyRegionPickerResult() {
  const t = REGION_PICKER.target;
  if (!t) return;
  const zoneEl = document.getElementById(t === 'filter' ? 'filterRegionZone' : 'friendRegionZone');
  const cityEl = document.getElementById(t === 'filter' ? 'filterRegionCity' : 'friendRegionCity');
  const distEl = document.getElementById(t === 'filter' ? 'filterRegionDistrict' : 'friendRegionDistrict');
  const displayEl = document.getElementById(t === 'filter' ? 'filterRegionDisplay' : 'friendRegionDisplay');

  if (zoneEl) zoneEl.value = REGION_PICKER.temp.zoneLabel || '';
  if (cityEl) cityEl.value = REGION_PICKER.temp.cityLabel || '';
  if (distEl) distEl.value = REGION_PICKER.temp.districtLabel || '';

  const displayText = [REGION_PICKER.temp.zoneLabel, REGION_PICKER.temp.cityLabel, REGION_PICKER.temp.districtLabel]
    .filter(Boolean)
    .join(' / ');
  if (displayEl) displayEl.value = displayText;
}

// 切換新增好友標籤頁
function switchAddFriendTab(tab) {
  // 更新標籤按鈕狀態
  document.querySelectorAll('.add-friend-tab').forEach(btn => btn.classList.remove('active'));
  if (tab === 'single') {
    document.getElementById('tabSingle').classList.add('active');
  } else {
    document.getElementById('tabBatch').classList.add('active');
  }
  
  // 更新內容區域
  document.querySelectorAll('.add-friend-tab-content').forEach(content => content.classList.remove('active'));
  if (tab === 'single') {
    document.getElementById('tabContentSingle').classList.add('active');
  } else {
    document.getElementById('tabContentBatch').classList.add('active');
  }
}

// 提交單筆新增
function submitSingleFriend(event) {
  event.preventDefault();
  
  const friendData = {
    name: document.getElementById('friendName').value,
    company: document.getElementById('friendCompany').value,
    position: document.getElementById('friendPosition').value,
    phone: document.getElementById('friendPhone').value,
    email: document.getElementById('friendEmail').value,
    category: document.getElementById('friendCategory')?.value || '',
    categoryDisplay: document.getElementById('friendCategoryDisplay')?.value || '',
    regionZone: document.getElementById('friendRegionZone')?.value || '',
    regionCity: document.getElementById('friendRegionCity')?.value || '',
    regionDistrict: document.getElementById('friendRegionDistrict')?.value || '',
    field: (document.getElementById('friendField')?.value || ''),
    fieldDisplay: (document.getElementById('friendFieldDisplay')?.value || '')
  };

  // 存到 localStorage，作為「公司索引」與後續通訊錄資料來源
  const friends = getStoredFriends();
  friends.push({
    ...friendData,
    createdAt: Date.now()
  });
  setStoredFriends(friends);
  refreshCompanyIndex();
  
  // 這裡可以連接實際的 API
  console.log('新增好友:', friendData);
  
  const zhElements = document.querySelectorAll('.lang-zh');
  const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';
  const msg = currentLang === 'zh' ? '好友已新增！' : 'Friend added successfully!';
  alert(msg);
  
  // 關閉模態框
  closeAddFriendModal();
  
  // 刷新搜尋結果
  searchDirectory();
}

// 下載範例檔案
function downloadSampleFile(event) {
  event.preventDefault();
  
  // 創建範例 Excel 數據
  const sampleData = [
    ['姓名', '公司', '職務', '電話', 'Email', '類別', '地區', '專業領域'],
    ['張三', 'UVACO', '業務經理', '0912345678', 'zhang@example.com', '商業', '台北市', '業務/銷售'],
    ['李四', '葡眾企業', '行銷專員', '0923456789', 'li@example.com', '服務', '新北市', '行銷/品牌']
  ];
  
  // 轉換為 CSV 格式（簡化版，實際應該使用 Excel 庫）
  const csvContent = sampleData.map(row => row.join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', '聯絡人匯入範例.csv');
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  const zhElements = document.querySelectorAll('.lang-zh');
  const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';
  const msg = currentLang === 'zh' ? '範例檔案已下載' : 'Sample file downloaded';
  // alert(msg);
}

// 處理批量檔案選擇
function handleBatchFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    const fileName = file.name;
    document.getElementById('batchFileName').textContent = fileName;
    document.getElementById('batchFileNameEn').textContent = fileName;
    document.getElementById('batchUploadBtn').disabled = false;
  } else {
    document.getElementById('batchFileName').textContent = '選擇檔案或拖放至此';
    document.getElementById('batchFileNameEn').textContent = 'Choose file or drag here';
    document.getElementById('batchUploadBtn').disabled = true;
  }
}

// 提交批量上傳
function submitBatchUpload() {
  const fileInput = document.getElementById('batchFileInput');
  const file = fileInput.files[0];
  
  if (!file) {
    const zhElements = document.querySelectorAll('.lang-zh');
    const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';
    const msg = currentLang === 'zh' ? '請選擇檔案' : 'Please select a file';
    alert(msg);
    return;
  }
  
  // 這裡可以連接實際的 API 上傳檔案
  console.log('上傳檔案:', file.name);
  
  const zhElements = document.querySelectorAll('.lang-zh');
  const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';
  const msg = currentLang === 'zh' ? '檔案上傳成功！' : 'File uploaded successfully!';
  alert(msg);
  
  // 關閉模態框
  closeAddFriendModal();
  
  // 刷新搜尋結果
  searchDirectory();
}

// 初始化（確保在 common.js initLangAndTheme 後也會把 option 文字切到正確語言）
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(initDirectoryIndexes, 0);
  });
} else {
  setTimeout(initDirectoryIndexes, 0);
}

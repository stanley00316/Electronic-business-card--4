let currentStyledElement = null;

function showFontStyleToolbar(element) {
  const toolbar = document.getElementById('fontStyleToolbar');
  if (!toolbar) return;

  // 只對姓名、職稱、標語欄位顯示工具列
  const isStyleable = element.id === 'previewNameZh' ||
                      element.id === 'previewTitleZh' ||
                      element.id === 'previewTitleEn' ||
                      element.closest('.slogan-item');

  if (!isStyleable) {
    hideFontStyleToolbar();
    return;
  }

  currentStyledElement = element;

  toolbar.classList.add('active');
  toolbar.style.position = 'fixed';
  toolbar.style.transform = 'translateX(-50%)';
  toolbar.style.visibility = 'hidden';

  const rect = element.getBoundingClientRect();
  const margin = 10;

  // 頁面頂部有固定的返回列＋標題列（含主題/儲存等按鈕），高度會因為大字模式、按鈕換行等
  // 情況變動，這裡直接量測目前實際佔用的高度，而不是寫死一個假設值，工具列絕對不能疊進去。
  const headerBar = document.querySelector('.edit-header-top');
  let safeTop = headerBar ? headerBar.getBoundingClientRect().bottom + margin : 60;

  // 姓名/職稱/標語這幾個欄位常常疊得很緊（例如姓名跟第一個標語中間只有 30 幾 px），
  // 只用固定頁首當下邊界還不夠：如果正上方緊貼著另一個欄位，也要把那個欄位的下緣
  // 一併當作邊界，否則工具列會蓋到「上一個欄位」而不是真正離開螢幕頂端。
  const otherStyleableEls = [
    document.getElementById('previewNameZh'),
    document.getElementById('previewTitleZh'),
    document.getElementById('previewTitleEn')
  ].concat(Array.from(document.querySelectorAll('.slogan-item .tagline')));
  otherStyleableEls.forEach((el) => {
    if (!el || el === element) return;
    const r = el.getBoundingClientRect();
    if (r.bottom <= rect.top) {
      safeTop = Math.max(safeTop, r.bottom + margin);
    }
  });

  // 依工具列「目前實際寬高」算出理想的 top/left（會夾在安全邊界跟螢幕範圍內）
  function computeTopLeft(toolbarWidth, toolbarHeight) {
    let top;
    const spaceAbove = rect.top - safeTop;
    if (spaceAbove >= toolbarHeight + margin) {
      top = rect.top - toolbarHeight - margin; // 上方空間足夠，浮在欄位正上方
    } else {
      top = rect.bottom + margin; // 上方空間不夠，改浮在欄位下方，避免蓋住其他內容
    }

    const halfWidth = toolbarWidth / 2;
    const leftBound = halfWidth + margin;
    const rightBound = window.innerWidth - halfWidth - margin;
    let left;
    if (leftBound > rightBound) {
      // 工具列本身已經接近或超過螢幕寬度，乾脆置中在整個畫面正中央，兩側留白對稱
      left = window.innerWidth / 2;
    } else {
      left = Math.min(rightBound, Math.max(leftBound, rect.left + rect.width / 2));
    }
    return { top, left };
  }

  // 工具列在手機窄螢幕上可能換行成兩排（寬高因此改變），先抓一次目前尺寸定位，
  // 套用後工具列的實際排版可能因為換行而跟預先量測時不同，所以套用完再量一次校正，
  // 確保最終呈現的位置一定跟工具列「真正的」寬高吻合，不會算錯貼到邊緣或疊到欄位。
  let toolbarRect = toolbar.getBoundingClientRect();
  let pos = computeTopLeft(toolbarRect.width || 220, toolbarRect.height || 50);
  toolbar.style.top = pos.top + 'px';
  toolbar.style.left = pos.left + 'px';

  toolbarRect = toolbar.getBoundingClientRect();
  pos = computeTopLeft(toolbarRect.width || 220, toolbarRect.height || 50);
  toolbar.style.top = pos.top + 'px';
  toolbar.style.left = pos.left + 'px';

  toolbar.style.visibility = '';

  // 更新工具列按鈕狀態
  updateToolbarState(element);
}

function hideFontStyleToolbar() {
  const toolbar = document.getElementById('fontStyleToolbar');
  if (toolbar) {
    toolbar.classList.remove('active');
  }
  currentStyledElement = null;
}

function updateToolbarState(element) {
  const style = window.getComputedStyle(element);
  const toolbar = document.getElementById('fontStyleToolbar');
  if (!toolbar) return;

  // 更新字體大小按鈕狀態
  const fontSize = parseInt(style.fontSize);
  toolbar.querySelectorAll('.size-s, .size-m, .size-l').forEach(btn => btn.classList.remove('active'));
  if (fontSize <= 14) {
    toolbar.querySelector('.size-s')?.classList.add('active');
  } else if (fontSize >= 24) {
    toolbar.querySelector('.size-l')?.classList.add('active');
  } else {
    toolbar.querySelector('.size-m')?.classList.add('active');
  }

  // 更新粗細按鈕狀態
  const fontWeight = style.fontWeight;
  toolbar.querySelectorAll('.font-style-btn[onclick^="setFontWeight"]').forEach(btn => btn.classList.remove('active'));
  if (fontWeight === 'bold' || parseInt(fontWeight) >= 600) {
    toolbar.querySelector('.font-style-btn[onclick="setFontWeight(\'bold\')"]')?.classList.add('active');
  } else {
    toolbar.querySelector('.font-style-btn[onclick="setFontWeight(\'normal\')"]')?.classList.add('active');
  }

  // 更新調色盤狀態
  const color = rgbToHex(style.color);
  const picker = document.getElementById('fontColorPicker');
  if (picker) {
    picker.value = color;
  }
}

function rgbToHex(rgb) {
  if (rgb.startsWith('#')) return rgb;
  const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!match) return rgb;
  return '#' + [match[1], match[2], match[3]].map(x => {
    const hex = parseInt(x).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

function setFontSize(size) {
  if (!currentStyledElement) return;

  const sizeMap = {
    'small': '14px',
    'medium': '18px',
    'large': '26px'
  };

  // 根據元素類型調整基準大小
  if (currentStyledElement.classList.contains('name')) {
    sizeMap.small = '18px';
    sizeMap.medium = '24px';
    sizeMap.large = '32px';
  } else if (currentStyledElement.classList.contains('tagline')) {
    sizeMap.small = '12px';
    sizeMap.medium = '16px';
    sizeMap.large = '20px';
  }

  currentStyledElement.style.fontSize = sizeMap[size] || sizeMap.medium;

  // 儲存樣式到 data 屬性
  currentStyledElement.dataset.fontSize = size;

  updateToolbarState(currentStyledElement);
}

function setFontWeight(weight) {
  if (!currentStyledElement) return;

  currentStyledElement.style.fontWeight = weight === 'bold' ? '700' : '400';
  currentStyledElement.dataset.fontWeight = weight;

  updateToolbarState(currentStyledElement);
}

function setFontColor(color) {
  if (!currentStyledElement) {
    return;
  }

  currentStyledElement.style.color = color;
  currentStyledElement.dataset.fontColor = color;

  // 更新調色盤顯示
  const picker = document.getElementById('fontColorPicker');
  if (picker && picker.value !== color) {
    picker.value = color;
  }

  // 確保焦點保持在元素上
  currentStyledElement.focus();
}

// 點擊其他地方時隱藏工具列
document.addEventListener('click', function(e) {
  const toolbar = document.getElementById('fontStyleToolbar');
  if (!toolbar) return;

  // 如果點擊的是工具列或工具列內的按鈕，不隱藏
  if (toolbar.contains(e.target)) return;

  // 如果點擊的是可編輯欄位，showFontStyleToolbar 會處理
  const editableTarget = e.target.closest('[contenteditable="true"]');
  if (editableTarget && editableTarget.classList.contains('edit-clickable')) return;

  // 否則隱藏工具列
  hideFontStyleToolbar();
});

// 滾動時更新工具列位置
document.addEventListener('scroll', function() {
  if (currentStyledElement) {
    const toolbar = document.getElementById('fontStyleToolbar');
    if (toolbar && toolbar.classList.contains('active')) {
      const rect = currentStyledElement.getBoundingClientRect();
      toolbar.style.top = (rect.top - 50) + 'px';
      toolbar.style.left = (rect.left + rect.width / 2) + 'px';
    }
  }
}, true);

// 修正：contenteditable 貼上時一律以「純文字」插入，避免插入 HTML 造成結構變動與游標跑位
// 並在貼上後強制觸發 input/blur 事件以同步資料
document.addEventListener('paste', function (e) {
  try {
    const t = e.target;
    if (!t || !t.closest) return;
    const el = t.closest('[contenteditable="true"]');
    if (!el) return;
    // 只處理可編輯欄位（避免影響其他輸入）
    if (!el.classList || !el.classList.contains('edit-clickable')) return;

    const text = (e.clipboardData || window.clipboardData)?.getData('text/plain');
    if (typeof text !== 'string') return;
    e.preventDefault();

    // 優先用 execCommand（相容性好），不行再用 Range
    if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
      document.execCommand('insertText', false, text);
    } else {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      sel.deleteFromDocument();
      const range = sel.getRangeAt(0);
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }

    // 強制觸發同步
    if (el.onblur) el.onblur();
  } catch (_e) {}
});

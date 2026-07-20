// ===== 大字模式（照顧長輩／視力不佳的使用者） =====
// 注意：這裡刻意不要跟 edit-chunk-1.js 的 setFontSize() 撞名，那是控制「單一文字元素」
// （姓名/職稱/標語）字體樣式的功能，跟這裡「整頁控制項一起放大」是完全不同的兩件事。
function setLargeTextMode(on) {
  const isOn = !!on;
  document.body.classList.toggle('a11y-large-text', isOn);

  const normalBtn = document.getElementById('a11yNormalBtn');
  const largeBtn = document.getElementById('a11yLargeBtn');
  if (normalBtn) normalBtn.classList.toggle('is-active', !isOn);
  if (largeBtn) largeBtn.classList.toggle('is-active', isOn);

  const iconBtn = document.getElementById('a11yToggleIconBtn');
  if (iconBtn) {
    const zh = iconBtn.querySelector('.lang-zh');
    const en = iconBtn.querySelector('.lang-en');
    if (zh) zh.textContent = isOn ? '一般字' : '大字';
    if (en) en.textContent = isOn ? 'Normal' : 'Large';
  }

  try { localStorage.setItem('UVACO_A11Y_LARGE_TEXT', isOn ? '1' : '0'); } catch (e) {}
}

// 手機窄螢幕的單一圖示按鈕：直接切換目前狀態
function toggleLargeTextMode() {
  setLargeTextMode(!document.body.classList.contains('a11y-large-text'));
}

// 頁面最上方（<body> 一開始）已經有一段內嵌 script 提早套用過 body.a11y-large-text，
// 避免畫面閃爍；這裡（script 在頁尾載入，此時按鈕 DOM 已經存在）只需要把「一般／大字」
// 切換按鈕的 active 樣式同步成目前狀態，不需要重新套用 body class。
(function syncLargeTextToggleUI() {
  setLargeTextMode(document.body.classList.contains('a11y-large-text'));
})();

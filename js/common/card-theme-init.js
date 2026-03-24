import { setTheme } from './theme-lang.js';

// ===== 卡片主題管理（用於查看他人名片時顯示對方主題） =====

// 從 URL 參數讀取對方的主題設定（查看他人名片時使用）
export function initCardThemeFromURL() {
  const urlParams = new URLSearchParams(window.location.search);
  const cardTheme = urlParams.get('cardTheme'); // 例如：?cardTheme=3
  if (cardTheme) {
    const themeNumber = parseInt(cardTheme);
    if (themeNumber >= 1 && themeNumber <= 9) {
      // 查看他人名片時，套用對方的主題到整個頁面
      setTheme(themeNumber);
    }
  }
}

// 從數據屬性讀取（如果卡片有 data-card-theme 屬性）
export function initCardThemeFromData() {
  const card = document.querySelector('.card');
  if (card && card.dataset.cardTheme) {
    const themeNumber = parseInt(card.dataset.cardTheme);
    if (themeNumber >= 1 && themeNumber <= 9) {
      // 查看他人名片時，套用對方的主題到整個頁面
      setTheme(themeNumber);
    }
  }
}

// 初始化卡片主題（在查看他人名片頁面）
export function initCardTheme() {
  // 優先順序：URL 參數 > 數據屬性
  // 注意：不使用 localStorage，因為要顯示對方的主題，而不是自己的主題
  const urlParams = new URLSearchParams(window.location.search);
  const hasCardTheme = urlParams.get('cardTheme');
  
  if (hasCardTheme) {
    initCardThemeFromURL();
  } else {
    initCardThemeFromData();
  }
}


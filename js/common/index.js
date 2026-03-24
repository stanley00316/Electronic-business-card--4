/**
 * 共用模組入口：維持與舊 common.js 相同的全域 API（window.*）
 */
import './sw-update.js';
import './nav-tap-effect.js';
import './sentry-global-errors.js';
import { trackEvent } from './analytics.js';
import {
  setLang,
  setTheme,
  preloadAllThemes,
  initViewerPage,
  initLangAndTheme,
  loadThemeCSS,
  preloadThemeCSS,
  loadOwnerThemeCSS,
  updateThemeButtons,
  updateDirectorySelectOptions
} from './theme-lang.js';
import { setupLazyImage, initLazyImages } from './lazy-images.js';
import { compressImageToWebP, isWebPSupported } from './image-compress.js';
import { ensureEditContactLayoutToggle } from './contact-layout-edit.js';
import { initCardTheme } from './card-theme-init.js';

window.setLang = setLang;
window.setTheme = setTheme;
window.preloadAllThemes = preloadAllThemes;
window.initViewerPage = initViewerPage;
window.loadThemeCSS = loadThemeCSS;
window.preloadThemeCSS = preloadThemeCSS;
window.loadOwnerThemeCSS = loadOwnerThemeCSS;
window.updateThemeButtons = updateThemeButtons;
window.updateDirectorySelectOptions = updateDirectorySelectOptions;
window.setupLazyImage = setupLazyImage;
window.initLazyImages = initLazyImages;
window.compressImageToWebP = compressImageToWebP;
window.isWebPSupported = isWebPSupported;
window.trackEvent = trackEvent;

function onReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}

onReady(initLangAndTheme);
onReady(ensureEditContactLayoutToggle);
onReady(initCardTheme);

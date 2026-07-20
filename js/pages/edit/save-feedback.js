// ===== 儲存成功/失敗白話文提示（取代原生 alert()/confirm()） =====
// 目的：saveCard() 遇到失敗時，過去會直接把英文技術錯誤（Bucket not found、
// RLS policy denied、JWT expired...）拼進 alert() 顯示給使用者，一般人完全看不懂也無法自行排除。
// 這裡統一改用白話中文說明「發生了什麼、該怎麼做」，技術細節只留給 console 除錯用。

// 顯示提示彈窗。
// kind: 'success' | 'error' | 'confirm'
// opts: {
//   icon, titleZh, titleEn, msgZh, msgEn,
//   actions: [{ labelZh, labelEn, primary, result, onClick }]
// }
// 回傳 Promise：使用者按下某個按鈕後 resolve（confirm 情境可直接 await 取得 true/false）。
function showSaveFeedback(kind, opts) {
  opts = opts || {};
  const overlay = document.getElementById('saveFeedbackOverlay');
  const iconEl = document.getElementById('saveFeedbackIcon');
  const titleEl = document.getElementById('saveFeedbackTitle');
  const msgEl = document.getElementById('saveFeedbackMsg');
  const actionsEl = document.getElementById('saveFeedbackActions');

  const zhElements = document.querySelectorAll('.lang-zh');
  const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';

  // 保底：萬一彈窗 DOM 不存在（理論上不會發生），退回原生 alert/confirm，避免訊息整個消失不見
  if (!overlay || !iconEl || !titleEl || !msgEl || !actionsEl) {
    const fallbackMsg = currentLang === 'zh' ? (opts.msgZh || '') : (opts.msgEn || opts.msgZh || '');
    if (kind === 'confirm') return Promise.resolve(window.confirm(fallbackMsg));
    window.alert(fallbackMsg);
    return Promise.resolve(true);
  }

  const defaultIcon = kind === 'success' ? '✅' : (kind === 'confirm' ? '📋' : '⚠️');
  iconEl.textContent = opts.icon || defaultIcon;
  titleEl.textContent = currentLang === 'zh' ? (opts.titleZh || '') : (opts.titleEn || opts.titleZh || '');
  msgEl.textContent = currentLang === 'zh' ? (opts.msgZh || '') : (opts.msgEn || opts.msgZh || '');
  actionsEl.innerHTML = '';

  function closeOverlay() {
    overlay.classList.remove('show');
    document.body.style.overflow = '';
  }

  return new Promise(function (resolve) {
    const actions = (opts.actions && opts.actions.length) ? opts.actions : [
      { labelZh: '知道了', labelEn: 'OK', primary: true }
    ];

    actions.forEach(function (action) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'save-feedback-btn ' + (action.primary ? 'save-feedback-btn-primary' : 'save-feedback-btn-secondary');
      btn.textContent = currentLang === 'zh' ? (action.labelZh || '') : (action.labelEn || action.labelZh || '');
      btn.onclick = function () {
        closeOverlay();
        if (typeof action.onClick === 'function') action.onClick();
        resolve(action.result !== undefined ? action.result : !!action.primary);
      };
      actionsEl.appendChild(btn);
    });

    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
  });
}

// 把 Supabase/網路錯誤轉成白話文說明。技術原文只放進 result.detail/result.code，
// 供「複製錯誤代碼給客服」或 console.error 使用，絕不直接拼進畫面文字。
function classifySaveError(e) {
  const detail = (e && (e.message || e.error_description)) ? String(e.message || e.error_description) : String(e || '');
  const lower = detail.toLowerCase();
  const status = String((e && (e.statusCode != null ? e.statusCode : e.status)) || '');
  const code = (e && e.code) || '';
  const reason = (e && e.reason) || '';

  const isAuthError =
    reason === 'JWT_EXPIRED' || reason === 'NO_SESSION' || code === 'PGRST303' ||
    lower.includes('jwt') || lower.includes('token') || lower.includes('session');

  const isNetworkError =
    lower.includes('failed to fetch') || lower.includes('network') ||
    lower.includes('timeout') || lower.includes('load failed');

  let result;

  if (detail.includes('Bucket not found') || status === '404') {
    result = {
      kind: 'storage_bucket',
      titleZh: '圖片上傳失敗', titleEn: 'Image Upload Failed',
      msgZh: '系統目前還沒設定好存放照片的空間，暫時無法上傳圖片，但文字資料仍可以正常儲存。請聯絡系統管理員協助設定。',
      msgEn: 'The photo storage space is not set up yet, so the image could not be uploaded. Your text info can still be saved. Please contact your administrator.'
    };
  } else if (status === '403' || lower.includes('permission') || lower.includes('policy') || lower.includes('not authorized') || lower.includes('unauthorized')) {
    result = {
      kind: 'storage_permission',
      titleZh: '圖片上傳失敗', titleEn: 'Image Upload Failed',
      msgZh: '目前的帳號權限還不能上傳照片，可能是系統設定尚未完成。請稍後再試，或聯絡管理員確認權限設定。',
      msgEn: 'This account does not have permission to upload photos yet. Please try again later or contact your administrator.'
    };
  } else if (detail.includes('PERMISSION_DENIED_COMPANY_MISMATCH')) {
    result = {
      kind: 'company_mismatch',
      titleZh: '無法上傳這張照片', titleEn: 'Cannot Upload This Photo',
      msgZh: '這張名片不是您負責管理的公司員工，所以沒有辦法幫忙上傳照片。如需協助，請聯絡系統管理員。',
      msgEn: 'This card does not belong to an employee under your managed company, so the photo cannot be uploaded. Please contact your administrator for help.'
    };
  } else if (isAuthError) {
    result = {
      kind: 'auth',
      titleZh: '登入已逾時', titleEn: 'Session Expired',
      msgZh: '您已經有一段時間沒有操作，為了保護您的資料，需要重新登入一次。別擔心，重新登入後可以再回來繼續編輯。',
      msgEn: 'Your session has expired to keep your data safe. Please log in again — your edits will still be here afterward.'
    };
  } else if (isNetworkError) {
    result = {
      kind: 'network',
      titleZh: '網路好像不太穩定', titleEn: 'Network Seems Unstable',
      msgZh: '已經嘗試存了好幾次，但因為網路連線不穩定，暫時存不進去。請檢查一下手機或電腦的網路（Wi-Fi／行動網路），恢復後再按一次「儲存」。',
      msgEn: 'We tried saving several times, but the network connection seems unstable. Please check your Wi-Fi or mobile data, then try saving again.'
    };
  } else {
    result = {
      kind: 'unknown',
      titleZh: '儲存時發生問題', titleEn: 'Something Went Wrong',
      msgZh: '這次儲存沒有成功，通常重新整理頁面、再儲存一次就可以了。如果重試幾次都不行，麻煩聯絡客服，我們會盡快協助您。',
      msgEn: 'This save did not go through. Refreshing the page and saving again usually fixes it. If it keeps failing, please contact support.'
    };
  }

  result.detail = detail;
  result.code = code;
  return result;
}

// 把技術錯誤細節複製到剪貼簿，方便使用者回報客服，但不會直接顯示在畫面上
function copyErrorDetailToClipboard(result) {
  const text = '錯誤代碼：' + (result.code || '(無)') + '\n細節：' + (result.detail || '(無)');
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    }
  } catch (e) {}
}

// 這裡把使用者輸入的各種聯絡方式整理成公開名片能開啟的標準格式。
// 目標是讓不熟手機操作的使用者能直接填帳號或電話，系統再協助轉成正確連結。
function safeDecodeContactValue(value) {
  try {
    return decodeURIComponent(value);
  } catch (e) {
    return String(value || '');
  }
}

function normalizeLinePersonalContactLink(value) {
  let raw = String(value || '').trim();
  if (/^line\.me\//i.test(raw)) raw = 'https://' + raw;
  return /^https?:\/\/line\.me\/(R\/)?ti\/p\//i.test(raw) ? raw : '';
}

function normalizeOfficialLineContactLink(value) {
  let raw = String(value || '').trim();
  if (/^line\.me\//i.test(raw)) raw = 'https://' + raw;
  if (/^https?:\/\/line\.me\/R\/ti\/p\//i.test(raw)) {
    return raw.replace(/\/@([^/?#]+)/, function (_, id) {
      return '/' + encodeURIComponent('@' + id);
    });
  }
  return /^@[A-Za-z0-9._-]{3,32}$/.test(raw) ? 'https://line.me/R/ti/p/' + encodeURIComponent(raw) : '';
}

function normalizeFacebookContactLink(value) {
  const raw = String(value || '').trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  const account = raw.replace(/^@+/, '');
  if (/^(www\.)?(facebook|fb|m\.facebook)\.com\//i.test(account)) return 'https://' + account;
  return /^[A-Za-z0-9.]{5,50}$/.test(account) ? 'https://www.facebook.com/' + account : '';
}

function normalizeLinkedInContactLink(value) {
  const raw = String(value || '').trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  const account = raw.replace(/^@+/, '').replace(/^\/+/, '');
  if (/^(www\.)?linkedin\.com\//i.test(account)) return 'https://' + account;
  if (/^in\//i.test(account)) return 'https://www.linkedin.com/' + account;
  return /^[A-Za-z0-9_-]{3,100}$/.test(account) ? 'https://www.linkedin.com/in/' + account : '';
}

function normalizeTwitterContactLink(value) {
  const raw = String(value || '').trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^(twitter|x)\.com\//i.test(raw)) return 'https://' + raw;
  const handle = raw.replace(/^@/, '');
  return /^[A-Za-z0-9_]{4,15}$/.test(handle) ? 'https://x.com/' + handle : '';
}

function normalizeYouTubeContactLink(value) {
  const raw = String(value || '').trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  const account = raw.replace(/^\/+/, '');
  if (/^(www\.)?(youtube\.com|youtu\.be)\//i.test(account)) return 'https://' + account;
  if (/^@[\w.-]{3,30}$/i.test(account)) return 'https://www.youtube.com/' + account;
  return /^[\w.-]{3,30}$/i.test(account) ? 'https://www.youtube.com/@' + account : '';
}

function normalizeWhatsAppContactLink(value) {
  const raw = String(value || '').trim();
  const apiPhone = raw.match(/[?&]phone=([^&#]+)/i);
  const waPhone = raw.match(/wa\.me\/([^?#]+)/i);
  let phoneText = apiPhone ? safeDecodeContactValue(apiPhone[1]) : (waPhone ? safeDecodeContactValue(waPhone[1]) : raw);
  let phone = phoneText.replace(/[^\d+]/g, '');
  if (phone.startsWith('+')) phone = phone.slice(1);
  phone = phone.replace(/[^\d]/g, '');
  if (/^09\d{8}$/.test(phone)) phone = '886' + phone.slice(1);
  return (/^\d{8,15}$/.test(phone) && !/^0/.test(phone)) ? 'https://wa.me/' + phone : '';
}

// 微信：整理成手機可嘗試開啟微信 App 的連結；公開名片頁另有複製微信號備援。
function getWeChatIdFromLink(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const chatMatch = raw.match(/^weixin:\/\/dl\/chat\?([^#&]+)/i);
  if (chatMatch) {
    try {
      return decodeURIComponent(chatMatch[1]).trim();
    } catch (e) {
      return String(chatMatch[1] || '').trim();
    }
  }
  if (/^weixin:/i.test(raw) || /^https?:\/\//i.test(raw)) return '';
  return raw.replace(/^@+/, '').trim();
}

function isSafeWeChatId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z][A-Za-z0-9_-]{5,31}$/.test(id) || /^wxid_[A-Za-z0-9_-]{6,64}$/.test(id);
}

function normalizeWeChatContactLink(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^weixin:/i.test(raw) || /^https?:\/\//i.test(raw)) return raw;
  const id = getWeChatIdFromLink(raw);
  return id ? 'weixin://dl/chat?' + encodeURIComponent(id) : '';
}

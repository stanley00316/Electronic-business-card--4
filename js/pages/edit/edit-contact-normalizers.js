// 這裡把使用者輸入的微信號整理成手機可嘗試開啟微信 App 的連結。
// 若微信 App 或瀏覽器不支援外部開啟，公開名片頁仍會複製微信號作為備援。
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

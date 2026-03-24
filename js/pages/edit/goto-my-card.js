// 前往「我的名片」頁面
async function gotoMyCard(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  try {
    if (!window.UVACO_CLOUD || !UVACO_CLOUD.hasConfig()) {
      window.location.href = 'auth.html?next=edit.html';
      return false;
    }
    const s = await UVACO_CLOUD.getSession();
    const uid = s && s.session && s.session.user ? String(s.session.user.id || '').trim() : '';
    if (!uid) {
      window.location.href = 'auth.html?next=edit.html';
      return false;
    }
    window.location.href = 'card.html?id=' + encodeURIComponent(uid);
    return false;
  } catch (e) {
    window.location.href = 'auth.html?next=edit.html';
    return false;
  }
}

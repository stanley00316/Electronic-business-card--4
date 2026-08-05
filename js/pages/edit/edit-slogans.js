// 編輯頁標語管理：新增、刪除與同步預覽上的標語欄位。
function addSloganToPreview(lang) {
  const containerId = lang === 'zh' ? 'previewSlogansZh' : 'previewSlogansEn';
  const container = document.getElementById(containerId);
  if (!container) return;

  const sloganItem = document.createElement('div');
  sloganItem.className = 'slogan-item';

  const tagline = document.createElement('div');
  tagline.className = `tagline lang-${lang} edit-clickable`;
  tagline.contentEditable = 'true';
  tagline.textContent = lang === 'zh' ? '新標語' : 'New Slogan';
  tagline.onblur = function() { updateSlogansPreview(); };
  tagline.onclick = function() { focusEdit(this); };

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'slogan-delete-btn';
  deleteBtn.textContent = '✕';
  deleteBtn.title = lang === 'zh' ? '刪除標語' : 'Delete slogan';
  deleteBtn.onclick = function(event) {
    event.stopPropagation();
    deleteSloganFromPreview(this);
  };

  // 組裝並加入
  sloganItem.appendChild(tagline);
  sloganItem.appendChild(deleteBtn);
  container.appendChild(sloganItem);

  // 同步整理（避免空白被清掉、確保事件存在）
  updateSlogansPreview();

  // 不自動切換語系（保持介面語言不變），僅聚焦到新標語
  setTimeout(() => {
    try { sloganItem.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
    try { focusEdit(tagline); } catch (e) { try { tagline.focus(); } catch (_e) {} }
  }, 0);

  return;

  // 下面原本的 append 若存在，保留但不會走到（避免重複 append）
  sloganItem.appendChild(tagline);
  sloganItem.appendChild(deleteBtn);
  container.appendChild(sloganItem);

  tagline.focus();
  focusEdit(tagline);
}

// 從預覽刪除標語
function deleteSloganFromPreview(btn) {
  if (!btn) return;
  const zhElements = document.querySelectorAll('.lang-zh');
  const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';
  const confirmMsg = currentLang === 'zh' ? '確定要刪除此標語嗎？' : 'Are you sure you want to delete this slogan?';

  if (confirm(confirmMsg)) {
    const item = btn.closest('.slogan-item');
    if (item) {
      item.remove();
      // 觸發更新以確保資料同步
      if (typeof updateCompanyFromSlogans === 'function') {
        updateCompanyFromSlogans();
      }
    }
  }
}

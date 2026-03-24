/* 底部導覽點擊回饋：僅在存在 .bottom-nav 時綁定；無則不重試 */
(function initNavTapEffect() {
  function setupNavTapEffect() {
    const nav = document.querySelector('.bottom-nav');
    if (!nav) return;
    const navItems = nav.querySelectorAll('.nav-item');
    if (!navItems.length) return;

    navItems.forEach(function(item) {
      item.addEventListener('touchstart', function() {
        this.classList.add('tapped');
      }, { passive: true });

      item.addEventListener('touchend', function() {
        const el = this;
        setTimeout(function() {
          el.classList.remove('tapped');
        }, 300);
      }, { passive: true });

      item.addEventListener('touchcancel', function() {
        this.classList.remove('tapped');
      }, { passive: true });

      item.addEventListener('mousedown', function() {
        this.classList.add('tapped');
      });

      item.addEventListener('mouseup', function() {
        const el = this;
        setTimeout(function() {
          el.classList.remove('tapped');
        }, 300);
      });

      item.addEventListener('mouseleave', function() {
        this.classList.remove('tapped');
      });
    });
  }

  function run() {
    setupNavTapEffect();
    setTimeout(setupNavTapEffect, 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
export {};

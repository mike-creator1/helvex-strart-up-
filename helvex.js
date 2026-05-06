    (function () {
      var reveals = document.querySelectorAll('.reveal');
      if (!('IntersectionObserver' in window)) {
        reveals.forEach(function (r) { r.classList.add('is-visible'); });
        return;
      }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry, i) {
          if (entry.isIntersecting) {
            setTimeout(function () { entry.target.classList.add('is-visible'); }, Math.min(i * 25, 200));
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.10, rootMargin: '0px 0px -50px 0px' });
      reveals.forEach(function (r) { io.observe(r); });
    })();

    (function () {
      var orbs = document.querySelectorAll('.hero-orb');
      if (!orbs.length) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      window.addEventListener('scroll', function () {
        var y = window.scrollY;
        if (y < 1600) {
          orbs.forEach(function (o, i) {
            o.style.transform = 'translate3d(0,' + (y * 0.04 * (i + 1)) + 'px,0)';
          });
        }
      }, { passive: true });
    })();

    /* Research publications filter */
    (function () {
      var filters = document.querySelectorAll('.pub-filter[data-filter]');
      var grid    = document.getElementById('publications-grid');
      if (!filters.length || !grid) return;
      var cards = grid.querySelectorAll('.pub-card[data-cat]');

      function apply(filter) {
        cards.forEach(function (card) {
          if (filter === 'all' || card.getAttribute('data-cat') === filter) {
            card.classList.remove('is-hidden');
          } else {
            card.classList.add('is-hidden');
          }
        });
        filters.forEach(function (b) {
          b.classList.toggle('pub-filter-active', b.getAttribute('data-filter') === filter);
        });
      }

      filters.forEach(function (btn) {
        btn.addEventListener('click', function () {
          apply(btn.getAttribute('data-filter'));
        });
      });
    })();

    /* Mobile nav drawer */
    (function () {
      var trigger = document.querySelector('.mobile-menu-trigger');
      var menu    = document.querySelector('.mobile-menu');
      if (!trigger || !menu) return;

      function open() {
        menu.setAttribute('data-open', '');
        menu.setAttribute('aria-hidden', 'false');
        trigger.setAttribute('aria-expanded', 'true');
        document.body.classList.add('menu-open');
        var first = menu.querySelector('.mobile-menu-close');
        if (first) {
          setTimeout(function () {
            try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); }
          }, 60);
        }
      }
      function close() {
        menu.removeAttribute('data-open');
        menu.setAttribute('aria-hidden', 'true');
        trigger.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('menu-open');
      }

      trigger.addEventListener('click', function (e) {
        e.preventDefault();
        if (menu.hasAttribute('data-open')) close();
        else open();
      });

      menu.querySelectorAll('[data-close]').forEach(function (el) {
        el.addEventListener('click', function (e) { e.preventDefault(); close(); });
      });
      menu.querySelectorAll('.mobile-menu-link').forEach(function (link) {
        link.addEventListener('click', function () {
          // Let the navigation start, then close.
          setTimeout(close, 30);
        });
      });

      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && menu.hasAttribute('data-open')) close();
      });
    })();

    /* Workspace feature modals
       Scroll-lock strategy: simply set overflow:hidden on <html>+<body>
       and compensate for the scrollbar gutter. The page's actual scroll
       position is never touched, so closing the modal leaves the user
       exactly where they were — no jump to top, no jump back. */
    (function () {
      var triggers = document.querySelectorAll('[data-feature]');
      var modals   = document.querySelectorAll('.ws-modal[data-modal]');
      if (!triggers.length || !modals.length) return;

      var lastTrigger = null;
      var lockCount   = 0;
      var savedHtml   = null;
      var savedBody   = null;

      function lockScroll() {
        if (lockCount === 0) {
          var sbw = window.innerWidth - document.documentElement.clientWidth;
          savedHtml = {
            overflow: document.documentElement.style.overflow,
          };
          savedBody = {
            overflow: document.body.style.overflow,
            paddingRight: document.body.style.paddingRight,
          };
          document.documentElement.style.overflow = 'hidden';
          document.body.style.overflow = 'hidden';
          if (sbw > 0) document.body.style.paddingRight = sbw + 'px';
        }
        lockCount++;
      }
      function unlockScroll() {
        lockCount = Math.max(0, lockCount - 1);
        if (lockCount === 0 && savedHtml && savedBody) {
          document.documentElement.style.overflow = savedHtml.overflow;
          document.body.style.overflow            = savedBody.overflow;
          document.body.style.paddingRight        = savedBody.paddingRight;
          savedHtml = savedBody = null;
        }
      }

      function openModal(name) {
        var modal = document.querySelector('.ws-modal[data-modal="' + name + '"]');
        if (!modal) return;
        if (modal.hasAttribute('data-open')) return;
        lockScroll();
        modal.setAttribute('data-open', '');
        modal.setAttribute('aria-hidden', 'false');
        // Reset the modal's own scroll so users start at the top of the panel
        var shell = modal.querySelector('.ws-modal-shell');
        if (shell) shell.scrollTop = 0;
        var closeBtn = modal.querySelector('.ws-modal-close');
        if (closeBtn) {
          setTimeout(function () {
            try { closeBtn.focus({ preventScroll: true }); } catch (e) { closeBtn.focus(); }
          }, 60);
        }
      }

      function closeModal(modal) {
        if (!modal) return;
        if (!modal.hasAttribute('data-open')) return;
        modal.removeAttribute('data-open');
        modal.setAttribute('aria-hidden', 'true');
        unlockScroll();
        if (lastTrigger) {
          try { lastTrigger.focus({ preventScroll: true }); }
          catch (e) { /* older browsers ignore preventScroll */ }
        }
      }

      function closeAll() {
        document.querySelectorAll('.ws-modal[data-open]').forEach(closeModal);
      }

      triggers.forEach(function (btn) {
        btn.addEventListener('click', function () {
          lastTrigger = btn;
          openModal(btn.getAttribute('data-feature'));
        });
      });

      modals.forEach(function (modal) {
        modal.querySelectorAll('[data-close]').forEach(function (el) {
          el.addEventListener('click', function (e) {
            e.preventDefault();
            closeModal(modal);
          });
        });
      });

      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' || e.key === 'Esc') {
          if (document.querySelector('.ws-modal[data-open]')) {
            e.preventDefault();
            closeAll();
          }
        }
      });
    })();

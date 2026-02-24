(function () {
  // -------------------------
  // 108™ Supply: Sticky-accurate scroll system
  // -------------------------

  // 1) Lenis
  const lenis = new Lenis({ autoRaf: true });
  window.lenis = lenis;
  let resizeRaf = 0;
  let resizeTimer = 0;

  // 2) Helpers
  function readPxVar(varName, fallbackPx = 0) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (!v) return fallbackPx;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallbackPx;
  }

  // 3) Tune knob (console)
  //  -40 = niżej, +40 = wyżej
  window._108TunePx = window._108TunePx || 0;

  function desiredNavigatorTop() {
    // EXACTLY your sticky top: top: var(--gap--80)
    return readPxVar('--gap--80', 80) + (Number(window._108TunePx) || 0);
  }

  // Shared offset helper used by filter/grid scripts.
  window._108StickyOffset = function () {
    return -desiredNavigatorTop();
  };

  // Debounced Lenis resize for heavy layout mutations (videos/images/load-more).
  window._108RefreshLenis = function () {
    if (!window.lenis || typeof window.lenis.resize !== 'function') return;
    if (resizeRaf) return;

    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      try { window.lenis.resize(); } catch (e) {}
    });

    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      try { window.lenis.resize(); } catch (e) {}
    }, 80);
  };

  // 4) Base scroll (Lenis-first)
  window._108ScrollTo = function (target, opts = {}) {
    const behavior = opts.behavior || 'smooth';
    const offset = (typeof opts.offset === 'number') ? opts.offset : 0;
    const duration = (opts.duration ?? 1.05);

    if (window.lenis && typeof window.lenis.scrollTo === 'function') {
      return window.lenis.scrollTo(target, {
        offset,
        duration: behavior === 'smooth' ? duration : 0
      });
    }

    // fallback native
    let top = 0;
    if (typeof target === 'number') {
      top = target + offset;
    } else if (target && target.getBoundingClientRect) {
      top = target.getBoundingClientRect().top + window.pageYOffset + offset;
    }
    window.scrollTo({ top: Math.max(0, top), behavior });
  };

  // 5) Sticky snap scroll:
  // scroll -> then nudge so `.navigator` sits EXACTLY at top: var(--gap--80)
  window._108ScrollToStickySnap = function (targetEl, opts = {}) {
    const behavior = opts.behavior || 'smooth';
    const duration = opts.duration ?? 1.05;

    const nav = document.querySelector('.navigator');
    if (!nav) {
      // fallback if no sticky bar
      return window._108ScrollTo(targetEl, { behavior, duration, offset: 0 });
    }

    // First pass scroll (no offset)
    window._108ScrollTo(targetEl, { behavior, duration, offset: 0 });

    // Single gentle correction after the primary smooth scroll.
    const settleMs = Math.max(140, Math.round(duration * 1000) + 40);
    setTimeout(() => {
      const desiredTop = desiredNavigatorTop();
      const rect = nav.getBoundingClientRect();
      const delta = rect.top - desiredTop;

      // Avoid tiny micro-jumps.
      if (Math.abs(delta) < 6) return;

      const targetY = window.scrollY + delta;
      window._108ScrollTo(targetY, { behavior: 'smooth', duration: 0.22, offset: 0 });
    }, settleMs);
  };

  // 6) Anchors (same-page + cross-page)
  const PENDING_KEY = '_108_pending_hash';

  function scrollToHash(hash) {
    if (!hash || hash === '#') return false;

    const id = decodeURIComponent(hash.slice(1));
    const el = document.getElementById(id);
    if (!el) return false;

    window._108ScrollToStickySnap(el, { behavior: 'smooth', duration: 1.05 });
    history.replaceState(null, '', hash);
    return true;
  }

  // capture click early (Webflow nav etc.)
  window.addEventListener('click', function (e) {
    const a = e.target.closest('a[href]');
    if (!a) return;

    const href = a.getAttribute('href');
    if (!href || !href.includes('#')) return;

    let url;
    try { url = new URL(href, window.location.href); } catch { return; }
    if (!url.hash || url.hash === '#') return;

    if (url.origin !== window.location.origin) return;

    const samePage = (url.pathname === window.location.pathname);

    if (samePage) {
      const ok = scrollToHash(url.hash);
      if (!ok) return;

      e.preventDefault();
      e.stopImmediatePropagation();
    } else {
      // cross-page: remember hash, let navigation happen
      sessionStorage.setItem(PENDING_KEY, url.hash);
    }
  }, true);

  // cross-page pending hash
  function onReady() {
    const pending = sessionStorage.getItem(PENDING_KEY);
    if (!pending) return;

    sessionStorage.removeItem(PENDING_KEY);
    setTimeout(() => scrollToHash(pending), 60);
  }

  // Keep Lenis dimensions fresh on viewport changes (iPad orientation, Safari bars).
  window.addEventListener('resize', window._108RefreshLenis, { passive: true });
  window.addEventListener('orientationchange', window._108RefreshLenis, { passive: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }

  // 7) Tiny debug helper (optional)
  window._108DebugSticky = function () {
    const nav = document.querySelector('.navigator');
    if (!nav) return { ok: false, reason: "No .navigator found" };
    const rect = nav.getBoundingClientRect();
    return {
      ok: true,
      gap80: readPxVar('--gap--80', 80),
      tune: Number(window._108TunePx) || 0,
      desiredTop: desiredNavigatorTop(),
      navTop: rect.top,
      delta: rect.top - desiredNavigatorTop()
    };
  };
})();
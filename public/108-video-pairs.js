/**
 * 108™ Supply — Video Pairs Engine (In-use / Blank)
 * Purpose:
 * - Autoplay visible card videos (IntersectionObserver) with a playing cap per breakpoint
 * - Swap between two videos (example vs dark) via opacity classes
 * - Desktop hover: swap only after buddy is loaded + synced for seamless continuity
 * - Optional view mode buttons: .view-inuse and .view-blank (toggles body[data-view])
 *
 * Requirements:
 * - Wrapper: [data-video-pair]
 * - Two <video> inside:
 *   - data-role="example"
 *   - data-role="dark"
 * - Hover overlay selector matches OVERLAY (default: .card_link_overlay)
 * - If using FS List, it rescans on list DOM changes: [fs-list-element="list"]
 */

(() => {
  const PAIR = '[data-video-pair]';
  const LIST = '[fs-list-element="list"]';
  const CARD = '.motion-template_card';
  const OVERLAY = '.card_link_overlay';

  const VIEW_ATTR = 'data-view';
  const ROOT_MARGIN = '200px 0px';
  const HOVER_INTENT = 60;

  const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hoverCapable = matchMedia('(hover: hover)').matches; // desktop only

  const maxPlaying = () =>
    matchMedia('(max-width: 767px)').matches ? 4 :
    matchMedia('(max-width: 991px)').matches ? 12 :
    matchMedia('(max-width: 1440px)').matches ? 16 : 24;

  // ─────────────────────────────────────────────────────────────
  // VIEW MODE + BUTTON UI (scalone z D)
  // ─────────────────────────────────────────────────────────────
  const mode = () => document.body.getAttribute(VIEW_ATTR) || 'inuse';

  const syncButtons = () => {
    const v = mode();
    document.querySelectorAll('.view-inuse, .view-blank')
      .forEach(el => el.classList.remove('is-active'));
    const btn = document.querySelector(v === 'blank' ? '.view-blank' : '.view-inuse');
    if (btn) btn.classList.add('is-active');
  };

  const setView = (v) => {
    document.body.setAttribute(VIEW_ATTR, v);
    syncButtons();
  };

  // Default view if missing
  if (!document.body.hasAttribute(VIEW_ATTR)) setView('inuse');
  else syncButtons();

  // Optional buttons
  document.addEventListener('click', (e) => {
    if (e.target.closest('.view-inuse')) setView('inuse');
    if (e.target.closest('.view-blank')) setView('blank');
  });

  // ─────────────────────────────────────────────────────────────
  // PLAYING CAP
  // ─────────────────────────────────────────────────────────────
  const playing = new Set();
  const cap = () => {
    while (playing.size > maxPlaying()) {
      const v = playing.values().next().value;
      if (!v) break;
      try { v.pause(); } catch(e) {}
      playing.delete(v);
    }
  };

  const ensureSrc = (v) => {
    if (!v || v.src) return;
    const src = v.getAttribute('data-src');
    if (src) v.src = src;
  };

  const loadMeta = (v) => {
    if (!v) return;
    v.preload = 'metadata';
    try { v.load(); } catch(e) {}
  };

  const canPlay = (v) =>
    (v && v.readyState >= 3) ? Promise.resolve() :
    new Promise(res => {
      if (!v) return res();
      const done = () => res();
      v.addEventListener('canplay', done, { once:true });
      v.addEventListener('loadeddata', done, { once:true });
    });

  const syncTime = (from, to) => {
    if (!from || !to) return;
    const t = from.currentTime || 0;
    const apply = () => { try { to.currentTime = t; } catch(e) {} };
    if (to.readyState >= 1) apply();
    else to.addEventListener('loadedmetadata', apply, { once:true });
  };

  const play = async (v) => {
    if (!v || prefersReducedMotion) return false;
    try {
      await v.play();
      playing.add(v);
      cap();
      return true;
    } catch(e) { return false; }
  };

  const pause = (v) => {
    if (!v) return;
    try { v.pause(); } catch(e) {}
    playing.delete(v);
  };

  // ─────────────────────────────────────────────────────────────
  // DEFAULT VIEW
  // ─────────────────────────────────────────────────────────────
  const defaultShowDark = () => mode() === 'blank';

  const applyDefaultView = (pair) => {
    if (!pair) return;
    pair.classList.toggle('show-dark', defaultShowDark());
    pair.classList.toggle('show-example', !defaultShowDark());
  };

  // ─────────────────────────────────────────────────────────────
  // INTERSECTION: play visible default, keep buddy if already used
  // ─────────────────────────────────────────────────────────────
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const pair = e.target;
      pair.__in = e.isIntersecting;

      const example = pair.querySelector('video[data-role="example"]');
      const dark = pair.querySelector('video[data-role="dark"]');
      pair.__ex = example;
      pair.__dk = dark;

      // Always apply default view when entering
      if (pair.__in) applyDefaultView(pair);

      const active = defaultShowDark() ? dark : example;
      const buddy  = defaultShowDark() ? example : dark;

      if (pair.__in) {
        ensureSrc(active); loadMeta(active);
        canPlay(active).then(() => play(active));

        // If buddy already had src (hovered before), keep it running too
        if (buddy && buddy.src) {
          loadMeta(buddy);
          canPlay(buddy).then(() => play(buddy));
        }
      } else {
        pause(example); pause(dark);
      }
    }
  }, { root:null, rootMargin: ROOT_MARGIN, threshold: 0.01 });

  const scan = () => {
    document.querySelectorAll(PAIR).forEach(p => io.observe(p));
  };

  // Rescan when FS list changes (filters/pagination/load)
  const list = document.querySelector(LIST);
  if (list) {
    new MutationObserver(() => requestAnimationFrame(scan))
      .observe(list, { childList:true, subtree:true });
  }

  // React to view mode changes: update default view + ensure active plays
  new MutationObserver(() => {
    document.querySelectorAll(PAIR).forEach(pair => {
      if (!pair.__in) return;
      applyDefaultView(pair);

      const active = defaultShowDark() ? pair.__dk : pair.__ex;
      ensureSrc(active); loadMeta(active);
      canPlay(active).then(() => play(active));
    });
  }).observe(document.body, { attributes:true, attributeFilter:[VIEW_ATTR] });

  // ─────────────────────────────────────────────────────────────
  // DESKTOP HOVER: swap visibility only AFTER buddy is ready+synced
  // ─────────────────────────────────────────────────────────────
  if (hoverCapable) {
    const timers = new WeakMap();

    const onEnter = (pair) => {
      if (!pair || !pair.__in) return;

      // inuse default -> hover shows dark
      // blank default -> hover shows example
      const showDarkOnHover = !defaultShowDark();
      const target = showDarkOnHover ? pair.__dk : pair.__ex;
      const source = showDarkOnHover ? pair.__ex : pair.__dk;

      ensureSrc(target);
      loadMeta(target);
      syncTime(source, target);

      canPlay(target).then(async () => {
        await play(target);
        pair.classList.toggle('show-dark', showDarkOnHover);
        pair.classList.toggle('show-example', !showDarkOnHover);
      });
    };

    const onLeave = (pair) => {
      if (!pair || !pair.__in) return;
      applyDefaultView(pair);
    };

    document.addEventListener('mouseover', (ev) => {
      const overlay = ev.target.closest(OVERLAY);
      if (!overlay) return;

      const pair = overlay.closest(CARD)?.querySelector(PAIR);
      if (!pair) return;

      const t = setTimeout(() => onEnter(pair), HOVER_INTENT);
      timers.set(overlay, t);
    }, true);

    document.addEventListener('mouseout', (ev) => {
      const overlay = ev.target.closest(OVERLAY);
      if (!overlay) return;

      const t = timers.get(overlay);
      if (t) clearTimeout(t);

      const pair = overlay.closest(CARD)?.querySelector(PAIR);
      if (!pair) return;

      onLeave(pair);
    }, true);

    // Desktop-only prewarm (metadata) for buddy on visible pairs
    const prewarm = () => {
      document.querySelectorAll(PAIR).forEach(pair => {
        if (!pair.__in) return;
        const buddy = defaultShowDark() ? pair.__ex : pair.__dk;
        if (buddy && !buddy.src) { ensureSrc(buddy); loadMeta(buddy); }
      });
    };
    if ('requestIdleCallback' in window) requestIdleCallback(prewarm, { timeout: 1200 });
    else setTimeout(prewarm, 800);
  }

  window.addEventListener('load', scan);
})();
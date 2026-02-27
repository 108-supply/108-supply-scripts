/*!
 * 108™ Supply — Video Pairs Engine (JS)
 *
 * Goal:
 * - Desktop (hover: hover): dual-video per card, hover swaps visibility, optional inuse/blank view.
 * - Touch devices (hover: none / pointer: coarse): SINGLE VIDEO mode to prevent iOS/iPadOS WebKit video layer glitches.
 *
 * Touch mode behavior:
 * - Keep ONLY the "example" video active.
 * - "dark" video is stripped so it never loads (remove data-src/src, pause, preload none, display none).
 *
 * Notes:
 * - No paint-reset hacks.
 * - No video.load() calls.
 * - Lazy loading via data-src is preserved for the kept video.
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
  const IS_TOUCH = matchMedia('(hover: none)').matches || matchMedia('(pointer: coarse)').matches;

  // Mark <html> for CSS
  document.documentElement.classList.toggle('is-touch', IS_TOUCH);

  const maxPlaying = () =>
    matchMedia('(max-width: 767px)').matches ? 4 :
    matchMedia('(max-width: 991px)').matches ? 12 :
    matchMedia('(max-width: 1440px)').matches ? 16 : 24;

  // View mode (desktop feature; on touch it doesn't swap videos)
  const setView = (v) => document.body.setAttribute(VIEW_ATTR, v);
  const mode = () => document.body.getAttribute(VIEW_ATTR) || 'inuse';
  if (!document.body.hasAttribute(VIEW_ATTR)) setView('inuse');

  document.addEventListener('click', (e) => {
    if (e.target.closest('.view-inuse')) setView('inuse');
    if (e.target.closest('.view-blank')) setView('blank');
  });

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

  const canPlay = (v) =>
    (v && v.readyState >= 3) ? Promise.resolve() :
    new Promise(res => {
      if (!v) return res();
      const done = () => res();
      v.addEventListener('canplay', done, { once:true });
      v.addEventListener('loadeddata', done, { once:true });
    });

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

  // ===== Touch mode: strip buddy video so it never loads =====
  function stripBuddyOnTouch(pair) {
    if (!IS_TOUCH || !pair) return;

    const keepRole = 'example';
    const killRole = 'dark';

    const keep = pair.querySelector(`video[data-role="${keepRole}"]`);
    const kill = pair.querySelector(`video[data-role="${killRole}"]`);

    // Kill "dark" completely (performance)
    if (kill) {
      try { kill.pause(); } catch(e) {}
      // Prevent any future lazy-load
      kill.removeAttribute('data-src');
      kill.removeAttribute('src');
      kill.preload = 'none';
      kill.style.display = 'none';
    }

    // Force stable classes (no swapping on touch)
    pair.classList.add('show-example');
    pair.classList.remove('show-dark');

    // Cache references
    pair.__ex = keep || null;
    pair.__dk = null;
  }

  // Default view on desktop (no hover): inuse => example; blank => dark
  const defaultShowDark = () => mode() === 'blank';

  const applyDefaultView = (pair) => {
    if (!pair) return;

    // Touch: always example (no swap)
    if (IS_TOUCH) {
      pair.classList.add('show-example');
      pair.classList.remove('show-dark');
      return;
    }

    pair.classList.toggle('show-dark', defaultShowDark());
    pair.classList.toggle('show-example', !defaultShowDark());
  };

  // ===== IntersectionObserver: play/pause ONLY the active video =====
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const pair = e.target;
      pair.__in = e.isIntersecting;

      const example = pair.__ex || pair.querySelector('video[data-role="example"]');
      const dark = pair.__dk || pair.querySelector('video[data-role="dark"]');

      pair.__ex = example;
      pair.__dk = IS_TOUCH ? null : dark;

      if (pair.__in) applyDefaultView(pair);

      // Active video = the one that is meant to be visible
      // Touch: always example
      const active = IS_TOUCH ? example : (defaultShowDark() ? dark : example);

      if (pair.__in) {
        ensureSrc(active);
        // fire-and-forget play; canPlay gate kept but only for the active one
        canPlay(active).then(() => {
          if (!pair.__in) return;
          play(active);
        });
      } else {
        // Pause only what we might have played
        pause(example);
        if (!IS_TOUCH) pause(dark);
      }
    }
  }, { root:null, rootMargin: ROOT_MARGIN, threshold: 0.01 });

  const scan = () => {
    document.querySelectorAll(PAIR).forEach(pair => {
      stripBuddyOnTouch(pair);
      io.observe(pair);
    });
  };

  // rescan when list changes (Finsweet pagination/filter)
  const list = document.querySelector(LIST);
  if (list) new MutationObserver(() => requestAnimationFrame(scan))
    .observe(list, { childList:true, subtree:true });

  // react to view mode changes: desktop only affects which video is active
  new MutationObserver(() => {
    if (IS_TOUCH) return;
    document.querySelectorAll(PAIR).forEach(pair => {
      if (!pair.__in) return;
      applyDefaultView(pair);
      const active = defaultShowDark() ? pair.__dk : pair.__ex;
      ensureSrc(active);
      canPlay(active).then(() => {
        if (!pair.__in) return;
        play(active);
      });
    });
  }).observe(document.body, { attributes:true, attributeFilter:[VIEW_ATTR] });

  // ===== Desktop hover swap =====
  if (hoverCapable) {
    const timers = new WeakMap();

    const syncTime = (from, to) => {
      if (!from || !to) return;
      const t = from.currentTime || 0;
      const apply = () => { try { to.currentTime = t; } catch(e) {} };
      if (to.readyState >= 1) apply();
      else to.addEventListener('loadedmetadata', apply, { once:true });
    };

    const onEnter = (pair) => {
      if (!pair || !pair.__in) return;

      const showDarkOnHover = !defaultShowDark(); // inuse -> hover shows dark, blank -> hover shows example
      const target = showDarkOnHover ? pair.__dk : pair.__ex;
      const source = showDarkOnHover ? pair.__ex : pair.__dk;

      if (!target || !source) return;

      ensureSrc(target);
      syncTime(source, target);

      canPlay(target).then(async () => {
        if (!pair.__in) return;
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
  }

  window.addEventListener('load', scan);
})();
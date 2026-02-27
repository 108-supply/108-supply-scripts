/*!
 * 108™ Supply — Video Pairs (JS)
 * - Desktop (hover: hover): dual-video (example + dark) with hover swap
 * - Touch (hover: none / pointer: coarse): remove dark video entirely (never loads), run single-video (example only)
 * - No video.load(), no paint hacks. Just set src once and play/pause via IntersectionObserver.
 */

(() => {
  // Guard against double init (Webflow + bfcache + partial reloads)
  if (window.__108_VIDEO_PAIRS_INIT__) return;
  window.__108_VIDEO_PAIRS_INIT__ = true;

  const PAIR_SEL = '[data-video-pair]';
  const LIST_SEL = '[fs-list-element="list"]';
  const CARD_SEL = '.motion-template_card';
  const OVERLAY_SEL = '.card_link_overlay';

  const HOVER_CAPABLE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const IS_TOUCH = !HOVER_CAPABLE || matchMedia('(hover: none)').matches || matchMedia('(pointer: coarse)').matches;

  // Mark html for CSS if you want
  try { document.documentElement.classList.toggle('is-touch', IS_TOUCH); } catch (_) {}

  // Tune: prefetch a bit ahead, but don't go crazy on iOS
  const ROOT_MARGIN = IS_TOUCH ? '120px 0px' : '200px 0px';
  const THRESHOLD = 0.01;

  // --- helpers
  const q = (root, sel) => root.querySelector(sel);

  function ensureSrc(video) {
    if (!video) return false;

    // If already has a real src/currentSrc -> done
    if (video.currentSrc || video.getAttribute('src')) return true;

    // Prefer data-src (your lazy strategy)
    const ds = video.getAttribute('data-src');
    if (ds) {
      video.setAttribute('src', ds);
      return true;
    }

    // Fallback: some people keep src in the markup already
    const s = video.src; // may be "" but just in case
    if (s) return true;

    return false;
  }

  function safePlay(video) {
    if (!video) return;
    // IMPORTANT: do not await, do not gate on canplay
    // poster/first frame will handle visuals
    const p = video.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  function safePause(video) {
    if (!video) return;
    try { video.pause(); } catch (_) {}
  }

  // --- touch mode: kill dark video so it never loads / never allocates decoder
  function stripDarkVideo(pair) {
    const dark = q(pair, 'video[data-role="dark"]');
    if (!dark) return;
    // Make 100% sure it will never request anything
    dark.removeAttribute('src');
    dark.removeAttribute('data-src');
    // Remove from DOM entirely (best for iOS)
    dark.parentNode && dark.parentNode.removeChild(dark);
  }

  // --- view swap on desktop (no touch)
  function showExample(pair) {
    pair.classList.add('show-example');
    pair.classList.remove('show-dark');
  }
  function showDark(pair) {
    pair.classList.add('show-dark');
    pair.classList.remove('show-example');
  }

  // --- IntersectionObserver: only manage example on touch, both on desktop
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const pair = entry.target;
      const ex = q(pair, 'video[data-role="example"]');
      const dk = q(pair, 'video[data-role="dark"]');

      if (entry.isIntersecting) {
        // Always: example should load + play
        if (ensureSrc(ex)) safePlay(ex);

        if (!IS_TOUCH) {
          // Desktop: keep both available (but don't force-load dark unless it already has src/data-src)
          if (dk && (dk.getAttribute('data-src') || dk.getAttribute('src') || dk.currentSrc)) {
            ensureSrc(dk);
            // don't autoplay dark unless currently shown OR already playing (keep it light)
            if (pair.classList.contains('show-dark')) safePlay(dk);
          }
        }
      } else {
        safePause(ex);
        if (!IS_TOUCH) safePause(dk);
      }
    }
  }, { root: null, rootMargin: ROOT_MARGIN, threshold: THRESHOLD });

  function initPair(pair) {
    if (!pair || pair.__108_inited) return;
    pair.__108_inited = true;

    // Set sane defaults
    const ex = q(pair, 'video[data-role="example"]');
    const dk = q(pair, 'video[data-role="dark"]');

    if (ex) {
      ex.muted = true;
      ex.loop = true;
      ex.playsInline = true;
      ex.setAttribute('playsinline', '');
      // Let browser decide; do not preload heavy on iOS
      ex.preload = 'none';
    }

    if (dk) {
      dk.muted = true;
      dk.loop = true;
      dk.playsInline = true;
      dk.setAttribute('playsinline', '');
      dk.preload = 'none';
    }

    if (IS_TOUCH) {
      // Touch: no hover/no switcher — remove dark video completely
      stripDarkVideo(pair);
      showExample(pair);
    } else {
      // Desktop default: show example
      showExample(pair);
    }

    io.observe(pair);
  }

  function scan() {
    document.querySelectorAll(PAIR_SEL).forEach(initPair);
  }

  // Rescan when FS list rerenders items
  const list = document.querySelector(LIST_SEL);
  if (list) {
    new MutationObserver(() => requestAnimationFrame(scan))
      .observe(list, { childList: true, subtree: true });
  }

  // Desktop hover: swap to dark on hover, but only if dark exists and has data-src
  if (!IS_TOUCH && HOVER_CAPABLE) {
    let hoverTimer = null;

    document.addEventListener('mouseover', (ev) => {
      const overlay = ev.target.closest(OVERLAY_SEL);
      if (!overlay) return;

      const card = overlay.closest(CARD_SEL);
      if (!card) return;

      const pair = card.querySelector(PAIR_SEL);
      if (!pair) return;

      hoverTimer = setTimeout(() => {
        const dk = q(pair, 'video[data-role="dark"]');
        const ex = q(pair, 'video[data-role="example"]');
        if (!dk) return;

        // Only now load dark (on demand!)
        if (ensureSrc(dk)) safePlay(dk);
        // Keep example playing too, no pause
        if (ex && (ex.getAttribute('src') || ex.currentSrc)) safePlay(ex);

        showDark(pair);
      }, 60);
    }, true);

    document.addEventListener('mouseout', (ev) => {
      const overlay = ev.target.closest(OVERLAY_SEL);
      if (!overlay) return;

      if (hoverTimer) clearTimeout(hoverTimer);
      hoverTimer = null;

      const card = overlay.closest(CARD_SEL);
      if (!card) return;

      const pair = card.querySelector(PAIR_SEL);
      if (!pair) return;

      showExample(pair);
    }, true);
  }

  // BFCache return: just rescan + let IO do its job
  window.addEventListener('pageshow', () => requestAnimationFrame(scan));
  window.addEventListener('load', scan);
})();
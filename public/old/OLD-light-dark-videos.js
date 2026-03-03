(() => {
  // 108™ Supply — Light/Dark Video Loader (rewrite)
  // Build: 2026-02-26  (stamp)
  // Goals:
  // - Desktop: hover works, switcher works
  // - iPad/mobile: load ONLY one variant per mode, no hover preloads, no "stuck at 9"
  // - Load more: new cards init via MutationObserver + lazy via IntersectionObserver

  if (window.__108_VIDEO_LOADER_V2__) return;
  window.__108_VIDEO_LOADER_V2__ = true;

  const BUILD = "2026-02-26-v2";
  console.log("[VID] loader", BUILD);

  // ---------- Config ----------
  const CLS_CARD = ".motion-template_card";
  const CLS_PAIR = ".video-pair--thumb, .video-pair";
  const SEL_DARK = "video.video-dark";
  const SEL_EXAMPLE = "video.video-example, video.video-hover";

  const FADE_MS = 180;
  const IO_MARGIN = "300px"; // load a bit before entering viewport

  const CAP_IPAD = 3;
  const CAP_MOBILE = 6;

  const LOAD_TIMEOUT_MS = 12000; // watchdog: never get stuck
  const NEAR_MARGIN_PX = 220;

  // ---------- Device ----------
  const mqDesktop = window.matchMedia?.("(hover: hover) and (pointer: fine)");
  function tier() {
    if (mqDesktop && mqDesktop.matches) return "desktop";
    return window.innerWidth < 768 ? "mobile" : "ipad";
  }
  function cap() {
    const t = tier();
    if (t === "mobile") return CAP_MOBILE;
    if (t === "ipad") return CAP_IPAD;
    return 999; // desktop doesn't use this queue heavily
  }

  // ---------- Mode ----------
  function normalizeMode(raw) {
    const m = String(raw || "").trim().toLowerCase();
    if (m === "main" || m === "blank" || m === "dark") return "main";   // Blank = dark
    return "hover"; // In Use = example
  }
  function getMode() {
    return normalizeMode(document.body.getAttribute("data-video-default"));
  }

  // ---------- Helpers ----------
  function isVisible(el) {
    if (!el) return false;
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden";
  }
  function isNearViewport(el) {
    const r = el.getBoundingClientRect();
    return r.bottom > -NEAR_MARGIN_PX && r.top < window.innerHeight + NEAR_MARGIN_PX;
  }

  function ensureSource(v) {
    if (!v) return null;
    return v.querySelector("source") || (() => {
      const s = document.createElement("source");
      s.type = "video/mp4";
      v.appendChild(s);
      return s;
    })();
  }
  function currentSrc(v) {
    const s = ensureSource(v);
    return (s && s.getAttribute("src")) || v.getAttribute("src") || "";
  }
  function stashLazy(v) {
    if (!v) return;
    const s = ensureSource(v);
    const src = currentSrc(v);
    if (src && !v.dataset.src) v.dataset.src = src;
    if (s) s.removeAttribute("src");
    v.removeAttribute("src");
    v.preload = "none";
  }
  function releaseVideo(v) {
    // Hard release to free decoder memory (especially Safari)
    if (!v) return;
    try { v.pause(); } catch (_) {}
    const s = ensureSource(v);
    if (s) s.removeAttribute("src");
    v.removeAttribute("src");
    v.preload = "none";
    delete v.dataset.loaded;
    delete v.dataset.loading;
    try { v.load(); } catch (_) {}
  }

  // ---------- Card parsing ----------
  function getVideos(card) {
    const pair = card?.querySelector(CLS_PAIR);
    if (!pair) return { pair: null, dark: null, ex: null };
    const dark = pair.querySelector(SEL_DARK);
    const ex = pair.querySelector(SEL_EXAMPLE);
    return { pair, dark, ex };
  }

  // ---------- Styling / visibility ----------
  function applyBaseStyles(card) {
    const { pair, dark, ex } = getVideos(card);
    if (!pair) return;

    pair.style.position = "relative";
    pair.style.overflow = "hidden";
    pair.style.width = "100%";
    pair.style.height = "100%";

    const fit = {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block",
      transform: "translateZ(0)",
      backfaceVisibility: "hidden"
    };

    if (dark) Object.assign(dark.style, fit);
    if (ex) {
      Object.assign(ex.style, fit, {
        transition: `opacity ${FADE_MS}ms ease`,
        zIndex: "2",
        pointerEvents: "none",
        willChange: "opacity"
      });
    }

    // IMPORTANT: On touch devices, don't show an empty dark layer by default.
    // We always display the active mode video; the other stays hidden to avoid "blank rows".
    // Desktop hover will override.
  }

  function setOpacity(card, show) {
    // show: "ex" or "dark"
    const { dark, ex } = getVideos(card);
    if (dark) dark.style.opacity = (show === "dark") ? "1" : "0";
    if (ex) ex.style.opacity = (show === "ex") ? "1" : "0";
  }

  function activeVariant() {
    // In Use => example, Blank => dark
    return getMode() === "main" ? "dark" : "ex";
  }

  // ---------- Robust loader queue (fixes "9 and stuck") ----------
  let inFlight = 0;
  const q = []; // { v, kind, priority, card }

  function enqueue(v, kind, priority = 0, card = null) {
    if (!v) return;
    if (v.dataset.loaded === "1" || v.dataset.loading === "1") return;
    if (!v.dataset.src) return;

    // avoid duplicates
    if (q.some(item => item.v === v)) return;

    q.push({ v, kind, priority, card });
    q.sort((a, b) => b.priority - a.priority);
    pump();
  }

  function pump() {
    const limit = cap();
    while (inFlight < limit && q.length) {
      const item = q.shift();
      startLoad(item.v, item.kind, item.card);
    }
  }

  function startLoad(v, kind, card) {
    const src = v.dataset.src;
    if (!src) return;

    v.dataset.loading = "1";
    inFlight++;

    const s = ensureSource(v);
    if (s) s.src = src;
    else v.setAttribute("src", src);

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      delete v.dataset.loading;
      inFlight = Math.max(0, inFlight - 1);
      pump();
      // After load, apply mode to avoid blackouts
      if (card && isVisible(card)) applyMode(card);
    };

    const onLoaded = () => {
      v.dataset.loaded = "1";
      finish();
    };
    const onError = () => {
      // Do not get stuck: free slot even on error
      finish();
    };

    v.addEventListener("loadeddata", onLoaded, { once: true });
    v.addEventListener("error", onError, { once: true });

    try { v.load(); } catch (_) {}

    // Watchdog: Safari sometimes never fires events under memory pressure
    setTimeout(() => finish(), LOAD_TIMEOUT_MS);
  }

  // ---------- Mode logic (NO blackout on touch) ----------
  function applyMode(card) {
    const { dark, ex } = getVideos(card);
    if (!dark && !ex) return;

    const t = tier();
    const want = activeVariant(); // "ex" or "dark"

    // Desktop: allow hover swap
    if (t === "desktop") {
      const hovering = card.matches(":hover") || card.classList.contains("hover-active");
      if (getMode() === "hover") {
        // In Use: show example; on hover show dark
        setOpacity(card, hovering ? "dark" : "ex");
      } else {
        // Blank: show dark; on hover show example (optional)
        setOpacity(card, hovering ? "ex" : "dark");
      }
      return;
    }

    // Touch: NEVER switch visibility to a variant until it's at least loading/loaded.
    // This kills the "blank after switch to Blank" bug.
    const wantVideo = (want === "dark") ? dark : ex;
    const fallbackVideo = (want === "dark") ? ex : dark;

    const wantUsable =
      !!wantVideo &&
      (wantVideo.dataset.loaded === "1" || wantVideo.dataset.loading === "1" || currentSrc(wantVideo));

    if (wantUsable) {
      setOpacity(card, want);
    } else {
      // keep fallback visible until target becomes usable (no blackout)
      if (fallbackVideo) {
        setOpacity(card, want === "dark" ? "ex" : "dark");
      }
    }
  }

  function scheduleActiveLoadsForCard(card) {
    if (!isVisible(card)) return;
    const { dark, ex } = getVideos(card);

    // Always lazy-stash first
    stashLazy(dark);
    stashLazy(ex);

    const want = activeVariant();
    const t = tier();

    // Desktop: pre-load only what is needed, hover loads the other on demand
    if (t === "desktop") {
      if (want === "ex" && ex) enqueue(ex, "ex", 2, card);
      if (want === "dark" && dark) enqueue(dark, "dark", 2, card);
      return;
    }

    // Touch: load ONLY the active variant (priority if near)
    const near = isNearViewport(card);
    const pr = near ? 10 : 1;

    if (want === "ex" && ex) enqueue(ex, "ex", pr, card);
    if (want === "dark" && dark) enqueue(dark, "dark", pr, card);

    // After the wanted one becomes loaded, we can release the other to save memory
    // BUT do it safely: never release while the wanted one isn't loaded yet.
    if (want === "ex" && dark && ex) {
      if (ex.dataset.loaded === "1") releaseVideo(dark);
    }
    if (want === "dark" && dark && ex) {
      if (dark.dataset.loaded === "1") releaseVideo(ex);
    }
  }

  // ---------- Observers ----------
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const card = e.target;
      scheduleActiveLoadsForCard(card);
      applyMode(card);
    }
  }, { rootMargin: IO_MARGIN, threshold: 0.01 });

  function initCard(card) {
    if (!card || card.dataset.__vidInit === "1") return;
    card.dataset.__vidInit = "1";

    applyBaseStyles(card);

    // stash initial src so we control loading
    const { dark, ex } = getVideos(card);
    stashLazy(dark);
    stashLazy(ex);

    // initial opacity: show current mode's layer (even before loaded)
    const want = activeVariant();
    if (tier() === "desktop") {
      // desktop: in use shows example, blank shows dark
      setOpacity(card, want);
    } else {
      // touch: show desired layer ONLY if it’s at least usable, otherwise show fallback
      setOpacity(card, want === "dark" ? "ex" : "dark"); // temporary; applyMode will correct after enqueue
      applyMode(card);
    }

    io.observe(card);
  }

  function initAll() {
    document.querySelectorAll(CLS_CARD).forEach(initCard);
  }

  // Mode switcher via body attribute changes
  const bodyAttrObs = new MutationObserver(() => {
    // When mode changes, refresh visible cards with high priority
    document.querySelectorAll(CLS_CARD).forEach(card => {
      if (!isVisible(card)) return;
      if (tier() !== "desktop" && !isNearViewport(card)) return;
      scheduleActiveLoadsForCard(card);
      applyMode(card);
    });
  });
  bodyAttrObs.observe(document.body, { attributes: true, attributeFilter: ["data-video-default"] });

  // MutationObserver for load more / CMS inserts
  const domObs = new MutationObserver((muts) => {
    // init only newly added cards
    for (const m of muts) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches?.(CLS_CARD)) initCard(node);
        node.querySelectorAll?.(CLS_CARD)?.forEach(initCard);
      }
    }
    // after DOM changes, give a small kick
    setTimeout(() => {
      document.querySelectorAll(CLS_CARD).forEach(card => {
        if (!isVisible(card)) return;
        if (tier() !== "desktop" && !isNearViewport(card)) return;
        scheduleActiveLoadsForCard(card);
        applyMode(card);
      });
    }, 120);
  });
  domObs.observe(document.documentElement, { childList: true, subtree: true });

  // Desktop hover: load the secondary variant only when needed
  function bindDesktopHover() {
    if (tier() !== "desktop") return;

    document.querySelectorAll(CLS_CARD).forEach(card => {
      if (card.dataset.__vidHover === "1") return;
      card.dataset.__vidHover = "1";

      card.addEventListener("mouseenter", () => {
        const { dark, ex } = getVideos(card);
        // In Use: hover loads dark; Blank: hover loads example (optional)
        const mode = getMode();
        if (mode === "hover" && dark) enqueue(dark, "dark", 50, card);
        if (mode === "main" && ex) enqueue(ex, "ex", 50, card);
        applyMode(card);
      });

      card.addEventListener("mouseleave", () => applyMode(card));
    });
  }

  function boot() {
    initAll();
    bindDesktopHover();
    // initial load for near viewport
    document.querySelectorAll(CLS_CARD).forEach(card => {
      if (!isVisible(card)) return;
      if (tier() !== "desktop" && !isNearViewport(card)) return;
      scheduleActiveLoadsForCard(card);
      applyMode(card);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // Expose a tiny debug hook
  window._108Video = {
    build: BUILD,
    tier,
    getMode,
    pump,
    inFlight: () => inFlight,
    queueLen: () => q.length
  };
})();
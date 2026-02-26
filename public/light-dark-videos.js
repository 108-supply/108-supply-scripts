(() => {
  if (window.__108_LIGHT_DARK_VIDEOS_INIT__) return;
  window.__108_LIGHT_DARK_VIDEOS_INIT__ = true;

  // Product cards only: dark (main) + hover.
  // Supports mode switcher via data-video-default-btn="main|hover".
  const queue = new Set();
  let scheduled = false;
  let mutationTick = 0;
  const pauseTimers = new WeakMap();
  const FADE_MS = 200;

  /* ── Fix #1: device detection + concurrency cap ── */
  const _fp = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)");
  function _isDesktop() { return !!(_fp && _fp.matches); }
  function _deviceMode() {
    if (_isDesktop()) return "desktopFine";
    return window.innerWidth < 768 ? "mobileSmall" : "iPadCoarse";
  }
  function _dbg(/* ...args */) {
    if (!window.__VID_DEBUG) return;
    console.log("[VID]", _deviceMode(), ...arguments);
  }

  let _activeLoads = 0;
  const _IPAD_MAX = 3;
  const _pendingQueue = [];

  function normalizeMode(raw) {
    const m = String(raw || "").trim().toLowerCase();
    if (m === "hover" || m === "wow" || m === "inuse" || m === "in-use" || m === "in use" || m === "live") return "hover";
    if (m === "main" || m === "dark" || m === "blank") return "main";
    return "hover";
  }

  function getMode() {
    return normalizeMode(document.body.getAttribute("data-video-default"));
  }

  function detectButtonMode(btn) {
    const byAttr = btn.getAttribute("data-video-default-btn");
    if (byAttr) return normalizeMode(byAttr);
    const txt = (btn.textContent || "").trim().toLowerCase();
    if (txt.includes("blank")) return "main";
    if (txt.includes("in use") || txt.includes("inuse") || txt.includes("wow") || txt.includes("live")) return "hover";
    return null;
  }

  function ensureSource(v) {
    return v.querySelector("source") || (() => {
      const s = document.createElement("source");
      s.type = "video/mp4";
      v.appendChild(s);
      return s;
    })();
  }

  function sourceAttr(v) {
    return ensureSource(v).getAttribute("src") || "";
  }

  function stashAsLazy(v) {
    if (!v) return;
    const s = ensureSource(v);
    const src = s.getAttribute("src") || v.getAttribute("src") || "";
    if (src && !v.dataset.src) v.dataset.src = src;
    s.removeAttribute("src");
    v.removeAttribute("src");
    v.preload = "none";
  }

  function unloadVideo(v) {
    if (!v) return;
    v.pause();
    const idx = _pendingQueue.findIndex(q => q.v === v);
    if (idx !== -1) _pendingQueue.splice(idx, 1);
    const wasLoading = v.dataset.loading === "1";
    const s = ensureSource(v);
    const had = s.getAttribute("src") || v.getAttribute("src");
    s.removeAttribute("src");
    v.removeAttribute("src");
    v.preload = "none";
    if (had) { try { v.load(); } catch (_) {} }
    delete v.dataset.loaded;
    v.removeAttribute("data-loaded");
    delete v.dataset.loading;
    if (wasLoading) {
      _activeLoads = Math.max(0, _activeLoads - 1);
      _dbg("unloaded (was loading)", v.className, "active:", _activeLoads);
    } else {
      _dbg("unloaded", v.className);
    }
    _drainQueue();
  }

  function isCardVisible(card) {
    const cs = window.getComputedStyle(card);
    return cs.display !== "none" && cs.visibility !== "hidden";
  }

  function isNearViewport(el) {
    const r = el.getBoundingClientRect();
    return r.bottom > -120 && r.top < window.innerHeight + 120;
  }

  function getCard(card) {
    if (!card || !card.classList.contains("motion-template_card")) return null;
    return card;
  }

  function getCardVideos(card) {
    const pair = card.querySelector(".video-pair--thumb") || card.querySelector(".video-pair");
    if (!pair) return { pair: null, dark: null, hover: null };
    const dark = pair.querySelector("video.video-dark");
    const hover = pair.querySelector("video.video-example") || pair.querySelector("video.video-hover");
    return { pair, dark, hover };
  }

  function playIfReady(v) {
    if (!v || v.readyState < 2) return;
    if (v.paused) {
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    }
  }

  function cancelScheduledPause(v) {
    const t = pauseTimers.get(v);
    if (t) {
      clearTimeout(t);
      pauseTimers.delete(v);
    }
  }

  function schedulePauseAfterFade(video, card) {
    if (!video) return;
    cancelScheduledPause(video);
    const t = setTimeout(() => {
      const targetNow = getTargetVideo(card);
      if (targetNow !== video && !video.paused) video.pause();
      pauseTimers.delete(video);
    }, FADE_MS);
    pauseTimers.set(video, t);
  }

  function syncTo(source, target) {
    if (!source || !target) return;
    if (source.readyState < 2 || target.readyState < 2) return;
    const drift = Math.abs((target.currentTime || 0) - (source.currentTime || 0));
    if (drift < 0.08) return;
    try { target.currentTime = source.currentTime; } catch (e) {}
  }

  function getTargetVideo(card) {
    const { dark, hover } = getCardVideos(card);
    const mode = getMode();
    const hovering = card.dataset.hovering === "1" || card.classList.contains("hover-active");

    if (mode === "hover") {
      if (hovering) return dark || hover;
      return (hover && hover.dataset.loaded === "1") ? hover : dark;
    }

    if (hovering) return (hover && hover.dataset.loaded === "1") ? hover : dark;
    return dark || hover;
  }

  function applyCardVideoMode(card) {
    const { dark, hover } = getCardVideos(card);
    if (!dark && !hover) return;

    const target = getTargetVideo(card);
    const source = target === dark ? hover : dark;
    syncTo(source, target);

    if (dark) {
      dark.style.opacity = target === dark ? "1" : "0";
      if (target === dark) {
        cancelScheduledPause(dark);
      } else {
        schedulePauseAfterFade(dark, card);
      }
    }

    if (hover) {
      hover.style.opacity = target === hover ? "1" : "0";
      if (target === hover) {
        cancelScheduledPause(hover);
      } else {
        schedulePauseAfterFade(hover, card);
      }
    }

    playIfReady(target);
  }

  function _drainQueue() {
    while (_pendingQueue.length && (_isDesktop() || _activeLoads < _IPAD_MAX)) {
      const { v, tag } = _pendingQueue.shift();
      if (v.dataset.loaded !== "1" && v.dataset.loading !== "1") loadOne(v, tag + "(q)");
    }
  }

  function loadOne(v, tag) {
    if (!v || v.dataset.loaded === "1" || v.dataset.loading === "1") return;
    const src = v.dataset.src;
    if (!src) return;

    if (!_isDesktop() && _activeLoads >= _IPAD_MAX) {
      if (!_pendingQueue.some(q => q.v === v)) {
        _pendingQueue.push({ v, tag: tag || "?" });
        _dbg("queued", v.className, tag, "active:", _activeLoads);
      }
      return;
    }

    v.dataset.loading = "1";
    _activeLoads++;
    _dbg("load", v.className, tag || "?", "active:", _activeLoads, src.split("/").pop());

    const s = ensureSource(v);
    s.src = src;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      delete v.dataset.loading;
      _activeLoads = Math.max(0, _activeLoads - 1);
      _drainQueue();
    };

    v.addEventListener("loadeddata", () => {
      v.dataset.loaded = "1";
      v.setAttribute("data-loaded", "1");
      _dbg("loaded", v.className, src.split("/").pop(), "active:", _activeLoads - 1);
      finish();

      const card = getCard(v.closest(".motion-template_card"));
      if (!card) return;
      if (!isCardVisible(card)) return;
      applyCardVideoMode(card);
    }, { once: true });

    v.addEventListener("error", () => {
      _dbg("error", v.className, src.split("/").pop());
      finish();
    }, { once: true });

    v.load();

    setTimeout(() => {
      if (!done) {
        _dbg("timeout", v.className, src.split("/").pop());
        finish();
      }
    }, 12000);
  }

  function refreshProductVideoLoading() {
    const dm = _deviceMode();
    const mode = getMode();
    _dbg("refresh", "mode:", mode);

    document.querySelectorAll(".motion-template_card").forEach(card => {
      const visible = isCardVisible(card);
      const { dark, hover } = getCardVideos(card);

      if (!dark) return;

      if (!visible) {
        if (sourceAttr(dark) && dark.dataset.loaded !== "1") stashAsLazy(dark);
        if (hover && sourceAttr(hover) && hover.dataset.loaded !== "1") stashAsLazy(hover);
        if (!dark.paused) dark.pause();
        if (hover && !hover.paused) hover.pause();
        return;
      }

      if (dm !== "desktopFine" && !isNearViewport(card)) return;

      if (dm === "desktopFine") {
        if (dark.dataset.src && !sourceAttr(dark)) loadOne(dark, "desk-dark");
        if (hover && hover.dataset.src && !sourceAttr(hover) && mode === "hover") loadOne(hover, "desk-hover");
      } else if (dm === "iPadCoarse") {
        if (mode === "hover") {
          if (hover && hover.dataset.src && !sourceAttr(hover)) loadOne(hover, "ipad-hover");
          if (dark && dark.dataset.loaded === "1") unloadVideo(dark);
        } else {
          if (dark.dataset.src && !sourceAttr(dark)) loadOne(dark, "ipad-dark");
          if (hover && hover.dataset.loaded === "1") unloadVideo(hover);
        }
      } else {
        if (mode === "hover") {
          if (hover && hover.dataset.src && !sourceAttr(hover)) loadOne(hover, "mob-hover");
        } else {
          if (dark.dataset.src && !sourceAttr(dark)) loadOne(dark, "mob-dark");
        }
      }

      if (isNearViewport(card)) applyCardVideoMode(card);
    });

    if (typeof window._108Grid?.kickVisiblePlayback === "function") {
      window._108Grid.kickVisiblePlayback();
      setTimeout(() => window._108Grid.kickVisiblePlayback(), 120);
    }
  }

  function flushQueue() {
    scheduled = false;
    let n = 0;
    for (const v of queue) {
      queue.delete(v);
      loadOne(v);
      n++;
      if (n >= 6) break;
    }
    if (queue.size) scheduleFlush();
  }

  function scheduleFlush() {
    if (scheduled) return;
    scheduled = true;
    if ("requestIdleCallback" in window) {
      requestIdleCallback(flushQueue, { timeout: 250 });
    } else {
      setTimeout(flushQueue, 60);
    }
  }

  function showHover(card) {
    const { hover } = getCardVideos(card);
    card.dataset.hovering = "1";
    if (hover && hover.dataset.loaded !== "1") loadOne(hover);
    applyCardVideoMode(card);
  }

  function hideHover(card) {
    card.dataset.hovering = "0";
    applyCardVideoMode(card);
  }

  /* ── Fix #2: per-card IO for lazy load (product page + iPad scroll) ── */
  const _cardIO = new IntersectionObserver(entries => {
    const dm = _deviceMode();
    const mode = getMode();
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const card = entry.target;
      if (!isCardVisible(card)) return;
      const { dark, hover } = getCardVideos(card);
      if (dm === "desktopFine") {
        if (dark && dark.dataset.src && !sourceAttr(dark) && dark.dataset.loaded !== "1" && !dark.dataset.loading) loadOne(dark, "io-desk-dark");
        if (hover && hover.dataset.src && !sourceAttr(hover) && hover.dataset.loaded !== "1" && !hover.dataset.loading && mode === "hover") loadOne(hover, "io-desk-hover");
      } else if (dm === "iPadCoarse") {
        if (mode === "hover") {
          if (hover && hover.dataset.src && !sourceAttr(hover) && hover.dataset.loaded !== "1" && !hover.dataset.loading) loadOne(hover, "io-ipad-hover");
        } else {
          if (dark && dark.dataset.src && !sourceAttr(dark) && dark.dataset.loaded !== "1" && !dark.dataset.loading) loadOne(dark, "io-ipad-dark");
        }
      } else {
        if (mode === "hover") {
          if (hover && hover.dataset.src && !sourceAttr(hover) && hover.dataset.loaded !== "1" && !hover.dataset.loading) loadOne(hover, "io-mob-hover");
        } else {
          if (dark && dark.dataset.src && !sourceAttr(dark) && dark.dataset.loaded !== "1" && !dark.dataset.loading) loadOne(dark, "io-mob-dark");
        }
      }
      applyCardVideoMode(card);
    });
  }, { rootMargin: "200px", threshold: 0.01 });

  function initCards() {
    const dm = _deviceMode();
    _dbg("initCards", dm);
    document.querySelectorAll(".motion-template_card").forEach((card, i) => {
      if (card.dataset.hoverInit === "1") return;
      card.dataset.hoverInit = "1";
      _dbg("initCard", i, card.querySelector(".motion-template_name")?.textContent?.trim() || "?");

      const { pair, dark, hover } = getCardVideos(card);
      if (!pair) return;

      pair.style.position = "relative";
      pair.style.overflow = "hidden";
      pair.style.width = "100%";
      pair.style.height = "100%";

      if (dark) {
        Object.assign(dark.style, {
          position: "absolute", inset: "0",
          width: "100%", height: "100%",
          objectFit: "cover", display: "block"
        });
      }

      if (hover) {
        Object.assign(hover.style, {
          position: "absolute", inset: "0",
          width: "100%", height: "100%",
          objectFit: "cover", display: "block",
          opacity: "0",
          transition: "opacity 0.2s ease",
          zIndex: "2",
          pointerEvents: "none",
          transform: "translateZ(0)",
          backfaceVisibility: "hidden",
          willChange: "opacity"
        });
      }

      _cardIO.observe(card);

      if (dm === "desktopFine") {
        card.addEventListener("mouseenter", () => showHover(card));
        card.addEventListener("mouseleave", () => hideHover(card));
      }
    });
  }

  function initMobileToggle() {
    document.querySelectorAll(".show-examples-btn").forEach(btn => {
      if (btn.dataset.mobileHoverInit === "1") return;
      btn.dataset.mobileHoverInit = "1";

      btn.addEventListener("click", () => {
        const card = getCard(btn.closest(".motion-template_card"));
        if (!card) return;
        const active = card.classList.contains("hover-active");
        if (!active) {
          card.classList.add("hover-active");
          btn.textContent = "Hide examples";
          showHover(card);
        } else {
          card.classList.remove("hover-active");
          btn.textContent = "Show examples";
          hideHover(card);
        }
      });
    });
  }

  function updateModeButtonsUI() {
    const mode = getMode();
    document.querySelectorAll("[data-video-default-btn], .live-button").forEach(btn => {
      const v = detectButtonMode(btn);
      if (!v) return;
      btn.classList.toggle("is-active", v === mode);
    });
  }

  function setVideoDefaultMode(mode) {
    document.body.setAttribute("data-video-default", normalizeMode(mode));
    updateModeButtonsUI();
    document.querySelectorAll(".motion-template_card").forEach(applyCardVideoMode);
    refreshProductVideoLoading();
  }

  function initVideoModeSwitcher() {
    const buttons = document.querySelectorAll("[data-video-default-btn], .live-button");
    if (!document.body.getAttribute("data-video-default")) {
      const activeBtn = Array.from(buttons).find(b => b.classList.contains("is-active"));
      const inferred = activeBtn ? detectButtonMode(activeBtn) : null;
      if (inferred) document.body.setAttribute("data-video-default", inferred);
    }

    buttons.forEach(btn => {
      if (btn.dataset.videoDefaultInit === "1") return;
      btn.dataset.videoDefaultInit = "1";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const mode = detectButtonMode(btn);
        if (!mode) return;
        setVideoDefaultMode(mode);
      });
    });
    updateModeButtonsUI();
  }

  function init() {
    initCards();
    initMobileToggle();
    initVideoModeSwitcher();

    let tries = 0;
    const boot = () => {
      tries++;
      const cards = document.querySelectorAll(".motion-template_card");
      const hasHidden = Array.from(cards).some(c => window.getComputedStyle(c).display === "none");
      const gridReady = !!window._108Grid?.engine;
      if (hasHidden || gridReady || tries >= 20) {
        refreshProductVideoLoading();
        return;
      }
      requestAnimationFrame(boot);
    };
    requestAnimationFrame(boot);
  }

  window._108Grid = window._108Grid || {};
  window._108Grid.refreshLightVideoObserver = () => {};
  window._108Grid.refreshProductVideoLoading = refreshProductVideoLoading;
  window._108Grid.setVideoDefaultMode = setVideoDefaultMode;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  new MutationObserver(() => refreshProductVideoLoading())
    .observe(document.body, { attributes: true, attributeFilter: ["class", "data-video-default"] });

  new MutationObserver(() => {
    if (mutationTick) return;
    mutationTick = requestAnimationFrame(() => {
      mutationTick = 0;
      refreshProductVideoLoading();
      initCards();
      initMobileToggle();
      initVideoModeSwitcher();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();

(() => {
  if (window.__108_LIGHT_DARK_VIDEOS_INIT__) return;
  window.__108_LIGHT_DARK_VIDEOS_INIT__ = true;

  const queue = new Set();
  let scheduled = false;
  let mutationTick = 0;
  const pauseTimers = new WeakMap();
  const FADE_MS = 200;

  let _activeLoads = 0;
  const _MAX_CONCURRENT = 3;
  const _loadQueue = [];

  const _finePointer = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)");
  const _mobileWidth = 768;
  function isDesktop() { return !!(_finePointer && _finePointer.matches); }
  function isMobile() { return !isDesktop() && window.innerWidth < _mobileWidth; }
  function deviceTier() { return isDesktop() ? "desktop" : isMobile() ? "mobile" : "tablet"; }

  function dbg(...args) {
    if (window.__VID_DEBUG) console.log("[VID]", ...args);
  }

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
    const qi = _loadQueue.findIndex(item => item.v === v);
    if (qi !== -1) _loadQueue.splice(qi, 1);
    const s = ensureSource(v);
    const hadSrc = s.getAttribute("src") || v.getAttribute("src");
    s.removeAttribute("src");
    v.removeAttribute("src");
    v.preload = "none";
    if (hadSrc) { try { v.load(); } catch (e) {} }
    delete v.dataset.loaded;
    v.removeAttribute("data-loaded");
    delete v.dataset.loading;
    dbg("unloaded", v.className);
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
    if (!pair) return { pair: null, dark: null, example: null };
    const dark = pair.querySelector("video.video-dark");
    const example = pair.querySelector("video.video-example") || pair.querySelector("video.video-hover");
    return { pair, dark, example };
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
    const { dark, example } = getCardVideos(card);
    const mode = getMode();
    const hovering = card.dataset.hovering === "1" || card.classList.contains("hover-active");

    if (mode === "hover") {
      if (hovering && dark && dark.dataset.loaded === "1") return dark;
      if (example && example.dataset.loaded === "1") return example;
      return null;
    }

    if (hovering && example && example.dataset.loaded === "1") return example;
    if (dark && dark.dataset.loaded === "1") return dark;
    return null;
  }

  function applyCardVideoMode(card) {
    const { dark, example } = getCardVideos(card);
    if (!dark && !example) return;

    const target = getTargetVideo(card);
    if (!target) return;

    const source = target === dark ? example : dark;
    syncTo(source, target);

    if (dark) {
      dark.style.opacity = target === dark ? "1" : "0";
      if (target === dark) cancelScheduledPause(dark);
      else schedulePauseAfterFade(dark, card);
    }

    if (example) {
      example.style.opacity = target === example ? "1" : "0";
      if (target === example) cancelScheduledPause(example);
      else schedulePauseAfterFade(example, card);
    }

    playIfReady(target);
  }

  function loadOne(v, reason) {
    if (!v || v.dataset.loaded === "1" || v.dataset.loading === "1") return;
    const src = v.dataset.src;
    if (!src) return;

    if (!isDesktop() && _activeLoads >= _MAX_CONCURRENT) {
      if (!_loadQueue.some(item => item.v === v)) {
        _loadQueue.push({ v, reason });
        dbg("queued", v.className, reason, "active:", _activeLoads, "qLen:", _loadQueue.length);
      }
      return;
    }

    v.dataset.loading = "1";
    _activeLoads++;
    dbg("loadOne", v.className, "reason:", reason || "unknown", "active:", _activeLoads, "src:", src.split("/").pop());

    const s = ensureSource(v);
    s.src = src;

    let cleaned = false;
    const done = () => {
      if (cleaned) return;
      cleaned = true;
      delete v.dataset.loading;
      _activeLoads = Math.max(0, _activeLoads - 1);
      processLoadQueue();
    };

    v.addEventListener("loadeddata", () => {
      v.dataset.loaded = "1";
      v.setAttribute("data-loaded", "1");
      dbg("loaded", v.className, src.split("/").pop(), "active:", _activeLoads - 1);
      done();

      const card = getCard(v.closest(".motion-template_card"));
      if (!card) return;
      if (!isCardVisible(card)) return;
      applyCardVideoMode(card);
    }, { once: true });

    v.addEventListener("error", () => {
      dbg("loadError", v.className, src.split("/").pop());
      done();
    }, { once: true });

    v.load();
  }

  function processLoadQueue() {
    while (_loadQueue.length > 0 && (isDesktop() || _activeLoads < _MAX_CONCURRENT)) {
      const { v, reason } = _loadQueue.shift();
      if (v.dataset.loaded !== "1" && v.dataset.loading !== "1") {
        loadOne(v, reason + " (q)");
      }
    }
  }

  function refreshProductVideoLoading() {
    const tier = deviceTier();
    const mode = getMode();
    dbg("refreshProductVideoLoading tier:", tier, "mode:", mode);

    document.querySelectorAll(".motion-template_card").forEach((card, i) => {
      const visible = isCardVisible(card);
      const near = visible && isNearViewport(card);
      const { dark, example } = getCardVideos(card);

      if (!dark && !example) return;

      if (!visible || !near) {
        if (dark && sourceAttr(dark) && dark.dataset.loaded !== "1") stashAsLazy(dark);
        if (example && sourceAttr(example) && example.dataset.loaded !== "1") stashAsLazy(example);
        if (dark && !dark.paused) dark.pause();
        if (example && !example.paused) example.pause();
        return;
      }

      if (tier === "desktop") {
        if (mode === "hover") {
          if (example && example.dataset.src && !sourceAttr(example)) loadOne(example, "desktop-primary-hover");
        } else {
          if (dark && dark.dataset.src && !sourceAttr(dark)) loadOne(dark, "desktop-primary-blank");
        }
      } else if (tier === "tablet") {
        if (mode === "hover") {
          if (example && example.dataset.src && !sourceAttr(example)) loadOne(example, "tablet-primary-hover");
          if (dark && dark.dataset.loaded === "1") unloadVideo(dark);
        } else {
          if (dark && dark.dataset.src && !sourceAttr(dark)) loadOne(dark, "tablet-switcher-blank");
          if (example && example.dataset.loaded === "1") unloadVideo(example);
        }
      } else {
        if (example && example.dataset.src && !sourceAttr(example)) loadOne(example, "mobile-primary");
        if (dark && dark.dataset.loaded === "1") unloadVideo(dark);
      }

      applyCardVideoMode(card);
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
    const { dark, example } = getCardVideos(card);
    const mode = getMode();
    card.dataset.hovering = "1";
    if (mode === "hover") {
      if (dark && dark.dataset.loaded !== "1") loadOne(dark, "hover-secondary-blank");
    } else {
      if (example && example.dataset.loaded !== "1") loadOne(example, "hover-secondary-hover");
    }
    applyCardVideoMode(card);
  }

  function hideHover(card) {
    card.dataset.hovering = "0";
    applyCardVideoMode(card);
  }

  const _cardIO = new IntersectionObserver((entries) => {
    const tier = deviceTier();
    const mode = getMode();
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const card = entry.target;
      if (!isCardVisible(card)) return;
      const { dark, example } = getCardVideos(card);
      if (tier === "mobile") {
        if (example && example.dataset.src && !sourceAttr(example) && example.dataset.loaded !== "1" && example.dataset.loading !== "1") loadOne(example, "mobile-io");
      } else if (mode === "hover") {
        if (example && example.dataset.src && !sourceAttr(example) && example.dataset.loaded !== "1" && example.dataset.loading !== "1") loadOne(example, tier + "-io-hover");
      } else {
        if (dark && dark.dataset.src && !sourceAttr(dark) && dark.dataset.loaded !== "1" && dark.dataset.loading !== "1") loadOne(dark, tier + "-io-blank");
      }
      applyCardVideoMode(card);
    });
  }, { rootMargin: "200px", threshold: 0.01 });

  function initCards() {
    const tier = deviceTier();
    dbg("initCards tier:", tier);
    document.querySelectorAll(".motion-template_card").forEach((card, i) => {
      if (card.dataset.hoverInit === "1") return;
      card.dataset.hoverInit = "1";
      dbg("initCard", i, card.querySelector(".motion-template_name")?.textContent?.trim() || "?");

      const { pair, dark, example } = getCardVideos(card);
      if (!pair) return;

      pair.style.position = "relative";
      pair.style.overflow = "hidden";
      pair.style.width = "100%";
      pair.style.height = "100%";

      if (dark) {
        Object.assign(dark.style, {
          position: "absolute",
          inset: "0",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block"
        });
      }

      if (example) {
        Object.assign(example.style, {
          position: "absolute",
          inset: "0",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
          opacity: "0",
          transition: "opacity 0.2s ease",
          zIndex: "2",
          pointerEvents: "none",
          transform: "translateZ(0)",
          backfaceVisibility: "hidden",
          willChange: "opacity"
        });
      }

      stashAsLazy(dark);
      stashAsLazy(example);

      _cardIO.observe(card);

      if (tier === "desktop") {
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
    const m = normalizeMode(mode);
    dbg("setVideoDefaultMode:", m, "tier:", deviceTier());
    document.body.setAttribute("data-video-default", m);
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

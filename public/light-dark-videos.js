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
  const DEBUG = window.__108VideoDebug === true;
  const touchMq = window.matchMedia ? window.matchMedia("(hover: none), (pointer: coarse)") : null;

  function logDebug(...args) {
    if (!DEBUG) return;
    console.log("[108VideoDebug]", ...args);
  }

  function isTouchDevice() {
    return !!((touchMq && touchMq.matches) || navigator.maxTouchPoints > 0 || ("ontouchstart" in window));
  }

  function cardDebugId(card) {
    if (!card) return "unknown-card";
    const link = card.querySelector("a.card_link_overlay");
    return link?.getAttribute("href") || card.getAttribute("data-w-id") || "unknown-card";
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

  function clearLoadedState(v) {
    delete v.dataset.loaded;
    v.removeAttribute("data-loaded");
  }

  function unloadVideo(v) {
    if (!v) return;
    stashAsLazy(v);
    clearLoadedState(v);
    if (!v.paused) v.pause();
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
    const hover = pair.querySelector("video.video-hover");
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
    if (isTouchDevice()) {
      return mode === "main" ? (dark || hover) : (hover || dark);
    }
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

    const touch = isTouchDevice();
    const target = getTargetVideo(card);
    const source = target === dark ? hover : dark;
    if (touch) {
      // Touch Safari hardening: no crossfade/layering; render one stable stream only.
      if (dark) {
        dark.style.transition = "none";
        dark.style.opacity = target === dark ? "1" : "0";
        dark.style.display = target === dark ? "block" : "none";
        cancelScheduledPause(dark);
        if (target !== dark && !dark.paused) dark.pause();
      }
      if (hover) {
        hover.style.transition = "none";
        hover.style.opacity = target === hover ? "1" : "0";
        hover.style.display = target === hover ? "block" : "none";
        cancelScheduledPause(hover);
        if (target !== hover && !hover.paused) hover.pause();
      }
    } else {
      syncTo(source, target);

      if (dark) {
        dark.style.display = "block";
        dark.style.opacity = target === dark ? "1" : "0";
        if (target === dark) {
          cancelScheduledPause(dark);
        } else {
          schedulePauseAfterFade(dark, card);
        }
      }

      if (hover) {
        hover.style.display = "block";
        hover.style.opacity = target === hover ? "1" : "0";
        if (target === hover) {
          cancelScheduledPause(hover);
        } else {
          schedulePauseAfterFade(hover, card);
        }
      }
    }

    playIfReady(target);
  }

  function loadOne(v) {
    if (!v || v.dataset.loaded === "1") return;
    const src = v.dataset.src;
    if (!src) return;
    const kind = v.classList.contains("video-dark") ? "dark" : (v.classList.contains("video-hover") ? "hover" : "video");
    const card = getCard(v.closest(".motion-template_card"));
    logDebug("attach-src", { card: cardDebugId(card), kind, src });

    const s = ensureSource(v);
    s.src = src;

    v.addEventListener("loadeddata", () => {
      v.dataset.loaded = "1";
      v.setAttribute("data-loaded", "1");

      const card = getCard(v.closest(".motion-template_card"));
      if (!card) return;
      logDebug("loadeddata", { card: cardDebugId(card), kind, mode: getMode(), touch: isTouchDevice() });
      if (!isCardVisible(card)) return;
      applyCardVideoMode(card);
    }, { once: true });

    v.load();
  }

  function refreshProductVideoLoading() {
    const mode = getMode();
    const touch = isTouchDevice();
    document.querySelectorAll(".motion-template_card").forEach(card => {
      const visible = isCardVisible(card);
      const { dark, hover } = getCardVideos(card);
      const target = getTargetVideo(card);
      const other = target === dark ? hover : dark;

      if (!dark) return;

      if (!visible) {
        if (sourceAttr(dark) && dark.dataset.loaded !== "1") stashAsLazy(dark);
        if (hover && sourceAttr(hover) && hover.dataset.loaded !== "1") stashAsLazy(hover);
        if (!dark.paused) dark.pause();
        if (hover && !hover.paused) hover.pause();
        return;
      }

      if (touch) {
        if (target && target.dataset.src && !sourceAttr(target)) loadOne(target);
        if (other && (sourceAttr(other) || other.dataset.loaded === "1")) {
          unloadVideo(other);
          logDebug("unload-non-target-touch", { card: cardDebugId(card), mode });
        }
        if (mode === "hover" && dark && (sourceAttr(dark) || dark.dataset.loaded === "1")) {
          unloadVideo(dark);
          logDebug("unload-dark-touch-default", { card: cardDebugId(card), mode });
        }
      } else {
        // Desktop: load only currently needed variant; second one loads on demand (hover/switch).
        if (target && target.dataset.src && !sourceAttr(target)) loadOne(target);
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
    const targetBefore = getTargetVideo(card);
    card.dataset.hovering = "1";
    const targetAfter = getTargetVideo(card);
    const target = targetAfter || targetBefore;
    if (target && target.dataset.loaded !== "1") loadOne(target);
    applyCardVideoMode(card);
  }

  function hideHover(card) {
    card.dataset.hovering = "0";
    applyCardVideoMode(card);
  }

  function initCards() {
    const touch = isTouchDevice();
    document.querySelectorAll(".motion-template_card").forEach(card => {
      if (card.dataset.hoverInit === "1") return;
      card.dataset.hoverInit = "1";
      logDebug("card-init", { card: cardDebugId(card), touch });

      const { pair, hover } = getCardVideos(card);
      if (!pair || !hover) return;

      if (!touch) {
        Object.assign(hover.style, {
          position: "absolute",
          inset: "0",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: "0",
          transition: "opacity 0.2s ease",
          zIndex: "2",
          pointerEvents: "none",
          transform: "translateZ(0)",
          backfaceVisibility: "hidden",
          willChange: "opacity"
        });
      } else {
        Object.assign(hover.style, {
          position: "static",
          inset: "",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: "1",
          transition: "none",
          zIndex: "",
          pointerEvents: "none",
          transform: "none",
          backfaceVisibility: "",
          willChange: "auto"
        });
      }

      pair.style.position = "relative";
      pair.style.overflow = "hidden";

      if (!touch) {
        card.addEventListener("mouseenter", () => showHover(card));
        card.addEventListener("mouseleave", () => hideHover(card));
      } else {
        card.dataset.hovering = "0";
      }
    });
  }

  function initMobileToggle() {
    if (isTouchDevice()) return;
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
    const next = normalizeMode(mode);
    document.body.setAttribute("data-video-default", next);
    logDebug("mode-change", { mode: next, touch: isTouchDevice() });
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

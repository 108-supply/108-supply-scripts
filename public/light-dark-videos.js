(() => {
  // Product cards only: dark (main) + hover.
  // Supports mode switcher via data-video-default-btn="main|hover".
  const queue = new Set();
  let scheduled = false;
  let mutationTick = 0;
  const pauseTimers = new WeakMap();
  const FADE_MS = 200;

  function normalizeMode(raw) {
    const m = String(raw || "").trim().toLowerCase();
    if (m === "hover" || m === "wow" || m === "inuse" || m === "in-use" || m === "in use" || m === "live") return "hover";
    if (m === "main" || m === "dark" || m === "blank") return "main";
    return "hover";
  }

  function getMode() {
    return normalizeMode(document.body.getAttribute("data-video-default"));
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
      if (targetNow !== video) video.style.visibility = "hidden";
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
      dark.style.visibility = "visible";
      dark.style.opacity = target === dark ? "1" : "0";
      if (target === dark) {
        cancelScheduledPause(dark);
      } else {
        schedulePauseAfterFade(dark, card);
      }
    }

    if (hover) {
      hover.style.visibility = "visible";
      hover.style.opacity = target === hover ? "1" : "0";
      if (target === hover) {
        cancelScheduledPause(hover);
      } else {
        schedulePauseAfterFade(hover, card);
      }
    }

    playIfReady(target);
  }

  function loadOne(v) {
    if (!v || v.dataset.loaded === "1") return;
    const src = v.dataset.src;
    if (!src) return;

    const s = ensureSource(v);
    s.src = src;

    v.addEventListener("loadeddata", () => {
      v.dataset.loaded = "1";
      v.setAttribute("data-loaded", "1");

      const card = getCard(v.closest(".motion-template_card"));
      if (!card) return;
      if (!isCardVisible(card)) return;
      if (!isNearViewport(card)) return;
      applyCardVideoMode(card);
    }, { once: true });

    v.load();
  }

  function refreshProductVideoLoading() {
    document.querySelectorAll(".motion-template_card").forEach(card => {
      const visible = isCardVisible(card);
      const { dark, hover } = getCardVideos(card);
      const mode = getMode();

      if (!dark) return;

      if (!visible) {
        if (sourceAttr(dark) && dark.dataset.loaded !== "1") stashAsLazy(dark);
        if (hover && sourceAttr(hover) && hover.dataset.loaded !== "1") stashAsLazy(hover);
        if (!dark.paused) dark.pause();
        if (hover && !hover.paused) hover.pause();
        return;
      }

      // Keep dark available for quick swap in both modes.
      if (dark.dataset.src && !sourceAttr(dark)) loadOne(dark);

      // Hover loads on demand, but in hover-default preload visible cards.
      if (hover && hover.dataset.src && !sourceAttr(hover) && mode === "hover") loadOne(hover);

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

  function initCards() {
    document.querySelectorAll(".motion-template_card").forEach(card => {
      if (card.dataset.hoverInit === "1") return;
      card.dataset.hoverInit = "1";

      const { pair, hover } = getCardVideos(card);
      if (!pair || !hover) return;

      Object.assign(hover.style, {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        objectFit: "cover",
        opacity: "0",
        visibility: "hidden",
        transition: "opacity 0.2s ease",
        zIndex: "2",
        pointerEvents: "none",
        transform: "translateZ(0)",
        backfaceVisibility: "hidden",
        willChange: "opacity"
      });

      pair.style.position = "relative";
      pair.style.overflow = "hidden";

      card.addEventListener("mouseenter", () => showHover(card));
      card.addEventListener("mouseleave", () => hideHover(card));
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
    document.querySelectorAll("[data-video-default-btn]").forEach(btn => {
      const v = normalizeMode(btn.getAttribute("data-video-default-btn"));
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
    document.querySelectorAll("[data-video-default-btn]").forEach(btn => {
      if (btn.dataset.videoDefaultInit === "1") return;
      btn.dataset.videoDefaultInit = "1";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        setVideoDefaultMode(btn.getAttribute("data-video-default-btn"));
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

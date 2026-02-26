(() => {
  if (window.__108_LIGHT_DARK_VIDEOS_INIT__) return;
  window.__108_LIGHT_DARK_VIDEOS_INIT__ = true;

  const queue = new Set();
  let scheduled = false;
  let mutationTick = 0;
  const pauseTimers = new WeakMap();
  const FADE_MS = 200;

  const _finePointer = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)");
  function isDesktop() { return !!(_finePointer && _finePointer.matches); }

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
      if (hovering) return dark || example;
      return (example && example.dataset.loaded === "1") ? example : dark;
    }

    if (hovering) return (example && example.dataset.loaded === "1") ? example : dark;
    return dark || example;
  }

  function applyCardVideoMode(card) {
    const { dark, example } = getCardVideos(card);
    if (!dark && !example) return;

    const target = getTargetVideo(card);
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
      applyCardVideoMode(card);
    }, { once: true });

    v.load();
  }

  function refreshProductVideoLoading() {
    const desktop = isDesktop();
    document.querySelectorAll(".motion-template_card").forEach(card => {
      const visible = isCardVisible(card);
      const { dark, example } = getCardVideos(card);
      const mode = getMode();

      if (!dark) return;

      if (!visible) {
        if (sourceAttr(dark) && dark.dataset.loaded !== "1") stashAsLazy(dark);
        if (example && sourceAttr(example) && example.dataset.loaded !== "1") stashAsLazy(example);
        if (!dark.paused) dark.pause();
        if (example && !example.paused) example.pause();
        return;
      }

      if (desktop) {
        if (dark.dataset.src && !sourceAttr(dark)) loadOne(dark);
        if (example && example.dataset.src && !sourceAttr(example) && mode === "hover") loadOne(example);
      } else {
        // Touch: load only the variant needed for the current mode.
        if (mode === "main") {
          if (dark.dataset.src && !sourceAttr(dark)) loadOne(dark);
        } else {
          if (example && example.dataset.src && !sourceAttr(example)) loadOne(example);
          if (!dark.dataset.loaded && dark.dataset.src && !sourceAttr(dark)) {
            // Skip loading dark on touch in hover/example mode.
          } else if (dark.dataset.loaded === "1") {
            // Already loaded — keep it, just don't start new loads.
          }
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
    const { example } = getCardVideos(card);
    card.dataset.hovering = "1";
    if (example && example.dataset.loaded !== "1") loadOne(example);
    applyCardVideoMode(card);
  }

  function hideHover(card) {
    card.dataset.hovering = "0";
    applyCardVideoMode(card);
  }

  function initCards() {
    const desktop = isDesktop();
    document.querySelectorAll(".motion-template_card").forEach(card => {
      if (card.dataset.hoverInit === "1") return;
      card.dataset.hoverInit = "1";

      const { pair, example } = getCardVideos(card);
      if (!pair || !example) return;

      Object.assign(example.style, {
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

      pair.style.position = "relative";
      pair.style.overflow = "hidden";

      if (desktop) {
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

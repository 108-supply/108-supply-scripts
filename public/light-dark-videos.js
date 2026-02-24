(() => {
  const LIGHT_CLASS = "is-base";
  const inLight = () => document.body.classList.contains(LIGHT_CLASS);
  const MODE_ATTR = "data-video-default";
  const MODE_MAIN = "main";
  const MODE_HOVER = "hover";

  const queue = new Set();
  let scheduled = false;
  let mutationTick = 0;

  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  function ensureSource(v) {
    return v.querySelector("source") || (() => {
      const ns = document.createElement("source");
      ns.type = "video/mp4";
      v.appendChild(ns);
      return ns;
    })();
  }

  function getPair(v) {
    const pair = v.closest(".video-pair");
    if (!pair) return null;
    const dark = pair.querySelector("video.video-dark");
    const light = pair.querySelector("video.video-light");
    const hover = pair.querySelector("video.video-hover");
    if (!dark) return null;
    return { pair, dark, light, hover };
  }

  function getDefaultMode() {
    const m = (document.body.getAttribute(MODE_ATTR) || MODE_MAIN).toLowerCase();
    return m === MODE_HOVER ? MODE_HOVER : MODE_MAIN;
  }

  function isHoverDefaultMode() {
    return getDefaultMode() === MODE_HOVER;
  }

  function getMainVideo(pair) {
    if (!pair) return null;
    const dark = pair.querySelector("video.video-dark");
    const light = pair.querySelector("video.video-light");
    if (inLight() && light && light.dataset.loaded === "1") return light;
    return dark;
  }

  function getReferenceVideo(pair) {
    if (!pair) return null;
    const main = getMainVideo(pair);
    if (main && main.readyState >= 2) return main;
    return pair.querySelector("video.video-dark");
  }

  function safeSync(reference, target) {
    if (!reference || !target) return;
    if (reference.readyState < 2 || target.readyState < 2) return;
    if (Math.abs((target.currentTime || 0) - (reference.currentTime || 0)) < 0.12) return;

    try {
      if (isSafari) {
        target.pause();
        target.currentTime = reference.currentTime;
        const p = target.play();
        if (p && p.catch) p.catch(() => {});
      } else {
        target.currentTime = reference.currentTime;
      }
    } catch (e) {}
  }

  function syncVisiblePairs() {
    document.querySelectorAll(".video-pair").forEach(pair => {
      const r = pair.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= window.innerHeight) return;

      const dark = pair.querySelector("video.video-dark");
      const light = pair.querySelector("video.video-light");
      const hover = pair.querySelector("video.video-hover");
      const ref = getReferenceVideo(pair);

      if (!ref) return;
      if (light && light.dataset.loaded === "1" && ref !== light) safeSync(ref, light);
      if (hover && hover.dataset.loaded === "1") safeSync(ref, hover);
    });
  }

  function loadOne(v) {
    if (v.dataset.loaded === "1") return;
    const src = v.dataset.src;
    if (!src) return;

    const s = ensureSource(v);
    s.src = src;

    v.addEventListener("loadeddata", () => {
      v.dataset.loaded = "1";
      v.setAttribute("data-loaded", "1");

      const p = getPair(v);
      if (!p) return;

      if (v.classList.contains("video-light")) safeSync(p.dark, v);
      if (v.classList.contains("video-hover")) safeSync(p.dark, v);
      if (v.classList.contains("video-dark") && isCardVisible(v) && isNearViewport(v) && v.paused) {
        const play = v.play();
        if (play && play.catch) play.catch(() => {});
      }
    }, { once: true });

    v.load();
  }

  // ---------- QUEUE ----------

  function flushQueue() {
    scheduled = false;
    if (!inLight()) return;

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

  const io = new IntersectionObserver((entries) => {
    if (!inLight()) return;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      if (!isCardVisible(e.target)) continue;
      queue.add(e.target);
    }
    scheduleFlush();
  }, { root: null, threshold: 0.15 });

  function isCardVisible(node) {
    const card = node.closest(".motion-template_card");
    if (!card) return true;
    const cs = window.getComputedStyle(card);
    return cs.display !== "none" && cs.visibility !== "hidden";
  }

  function isNearViewport(node) {
    const card = node.closest(".motion-template_card") || node;
    const r = card.getBoundingClientRect();
    return r.bottom > -120 && r.top < window.innerHeight + 120;
  }

  function sourceAttr(v) {
    return ensureSource(v).getAttribute("src") || "";
  }

  function stashAsLazy(v) {
    const s = ensureSource(v);
    const src = s.getAttribute("src") || v.getAttribute("src") || "";
    if (src && !v.dataset.src) v.dataset.src = src;
    s.removeAttribute("src");
    v.removeAttribute("src");
    v.preload = "none";
  }

  function refreshProductVideoLoading() {
    document.querySelectorAll(".motion-template_card").forEach(card => {
      const visible = isCardVisible(card);
      const dark = card.querySelector("video.video-dark");
      const light = card.querySelector("video.video-light");
      const hover = card.querySelector("video.video-hover");

      // keep light/hover lazy until explicitly loaded for visible interactions
      if (light && sourceAttr(light) && light.dataset.loaded !== "1") stashAsLazy(light);
      if (hover && sourceAttr(hover) && hover.dataset.loaded !== "1") stashAsLazy(hover);

      if (!dark) return;

      if (!visible) {
        // hidden cards should not keep eager dark sources attached
        if (sourceAttr(dark) && dark.dataset.loaded !== "1") stashAsLazy(dark);
        try { dark.pause(); } catch (e) {}
        if (light) queue.delete(light);
        return;
      }

      // when card becomes visible (load more), attach/load dark if it was detached
      if (dark.dataset.src && !sourceAttr(dark)) loadOne(dark);
      if (dark.dataset.loaded === "1" && dark.paused && isNearViewport(card)) {
        const play = dark.play();
        if (play && play.catch) play.catch(() => {});
      }

      if (visible && isHoverDefaultMode() && hover && hover.dataset.src && !sourceAttr(hover)) {
        loadOne(hover);
      }

      applyCardVideoMode(card);
    });

    if (typeof window._108Grid?.kickVisiblePlayback === "function") {
      window._108Grid.kickVisiblePlayback();
      setTimeout(() => window._108Grid.kickVisiblePlayback(), 120);
    }
  }

  function refreshObservedLightVideos() {
    refreshProductVideoLoading();
    document.querySelectorAll("video.video-light").forEach(v => {
      const observed = v.dataset.lightObserved === "1";
      const visible = isCardVisible(v);

      if (visible && !observed) {
        io.observe(v);
        v.dataset.lightObserved = "1";
        return;
      }

      if (!visible && observed) {
        io.unobserve(v);
        delete v.dataset.lightObserved;
        queue.delete(v);
      }
    });
  }

  function onThemeChange() {
    if (!inLight()) return;
    document.querySelectorAll("video.video-light").forEach(v => {
      if (!isCardVisible(v)) return;
      const r = v.getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight) queue.add(v);
    });
    scheduleFlush();
    setTimeout(syncVisiblePairs, 120);
    setTimeout(syncVisiblePairs, 420);
  }

  // ---------- HOVER ----------

  function showHover(pair, hoverVideo) {
    const card = pair.closest(".motion-template_card");
    if (card) card.dataset.hovering = "1";

    if (isHoverDefaultMode()) {
      hoverVideo.style.opacity = "0";
      const main = getMainVideo(pair);
      if (main && main.paused && main.readyState >= 2) {
        const p = main.play();
        if (p && p.catch) p.catch(() => {});
      }
      return;
    }

    // lazy load przy pierwszym hover
    if (hoverVideo.dataset.loaded !== "1") {
      loadOne(hoverVideo);
      hoverVideo.addEventListener("loadeddata", () => {
        const ref = getReferenceVideo(pair);
        safeSync(ref, hoverVideo);
        const p = hoverVideo.play();
        if (p && p.catch) p.catch(() => {});
      }, { once: true });
    } else {
      const ref = getReferenceVideo(pair);
      safeSync(ref, hoverVideo);
      const p = hoverVideo.play();
      if (p && p.catch) p.catch(() => {});
    }

    hoverVideo.style.opacity = "1";
  }

  function hideHover(hoverVideo) {
    const pair = hoverVideo.closest(".video-pair");
    const card = hoverVideo.closest(".motion-template_card");
    if (card) card.dataset.hovering = "0";

    if (isHoverDefaultMode()) {
      if (pair && hoverVideo.dataset.loaded !== "1") {
        loadOne(hoverVideo);
      }
      hoverVideo.style.opacity = "1";
      if (hoverVideo.readyState >= 2 && hoverVideo.paused) {
        const p = hoverVideo.play();
        if (p && p.catch) p.catch(() => {});
      }
      return;
    }

    hoverVideo.style.opacity = "0";
    // poczekaj na fade out zanim pauzujesz
    setTimeout(() => {
      hoverVideo.pause();
    }, 200);
  }

  function applyCardVideoMode(card) {
    const pair = card.querySelector(".video-pair");
    if (!pair) return;
    const hoverVideo = pair.querySelector("video.video-hover");
    if (!hoverVideo) return;

    const hovering = card.dataset.hovering === "1" || card.classList.contains("hover-active");
    const main = getMainVideo(pair);

    if (isHoverDefaultMode()) {
      if (!hovering) {
        if (hoverVideo.dataset.loaded !== "1") loadOne(hoverVideo);
        hoverVideo.style.opacity = "1";
        if (hoverVideo.readyState >= 2 && hoverVideo.paused) {
          const p = hoverVideo.play();
          if (p && p.catch) p.catch(() => {});
        }
      } else {
        hoverVideo.style.opacity = "0";
      }
      if (main && main.paused && main.readyState >= 2) {
        const p = main.play();
        if (p && p.catch) p.catch(() => {});
      }
      return;
    }

    if (!hovering) {
      hoverVideo.style.opacity = "0";
      if (!hoverVideo.paused) hoverVideo.pause();
    }
    if (main && main.paused && main.readyState >= 2) {
      const p = main.play();
      if (p && p.catch) p.catch(() => {});
    }
  }

  function initCards() {
    document.querySelectorAll(".motion-template_card").forEach(card => {
      if (card.dataset.hoverInit === "1") return;
      card.dataset.hoverInit = "1";

      const pair = card.querySelector(".video-pair");
      if (!pair) return;

      const hoverVideo = pair.querySelector("video.video-hover");
      if (!hoverVideo) return;

      // upewnij się że hover video ma prawidłowe style
      Object.assign(hoverVideo.style, {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        objectFit: "cover",
        opacity: "0",
        transition: "opacity 0.2s ease",
        zIndex: "2",
        pointerEvents: "none"
      });

      // upewnij się że .video-pair ma position relative
      pair.style.position = "relative";

      // desktop hover
      card.addEventListener("mouseenter", () => showHover(pair, hoverVideo));
      card.addEventListener("mouseleave", () => hideHover(hoverVideo));
      applyCardVideoMode(card);
    });
  }

  // ---------- MOBILE TOGGLE ----------

  function initMobileToggle() {
    document.querySelectorAll(".show-examples-btn").forEach(btn => {
      if (btn.dataset.mobileHoverInit === "1") return;
      btn.dataset.mobileHoverInit = "1";

      btn.addEventListener("click", () => {
        const card = btn.closest(".motion-template_card");
        if (!card) return;

        const pair = card.querySelector(".video-pair");
        if (!pair) return;

        const hoverVideo = pair.querySelector("video.video-hover");
        if (!hoverVideo) return;

        const isActive = card.classList.contains("hover-active");

        if (!isActive) {
          card.classList.add("hover-active");
          btn.textContent = "Hide examples";
          showHover(pair, hoverVideo);
        } else {
          card.classList.remove("hover-active");
          btn.textContent = "Show examples";
          hideHover(hoverVideo);
        }
        applyCardVideoMode(card);
      });
    });
  }

  function updateModeButtonsUI() {
    const mode = getDefaultMode();
    document.querySelectorAll("[data-video-default-btn]").forEach(btn => {
      const v = (btn.getAttribute("data-video-default-btn") || "").toLowerCase();
      btn.classList.toggle("is-active", v === mode);
    });
  }

  function setVideoDefaultMode(mode) {
    const next = mode === MODE_HOVER ? MODE_HOVER : MODE_MAIN;
    document.body.setAttribute(MODE_ATTR, next);
    updateModeButtonsUI();

    document.querySelectorAll(".motion-template_card").forEach(applyCardVideoMode);
    refreshProductVideoLoading();
    syncVisiblePairs();
    if (typeof window._108Grid?.refreshVideoObserver === "function") {
      window._108Grid.refreshVideoObserver();
    }
    if (typeof window._108Grid?.kickVisiblePlayback === "function") {
      window._108Grid.kickVisiblePlayback();
    }
  }

  function initVideoModeSwitcher() {
    document.querySelectorAll("[data-video-default-btn]").forEach(btn => {
      if (btn.dataset.videoDefaultInit === "1") return;
      btn.dataset.videoDefaultInit = "1";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const mode = (btn.getAttribute("data-video-default-btn") || MODE_MAIN).toLowerCase();
        setVideoDefaultMode(mode);
      });
    });
    updateModeButtonsUI();
  }

  // ---------- INIT ----------

  function init() {
    initCards();
    initMobileToggle();
    initVideoModeSwitcher();

    // Wait until grid pagination/filter scripts settle visibility state.
    let tries = 0;
    const boot = () => {
      tries++;
      const cards = document.querySelectorAll(".motion-template_card");
      const hasHidden = Array.from(cards).some(c => window.getComputedStyle(c).display === "none");
      const gridReady = !!window._108Grid?.engine;

      if (hasHidden || gridReady || tries >= 20) {
        refreshProductVideoLoading();
        refreshObservedLightVideos();
        onThemeChange();
        return;
      }

      requestAnimationFrame(boot);
    };
    requestAnimationFrame(boot);
  }

  window._108Grid = window._108Grid || {};
  window._108Grid.refreshLightVideoObserver = refreshObservedLightVideos;
  window._108Grid.refreshProductVideoLoading = refreshProductVideoLoading;
  window._108Grid.setVideoDefaultMode = setVideoDefaultMode;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  new MutationObserver(onThemeChange)
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });

  // re-init po załadowaniu nowych kart (infinite scroll / CMS load more)
  new MutationObserver(() => {
    if (mutationTick) return;
    mutationTick = requestAnimationFrame(() => {
      mutationTick = 0;
      refreshProductVideoLoading();
      refreshObservedLightVideos();
      onThemeChange();
      initCards();
      initMobileToggle();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

})();

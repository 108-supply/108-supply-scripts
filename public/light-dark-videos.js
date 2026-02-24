(() => {
  const LIGHT_CLASS = "is-base";
  const inLight = () => document.body.classList.contains(LIGHT_CLASS);

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

  function getReferenceVideo(pair) {
    if (!pair) return null;
    const dark = pair.querySelector("video.video-dark");
    const light = pair.querySelector("video.video-light");
    if (inLight() && light && light.dataset.loaded === "1" && light.readyState >= 2) return light;
    return dark;
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
    });
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
    hoverVideo.style.opacity = "0";
    // poczekaj na fade out zanim pauzujesz
    setTimeout(() => {
      hoverVideo.pause();
    }, 200);
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
      });
    });
  }

  // ---------- INIT ----------

  function init() {
    initCards();
    initMobileToggle();

    // Wait until grid pagination/filter scripts settle visibility state.
    let tries = 0;
    const boot = () => {
      tries++;
      const cards = document.querySelectorAll(".motion-template_card");
      const hasHidden = Array.from(cards).some(c => window.getComputedStyle(c).display === "none");
      const gridReady = !!window.BYQGrid?.engine;

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

  window.BYQGrid = window.BYQGrid || {};
  window.BYQGrid.refreshLightVideoObserver = refreshObservedLightVideos;
  window.BYQGrid.refreshProductVideoLoading = refreshProductVideoLoading;

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

(() => {
  const LIGHT_CLASS = "is-base";
  const inLight = () => document.body.classList.contains(LIGHT_CLASS);

  const queue = new Set();
  let scheduled = false;
  const pairStates = new WeakMap();
  const trackedPairs = new Set();
  const hoverHideTimers = new WeakMap();
  const hoverTokens = new WeakMap();
  let syncTimer = 0;

  const SYNC = {
    hardSeek: 0.18,
    nudgeThreshold: 0.035,
    settleThreshold: 0.012,
    maxRateOffset: 0.08
  };

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

  function normalizeTimeForVideo(video, time) {
    const d = video.duration;
    if (!Number.isFinite(d) || d <= 0) return Math.max(0, time);
    const t = time % d;
    return t < 0 ? t + d : t;
  }

  function isInViewport(el) {
    const r = el.getBoundingClientRect();
    return r.bottom > -100 && r.top < window.innerHeight + 100;
  }

  function getOrCreatePairState(pair) {
    let state = pairStates.get(pair);
    if (state) return state;

    const dark = pair.querySelector("video.video-dark");
    const light = pair.querySelector("video.video-light");
    const hover = pair.querySelector("video.video-hover");
    if (!dark) return null;

    state = {
      pair,
      dark,
      light,
      hover,
      hoverActive: false,
      clock: {
        mediaTime: 0,
        perfTime: performance.now(),
        playbackRate: 1,
        paused: true
      }
    };

    [dark, light, hover].forEach(v => {
      if (!v || v.dataset.syncClockBound === "1") return;
      v.dataset.syncClockBound = "1";
      ["loadeddata", "play", "pause", "ratechange", "seeking", "seeked"].forEach(evt => {
        v.addEventListener(evt, () => {
          const s = getOrCreatePairState(pair);
          if (!s) return;
          const master = pickMasterVideo(s);
          if (!master) return;
          captureClockFromMaster(s, master);
          syncPair(s);
        }, { passive: true });
      });
    });

    pairStates.set(pair, state);
    trackedPairs.add(pair);
    return state;
  }

  function pickMasterVideo(state) {
    if (state.dark && state.dark.readyState >= 2) return state.dark;
    if (state.light && state.light.readyState >= 2) return state.light;
    if (state.hover && state.hover.readyState >= 2) return state.hover;
    return null;
  }

  function captureClockFromMaster(state, master) {
    if (!master || master.readyState < 2) return;
    state.clock.mediaTime = master.currentTime || 0;
    state.clock.perfTime = performance.now();
    state.clock.playbackRate = Number.isFinite(master.playbackRate) && master.playbackRate > 0 ? master.playbackRate : 1;
    state.clock.paused = !!master.paused;
  }

  function predictedClockTime(state, video) {
    const elapsed = (performance.now() - state.clock.perfTime) / 1000;
    const raw = state.clock.paused
      ? state.clock.mediaTime
      : state.clock.mediaTime + elapsed * state.clock.playbackRate;
    return normalizeTimeForVideo(video, raw);
  }

  function syncFollower(video, state, allowPlay) {
    if (!video || video.readyState < 2) return;

    const target = predictedClockTime(state, video);
    const now = video.currentTime || 0;
    const drift = target - now;
    const absDrift = Math.abs(drift);

    if (absDrift > SYNC.hardSeek) {
      try { video.currentTime = target; } catch (e) {}
    }

    const baseRate = state.clock.playbackRate || 1;
    if (absDrift > SYNC.nudgeThreshold) {
      const offset = Math.max(-SYNC.maxRateOffset, Math.min(SYNC.maxRateOffset, drift * 0.6));
      video.playbackRate = Math.max(0.5, Math.min(2, baseRate + offset));
    } else if (Math.abs(video.playbackRate - baseRate) > SYNC.settleThreshold) {
      video.playbackRate = baseRate;
    }

    if (state.clock.paused || !allowPlay) {
      if (!video.paused) video.pause();
      return;
    }

    if (video.paused) {
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
    }
  }

  function syncPair(state) {
    if (!state || !state.pair.isConnected) return;
    const master = pickMasterVideo(state);
    if (!master) return;

    captureClockFromMaster(state, master);

    const videos = [state.dark, state.light, state.hover];
    videos.forEach(v => {
      if (!v || v === master) return;
      const allowPlay = (v === state.light)
        ? inLight()
        : !(v === state.hover && !state.hoverActive);
      syncFollower(v, state, allowPlay);
    });

    if (state.hover && !state.hoverActive && !state.hover.paused) {
      state.hover.pause();
    }
  }

  function ensureSyncLoop() {
    if (syncTimer) return;
    syncTimer = window.setInterval(() => {
      if (document.hidden) return;

      trackedPairs.forEach(pair => {
        if (!pair.isConnected) {
          trackedPairs.delete(pair);
          return;
        }

        const state = pairStates.get(pair);
        if (!state) return;
        if (!state.hoverActive && !isInViewport(pair)) return;
        syncPair(state);
      });
    }, 120);
  }

  function clearHoverHideTimer(hoverVideo) {
    const t = hoverHideTimers.get(hoverVideo);
    if (t) {
      clearTimeout(t);
      hoverHideTimers.delete(hoverVideo);
    }
  }

  function bumpHoverToken(hoverVideo) {
    const n = (hoverTokens.get(hoverVideo) || 0) + 1;
    hoverTokens.set(hoverVideo, n);
    return n;
  }

  function syncVisiblePairs() {
    document.querySelectorAll(".video-pair").forEach(pair => {
      if (!isInViewport(pair)) return;
      const state = getOrCreatePairState(pair);
      if (!state) return;
      syncPair(state);
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
      const state = getOrCreatePairState(p.pair);
      if (!state) return;
      syncPair(state);
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
      queue.add(e.target);
    }
    scheduleFlush();
  }, { root: null, threshold: 0.15 });

  function observeAll() {
    document.querySelectorAll("video.video-light").forEach(v => {
      if (v.dataset.lightObserved === "1") return;
      v.dataset.lightObserved = "1";
      io.observe(v);
    });
    document.querySelectorAll(".video-pair").forEach(pair => getOrCreatePairState(pair));
  }

  function onThemeChange() {
    if (!inLight()) return;
    document.querySelectorAll("video.video-light").forEach(v => {
      const r = v.getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight) queue.add(v);
    });
    scheduleFlush();
    setTimeout(syncVisiblePairs, 120);
    setTimeout(syncVisiblePairs, 420);
  }

  // ---------- HOVER ----------

  function showHover(pair, hoverVideo) {
    const state = getOrCreatePairState(pair);
    if (state) state.hoverActive = true;
    clearHoverHideTimer(hoverVideo);
    const myToken = bumpHoverToken(hoverVideo);
    hoverVideo.style.opacity = "1";

    const startHover = () => {
      const s = getOrCreatePairState(pair);
      if (!s) return;
      if (!s.hoverActive) return;
      if ((hoverTokens.get(hoverVideo) || 0) !== myToken) return;
      syncPair(s);
      if (!s.clock.paused) {
        const p = hoverVideo.play();
        if (p && p.catch) p.catch(() => {});
      }
    };

    // lazy load on first hover
    if (hoverVideo.dataset.loaded !== "1") {
      loadOne(hoverVideo);
      hoverVideo.addEventListener("loadeddata", startHover, { once: true });
    } else {
      startHover();
    }
  }

  function hideHover(hoverVideo) {
    const pair = hoverVideo.closest(".video-pair");
    const state = pair ? getOrCreatePairState(pair) : null;
    if (state) state.hoverActive = false;
    bumpHoverToken(hoverVideo);
    clearHoverHideTimer(hoverVideo);

    hoverVideo.style.opacity = "0";
    // Keep currentTime to avoid jump-cut glitch on next hover.
    const timer = setTimeout(() => {
      const p = hoverVideo.closest(".video-pair");
      const s = p ? getOrCreatePairState(p) : null;
      if (s && s.hoverActive) return;
      hoverVideo.pause();
      hoverVideo.playbackRate = 1;
      hoverHideTimers.delete(hoverVideo);
    }, 200);
    hoverHideTimers.set(hoverVideo, timer);
  }

  function initCards() {
    document.querySelectorAll(".motion-template_card").forEach(card => {
      if (card.dataset.hoverCardInit === "1") return;
      card.dataset.hoverCardInit = "1";

      const pair = card.querySelector(".video-pair");
      if (!pair) return;

      const hoverVideo = pair.querySelector("video.video-hover");
      if (!hoverVideo) return;

      // upewnij się że hover video ma prawidłowe style
      Object.assign(hoverVideo.style, {
        position: "absolute",
        inset: "0",
        display: "block",
        width: "100%",
        height: "100%",
        objectFit: "cover",
        opacity: "0",
        transition: "opacity 0.2s ease",
        zIndex: "2",
        pointerEvents: "none",
        transform: "translateZ(0)",
        backfaceVisibility: "hidden"
      });

      // upewnij się że .video-pair ma position relative
      pair.style.position = "relative";
      pair.style.overflow = "hidden";

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
    observeAll();
    onThemeChange();
    initCards();
    initMobileToggle();
    ensureSyncLoop();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  new MutationObserver(onThemeChange)
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });

  // re-init po załadowaniu nowych kart (infinite scroll / CMS load more)
  new MutationObserver(() => {
    observeAll();
    onThemeChange();
    initCards();
    initMobileToggle();
    ensureSyncLoop();
  }).observe(document.documentElement, { childList: true, subtree: true });

})();
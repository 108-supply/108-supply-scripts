(() => {
    const LIGHT_CLASS = "is-base";
    const inLight = () => document.body.classList.contains(LIGHT_CLASS);
  
    const queue = new Set();
    let scheduled = false;
  
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
  
        if (!dark) return;
        if (light && light.dataset.loaded === "1") safeSync(dark, light);
        if (hover && hover.dataset.loaded === "1") safeSync(dark, hover);
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
  
        // sync z dark jako referencja
        if (v.classList.contains("video-light")) safeSync(p.dark, v);
        if (v.classList.contains("video-hover")) safeSync(p.dark, v);
      }, { once: true });
  
      v.load();
    }
  
    // ---------- QUEUE (tylko dla light, hover ładujemy osobno) ----------
  
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
      document.querySelectorAll("video.video-light").forEach(v => io.observe(v));
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
  
    // ---------- HOVER LOGIC ----------
  
    function loadHover(pair) {
      const hover = pair.querySelector("video.video-hover");
      if (!hover) return;
      loadOne(hover); // lazy load przy pierwszym hover
    }
  
    function showHover(pair) {
      const hover = pair.querySelector("video.video-hover");
      if (!hover) return;
  
      loadHover(pair);
  
      hover.style.opacity = "1";
      hover.style.pointerEvents = "auto";
  
      // sync po załadowaniu lub od razu
      const dark = pair.querySelector("video.video-dark");
      if (hover.dataset.loaded === "1") {
        safeSync(dark, hover);
      } else {
        hover.addEventListener("loadeddata", () => safeSync(dark, hover), { once: true });
      }
  
      const p = hover.play();
      if (p && p.catch) p.catch(() => {});
    }
  
    function hideHover(pair) {
      const hover = pair.querySelector("video.video-hover");
      if (!hover) return;
      hover.style.opacity = "0";
      hover.style.pointerEvents = "none";
      hover.pause();
    }
  
    function initHoverInteractions() {
      document.querySelectorAll(".video-pair").forEach(pair => {
        // ustawiamy styl wyjściowy hover video
        const hover = pair.querySelector("video.video-hover");
        if (!hover) return;
  
        Object.assign(hover.style, {
          position: "absolute",
          inset: "0",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: "0",
          pointerEvents: "none",
          transition: "opacity 0.2s ease",
          zIndex: "2"
        });
  
        // upewniamy się że parent ma position relative
        pair.style.position = "relative";
  
        // Desktop hover
        pair.addEventListener("mouseenter", () => showHover(pair));
        pair.addEventListener("mouseleave", () => hideHover(pair));
      });
    }
  
    // ---------- MOBILE TOGGLE ----------
  
    function initMobileToggle() {
      document.querySelectorAll(".show-examples-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const pair = btn.closest(".video-pair");
          if (!pair) return;
  
          const isActive = pair.classList.contains("hover-active");
  
          if (!isActive) {
            pair.classList.add("hover-active");
            btn.textContent = "Hide examples";
            showHover(pair);
          } else {
            pair.classList.remove("hover-active");
            btn.textContent = "Show examples";
            hideHover(pair);
          }
        });
      });
    }
  
    // ---------- INIT ----------
  
    function init() {
      observeAll();
      onThemeChange();
      initHoverInteractions();
      initMobileToggle();
    }
  
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  
    new MutationObserver(onThemeChange)
      .observe(document.body, { attributes: true, attributeFilter: ["class"] });
  
    new MutationObserver(() => {
      observeAll();
      onThemeChange();
      initHoverInteractions();
      initMobileToggle();
    }).observe(document.documentElement, { childList: true, subtree: true });
  
  })();
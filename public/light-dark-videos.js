(() => {
  // Listing cards only: default dark video + hover video on hover.
  // No light/dark mode switching.
  const queue = new Set();
  let scheduled = false;
  let mutationTick = 0;

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
      if (v.classList.contains("video-dark")) playIfReady(v);
    }, { once: true });

    v.load();
  }

  function refreshProductVideoLoading() {
    document.querySelectorAll(".motion-template_card").forEach(card => {
      const visible = isCardVisible(card);
      const { dark, hover } = getCardVideos(card);

      // Hover is always lazy until interaction.
      if (hover && sourceAttr(hover) && hover.dataset.loaded !== "1") {
        stashAsLazy(hover);
      }

      if (!dark) return;

      if (!visible) {
        if (sourceAttr(dark) && dark.dataset.loaded !== "1") stashAsLazy(dark);
        if (!dark.paused) dark.pause();
        return;
      }

      if (dark.dataset.src && !sourceAttr(dark)) loadOne(dark);
      if (isNearViewport(card)) playIfReady(dark);
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
    if (!hover) return;
    if (hover.dataset.loaded !== "1") loadOne(hover);
    hover.style.opacity = "1";
    playIfReady(hover);
  }

  function hideHover(card) {
    const { hover } = getCardVideos(card);
    if (!hover) return;
    hover.style.opacity = "0";
    setTimeout(() => {
      if (!hover.paused) hover.pause();
    }, 200);
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
        transition: "opacity 0.2s ease",
        zIndex: "2",
        pointerEvents: "none"
      });

      pair.style.position = "relative";

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

  function init() {
    initCards();
    initMobileToggle();

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
  // Keep compatibility with existing hooks in filter-engine:
  window._108Grid.refreshLightVideoObserver = () => {};
  window._108Grid.refreshProductVideoLoading = refreshProductVideoLoading;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  new MutationObserver(() => refreshProductVideoLoading())
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });

  new MutationObserver(() => {
    if (mutationTick) return;
    mutationTick = requestAnimationFrame(() => {
      mutationTick = 0;
      refreshProductVideoLoading();
      initCards();
      initMobileToggle();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();

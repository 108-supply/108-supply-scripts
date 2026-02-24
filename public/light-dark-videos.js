(() => {
  const LIGHT_CLASS = "is-base";
  const inLight = () => document.body.classList.contains(LIGHT_CLASS);

  const queue = new Set();
  let scheduled = false;

  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  function ensureSource(v){
    return v.querySelector("source") || (() => {
      const ns = document.createElement("source");
      ns.type = "video/mp4";
      v.appendChild(ns);
      return ns;
    })();
  }

  function getPair(v){
    const pair = v.closest(".video-pair");
    if (!pair) return null;
    const dark = pair.querySelector("video.video-dark");
    const light = pair.querySelector("video.video-light");
    if (!dark || !light) return null;
    return { pair, dark, light };
  }

  function safeSync(dark, light){
    // sync only when both have some data
    if (dark.readyState < 2 || light.readyState < 2) return;

    const t = dark.currentTime || 0;

    // jeśli już prawie równo, nic nie rób
    if (Math.abs((light.currentTime || 0) - t) < 0.12) return;

    try {
      // Safari: lepiej pause -> set -> play
      if (isSafari) {
        light.pause();
        light.currentTime = t;
        // nie wymuszamy play() jeśli przeglądarka nie chce,
        // ale przy muted/autoplay zwykle pójdzie
        const p = light.play();
        if (p && p.catch) p.catch(()=>{});
      } else {
        light.currentTime = t;
      }
    } catch(e) {}
  }

  function syncVisiblePairs(){
    // synchronizuj tylko to co w viewport, żeby Safari nie świrowało
    document.querySelectorAll(".video-pair").forEach(pair => {
      const r = pair.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= window.innerHeight) return;

      const dark = pair.querySelector("video.video-dark");
      const light = pair.querySelector("video.video-light");
      if (!dark || !light) return;

      // tylko jeśli light jest już załadowany
      if (light.dataset.loaded !== "1") return;

      safeSync(dark, light);
    });
  }

  function loadOne(v){
    if (v.dataset.loaded === "1") return;
    const src = v.dataset.src;
    if (!src) return;

    const s = ensureSource(v);
    s.src = src;

    v.addEventListener("loadeddata", () => {
      v.dataset.loaded = "1";
      v.setAttribute("data-loaded", "1");

      // po załadowaniu light – spróbuj zsynchronizować z dark
      const p = getPair(v);
      if (p) safeSync(p.dark, p.light);
    }, { once: true });

    v.load();
  }

  function flushQueue(){
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

  function scheduleFlush(){
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

  function observeAll(){
    document.querySelectorAll("video.video-light").forEach(v => io.observe(v));
  }

  function onThemeChange(){
    if (!inLight()) return;

    document.querySelectorAll("video.video-light").forEach(v => {
      const r = v.getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight) queue.add(v);
    });
    scheduleFlush();

    // po chwili od przełączenia – zrób sync widocznych par
    setTimeout(syncVisiblePairs, 120);
    setTimeout(syncVisiblePairs, 420);
  }

  // init
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      observeAll();
      onThemeChange();
    });
  } else {
    observeAll();
    onThemeChange();
  }

  new MutationObserver(onThemeChange)
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });

  new MutationObserver(() => {
    observeAll();
    onThemeChange();
  }).observe(document.documentElement, { childList: true, subtree: true });

})();
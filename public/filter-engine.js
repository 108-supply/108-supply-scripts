// ========================================
// VIDEO VIEWPORT OBSERVER
// Pauzuje filmy poza ekranem (oszczędność CPU/RAM)
// Nie ingeruje w Twój is-base system
// ========================================
(() => {
  const inLight = () => document.body.classList.contains("is-base");

  function isHoverVisible(card) {
    const hover = card.querySelector("video.video-hover");
    if (!hover || hover.dataset.loaded !== "1") return false;
    const op = parseFloat(hover.style.opacity || "0");
    return op > 0.01 || card.classList.contains("hover-active");
  }

  function videosToRun(card) {
    const dark = card.querySelector("video.video-dark");
    const light = card.querySelector("video.video-light");
    const hover = card.querySelector("video.video-hover");
    const run = new Set();

    if (isHoverVisible(card)) {
      if (hover) run.add(hover);
      return run;
    }

    if (inLight() && light && light.dataset.loaded === "1") {
      run.add(light);
      return run;
    }

    if (dark) run.add(dark);
    return run;
  }

  function isCardInViewport(card) {
    const r = card.getBoundingClientRect();
    return r.bottom > -120 && r.top < window.innerHeight + 120;
  }

  function bindPlayWhenReady(video, card) {
    if (video.dataset.playWhenReadyBound === "1") return;
    video.dataset.playWhenReadyBound = "1";

    const tryPlay = () => {
      if (!isCardVisible(card)) return;
      if (!isCardInViewport(card)) return;
      if (!videosToRun(card).has(video)) return;
      if (video.paused && video.readyState >= 2) {
        video.play().catch(() => {});
      }
    };

    video.addEventListener("loadeddata", tryPlay);
    video.addEventListener("canplay", tryPlay);
  }

  function applyPlaybackForCard(card) {
    const videos = card.querySelectorAll("video");
    const run = videosToRun(card);
    videos.forEach(v => {
      bindPlayWhenReady(v, card);
      if (run.has(v)) {
        if (v.paused && v.readyState >= 2) {
          v.play().catch(() => {});
        }
        return;
      }
      v.pause();
    });
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const card = entry.target;
      
      if (entry.isIntersecting) {
        applyPlaybackForCard(card);
      } else {
        // Card poza viewport - pauzuj (oszczędność CPU)
        card.querySelectorAll("video").forEach(v => {
          v.pause();
        });
      }
    });
  }, {
    rootMargin: '100px', // Start 100px before entering
    threshold: 0.01
  });

  function isCardVisible(card) {
    return window.getComputedStyle(card).display !== "none";
  }

  function syncObservedCards() {
    document.querySelectorAll('.motion-template_card').forEach(card => {
      const observed = card.dataset.observed === "true";
      const visible = isCardVisible(card);

      if (visible && !observed) {
        observer.observe(card);
        card.dataset.observed = 'true';
        applyPlaybackForCard(card);
        return;
      }

      if (!visible && observed) {
        observer.unobserve(card);
        delete card.dataset.observed;
        card.querySelectorAll("video").forEach(v => v.pause());
      }
    });
  }

  function deferredSync() {
    requestAnimationFrame(() => {
      requestAnimationFrame(syncObservedCards);
    });
  }

  // Init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', deferredSync);
  } else {
    deferredSync();
  }

  // Re-observe after filter/load more
  window.BYQGrid = window.BYQGrid || {};
  window.BYQGrid.refreshVideoObserver = syncObservedCards;

  console.log('[VideoViewport] Initialized - videos pause when off-screen');
})();









  (() => {
    const CONFIG = {
      selectors: {
        grid: ".motion-template_list",
        item: ".motion-template_card",
        category: ".card_category",
        viewBtn: ".view-button",
        filterRadio: 'input[type="radio"][data-filter-radio="1"]',
        filterWrap: ".filter-button",
        loadMoreBtn: '[data-load-more="1"]',
      },
      paging: { initial: 8, more: 8 },
      behavior: { stickyVisibleOnExpand: true },
      runtime: { lockDuringAnim: true }
    };
  
    const $  = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const norm = (s) => (s || "").trim().toLowerCase();
  
    function createEngine() {
      const S = CONFIG.selectors;
      const grid = $(S.grid);
      if (!grid) return console.warn("[Grid] Missing grid", S.grid);
  
      const viewButtons = $$(S.viewBtn);
      const loadMoreBtn = $(S.loadMoreBtn);
      const radios = $$(S.filterRadio);
  
      let locked = false;
      let queued = null;
  
      let currentFilter = "all";
      let limit = CONFIG.paging.initial;
  
      const allCards = () => $$(S.item, grid);
      const isVisible = (el) => el.style.display !== "none";
      const getCategory = (card) => norm($(S.category, card)?.textContent);
  
      const filteredList = () => {
        const cards = allCards();
        if (currentFilter === "all") return cards;
        return cards.filter(c => getCategory(c) === currentFilter);
      };
  
      function syncFilterActiveFromChecked() {
        $$(S.filterWrap).forEach(w => w.classList.remove("is-active"));
        const checked = radios.find(r => r.checked);
        if (!checked) return;
        const wrap = checked.closest(S.filterWrap);
        if (wrap) wrap.classList.add("is-active");
      }
  
      function setActiveView(btn) {
        viewButtons.forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
      }
  
      function computeKeep(nextList, prevVisibleSet) {
        if (!CONFIG.behavior.stickyVisibleOnExpand) return nextList.slice(0, limit);
  
        const prevVisible = Array.from(prevVisibleSet || []);
        const prevThatExistInNext = prevVisible.filter(el => nextList.includes(el));
  
        const keep = [];
  
        for (const el of prevThatExistInNext) {
          if (keep.length >= limit) break;
          keep.push(el);
        }
  
        for (const el of nextList) {
          if (keep.length >= limit) break;
          if (!keep.includes(el)) keep.push(el);
        }
  
        return keep;
      }
  
      function apply(keepArr, prevVisibleSet = new Set()) {
        const cards = allCards();
        const keep = new Set(keepArr);
  
        const entering = [];
        const staying = [];
  
        cards.forEach(card => {
          const shouldShow = keep.has(card);
          const wasVisible = prevVisibleSet.has(card);
  
          if (shouldShow) {
            card.style.display = "";
            if (!wasVisible) entering.push(card);
            else staying.push(card);
          } else {
            card.style.display = "none";
          }
        });
  
        if (loadMoreBtn) {
          loadMoreBtn.style.display = (limit < filteredList().length) ? "" : "none";
        }

        if (typeof window.BYQGrid?.refreshVideoObserver === "function") {
          window.BYQGrid.refreshVideoObserver();
        }
        if (typeof window.BYQGrid?.refreshLightVideoObserver === "function") {
          window.BYQGrid.refreshLightVideoObserver();
        }
        if (typeof window.BYQGrid?.refreshProductVideoLoading === "function") {
          window.BYQGrid.refreshProductVideoLoading();
        }
  
        return { entering, staying };
      }
  
      function queueAction(type, payload) { queued = { type, payload }; }
  
      return {
        CONFIG,
        get grid(){ return grid; },
        get viewButtons(){ return viewButtons; },
        get radios(){ return radios; },
  
        get state(){
          return { currentFilter, limit, locked, queued };
        },
  
        setLocked(v){ locked = v; },
        isLocked(){ return locked; },
  
        takeQueue(){
          const q = queued;
          queued = null;
          return q;
        },
  
        queueAction,
  
        setFilter(val){
          currentFilter = norm(val) || "all";
          limit = CONFIG.paging.initial;
        },
        setView(size){
          grid.setAttribute("data-size-grid", size);
          const btn = viewButtons.find(b => b.getAttribute("data-size") === size);
          if (btn) setActiveView(btn);
        },
        addMore(){ limit += CONFIG.paging.more; },
  
        syncFilterActiveFromChecked,
        filteredList,
        allCards,
        isVisible,
        computeKeep,
        apply,
  
        ensureRadioDefault(){
          if (!radios.some(r => r.checked)) {
            const allRadio = radios.find(r => norm(r.value) === "all");
            if (allRadio) allRadio.checked = true;
            else if (radios[0]) radios[0].checked = true;
          }
          currentFilter = norm(radios.find(r => r.checked)?.value) || "all";
        }
      };
    }
  
    window.BYQGrid = window.BYQGrid || {};
    window.BYQGrid.engine = createEngine();
  
    if (window.BYQGrid.engine) {
      const E = window.BYQGrid.engine;
      E.ensureRadioDefault();
      const initList = E.filteredList();
      const keepInit = initList.slice(0, CONFIG.paging.initial);
  
      const cards = E.allCards();
      const keep = new Set(keepInit);
      cards.forEach(card => {
        if (keep.has(card)) {
          card.style.display = "";
          card.style.opacity = "1";
          card.style.transform = "none";
        } else {
          card.style.display = "none";
        }
      });
  
      const loadMoreBtn = document.querySelector(E.CONFIG.selectors.loadMoreBtn);
      if (loadMoreBtn) {
        loadMoreBtn.style.display = (CONFIG.paging.initial < initList.length) ? "" : "none";
      }

      if (typeof window.BYQGrid?.refreshVideoObserver === "function") {
        window.BYQGrid.refreshVideoObserver();
      }
      if (typeof window.BYQGrid?.refreshLightVideoObserver === "function") {
        window.BYQGrid.refreshLightVideoObserver();
      }
      if (typeof window.BYQGrid?.refreshProductVideoLoading === "function") {
        window.BYQGrid.refreshProductVideoLoading();
      }
  
      E.syncFilterActiveFromChecked();
      console.log("[Grid] engine ready");
    }
  })();




  
  (() => {
    const ANIM = {
      flip: {
        duration: 0.95,
        ease: "expo.inOut",
        absolute: true,
        staggerAmount: 0.22,
        staggerFrom: "random",
      },
  
      fadeOut: {
        duration: 0.4,
        ease: "power2.in",
        stagger: 0.05,
        from: "end"
      },
  
      fadeIn: {
        duration: 0.5,
        ease: "power2.out",
        stagger: 0.08,
        from: "start",
        delay: 0.2
      },
  
      height: { 
        enabled: true, 
        ease: "expo.inOut",
        duration: 0.8
      },
  
      gridFx: { 
        enabled: true, 
        blurPx: 8, 
        brightness: 1.30, 
        ease: "power2.inOut" 
      },
  
      scrollOnFilterChange: {
        enabled: true,
        offset: -40,
        behavior: 'smooth',
        waitForScroll: true
      }
    };
  
    function initAnimator() {
      const E = window.BYQGrid?.engine;
      if (!E) return console.warn("[Grid] engine missing");
      if (!window.gsap || !window.Flip) return console.warn("[Grid] GSAP/Flip missing");
  
      gsap.registerPlugin(Flip);
  
      const grid = E.grid;
      const viewButtons = E.viewButtons;
      const radios = E.radios;
      const loadMoreBtn = document.querySelector(E.CONFIG.selectors.loadMoreBtn);
  
      // ✅ LENIS FIX: recalc scroll limits after ANY layout changes
      function refreshLenis() {
        if (typeof window._108RefreshLenis === "function") {
          window._108RefreshLenis();
          return;
        }
        if (window.lenis && typeof window.lenis.resize === "function") {
          requestAnimationFrame(() => {
            try { window.lenis.resize(); } catch (e) {}
          });
        }
      }
  
      // ✅ When media (img/video) loads inside grid, layout can grow later
      function hookMediaRefresh() {
        const gridEl = E.grid;
        if (!gridEl) return;
  
        gridEl.querySelectorAll("img").forEach(img => {
          if (img.dataset.lenisHooked === "1") return;
          img.dataset.lenisHooked = "1";
          if (!img.complete) {
            img.addEventListener("load", refreshLenis, { once: true });
            img.addEventListener("error", refreshLenis, { once: true });
          }
        });
  
        gridEl.querySelectorAll("video").forEach(v => {
          const card = v.closest(".motion-template_card");
          if (card && window.getComputedStyle(card).display === "none") return;
          if (v.dataset.lenisHooked === "1") return;
          v.dataset.lenisHooked = "1";
          v.addEventListener("loadedmetadata", refreshLenis, { once: true });
          v.addEventListener("loadeddata", refreshLenis, { once: true });
        });
      }
  
      // ✅ ResizeObserver: the “it still sometimes cuts” killer
      (function observeGridSize() {
        const gridEl = E.grid;
        if (!gridEl || !window.ResizeObserver) return;
  
        let raf = 0;
        const ro = new ResizeObserver(() => {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => refreshLenis());
        });
  
        ro.observe(gridEl);
      })();
  
      // run once on init
      hookMediaRefresh();
      refreshLenis();
  
      const Animator = {
        runFlip(mutatorFn) {
          if (E.isLocked()) return;
          E.setLocked(true);
  
          const all = E.allCards();
          gsap.killTweensOf(all);
          gsap.killTweensOf(grid);
  
          const prevVisible = new Set(all.filter(E.isVisible));
          const beforeVisibleArr = Array.from(prevVisible);
  
          beforeVisibleArr.forEach(el => {
            el.style.opacity = "1";
            el.style.transform = "none";
          });
  
          const state = Flip.getState(beforeVisibleArr);
          const startH = grid.getBoundingClientRect().height;
  
          mutatorFn();
  
          const nextList = E.filteredList();
          const keepArr = E.computeKeep(nextList, prevVisible);
          const { entering } = E.apply(keepArr, prevVisible);
  
          // ✅ After display changes
          hookMediaRefresh();
          refreshLenis();
  
          if (entering.length) {
            gsap.set(entering, { 
              opacity: 0,
              scale: 0.985,
              y: 10,
              overwrite: true 
            });
          }
  
          requestAnimationFrame(() => {
            const endH = grid.getBoundingClientRect().height;
  
            if (Math.abs(endH - startH) > 1) {
              grid.style.height = startH + "px";
            }
  
            const flipDur = ANIM.flip.duration;
            const total = flipDur + ANIM.flip.staggerAmount;
  
            const tl = gsap.timeline({
              onComplete: () => {
                grid.style.height = "";
                hookMediaRefresh();
                refreshLenis();
                E.setLocked(false);
                flushQueue();
              }
            });
  
            tl.add(
              Flip.from(state, {
                absolute: ANIM.flip.absolute,
                duration: flipDur,
                ease: ANIM.flip.ease,
                stagger: { 
                  amount: ANIM.flip.staggerAmount, 
                  from: ANIM.flip.staggerFrom 
                }
              }),
              0
            );
  
            tl.to(grid, { 
              height: endH, 
              duration: flipDur, 
              ease: ANIM.flip.ease 
            }, 0);
  
            if (ANIM.gridFx.enabled) {
              tl.fromTo(
                grid,
                { filter: "blur(0px) brightness(1)" },
                {
                  duration: total,
                  keyframes: [
                    { 
                      filter: `blur(${ANIM.gridFx.blurPx}px) brightness(${ANIM.gridFx.brightness})`, 
                      duration: total * 0.5, 
                      ease: ANIM.gridFx.ease 
                    },
                    { 
                      filter: "blur(0px) brightness(1)", 
                      duration: total * 0.5, 
                      ease: ANIM.gridFx.ease 
                    },
                  ],
                  clearProps: "filter",
                },
                0
              );
            }
  
            if (entering.length > 0) {
              tl.to(entering, {
                opacity: 1,
                scale: 1,
                y: 0,
                duration: 0.45,
                ease: "power2.out",
                stagger: 0.08,
                clearProps: "opacity,transform",
                overwrite: true
              }, 0.2);
            }
          });
        },
  
        runFade(mutatorFn, isLoadMore = false) {
          if (E.isLocked()) return;
          E.setLocked(true);
  
          const all = E.allCards();
          gsap.killTweensOf(all);
          gsap.killTweensOf(grid);
  
          const prevVisible = new Set(all.filter(E.isVisible));
          const beforeVisibleArr = Array.from(prevVisible);
          const startH = grid.getBoundingClientRect().height;
  
          mutatorFn();
  
          const nextList = E.filteredList();
          const keepArr = E.computeKeep(nextList, isLoadMore ? prevVisible : new Set());
          const { entering, staying } = E.apply(keepArr, isLoadMore ? prevVisible : new Set());
  
          // ✅ After display changes
          hookMediaRefresh();
          refreshLenis();
  
          if (entering.length) {
            gsap.set(entering, {
              opacity: 0,
              scale: 0.985,
              y: 10,
              overwrite: true
            });
          }
  
          const endH = grid.getBoundingClientRect().height;
          grid.style.height = startH + "px";
  
          const tl = gsap.timeline({
            onComplete: () => {
              grid.style.height = "";
              hookMediaRefresh();
              refreshLenis();
              E.setLocked(false);
              flushQueue();
            }
          });
  
          const leaving = isLoadMore ? [] : beforeVisibleArr.filter(el => !staying.includes(el) && !entering.includes(el));
  
          if (leaving.length > 0) {
            tl.to(leaving, {
              opacity: 0,
              scale: 0.985,
              duration: ANIM.fadeOut.duration,
              ease: ANIM.fadeOut.ease,
              stagger: {
                amount: ANIM.fadeOut.stagger * leaving.length,
                from: ANIM.fadeOut.from
              }
            }, 0);
          }
  
          tl.to(grid, {
            height: endH,
            duration: ANIM.height.duration,
            ease: ANIM.height.ease
          }, 0);
  
          if (ANIM.gridFx.enabled && (entering.length > 0 || leaving.length > 0)) {
            const blurDur = ANIM.height.duration;
            tl.fromTo(
              grid,
              { filter: "blur(0px) brightness(1)" },
              {
                duration: blurDur,
                keyframes: [
                  { 
                    filter: `blur(${ANIM.gridFx.blurPx}px) brightness(${ANIM.gridFx.brightness})`, 
                    duration: blurDur * 0.5, 
                    ease: ANIM.gridFx.ease 
                  },
                  { 
                    filter: "blur(0px) brightness(1)", 
                    duration: blurDur * 0.5, 
                    ease: ANIM.gridFx.ease 
                  },
                ],
                clearProps: "filter",
              },
              0
            );
          }
  
          if (entering.length > 0) {
            tl.to(entering, {
              opacity: 1,
              scale: 1,
              y: 0,
              duration: ANIM.fadeIn.duration,
              ease: ANIM.fadeIn.ease,
              stagger: {
                amount: ANIM.fadeIn.stagger * entering.length,
                from: ANIM.fadeIn.from
              },
              clearProps: "opacity,transform",
              overwrite: true
            }, ANIM.fadeIn.delay);
          }
        }
      };
  
      function flushQueue() {
        const q = E.takeQueue();
        if (!q) return;
  
        if (q.type === "filter") {
          Animator.runFade(() => {
            E.setFilter(q.payload);
            const r = radios.find(x => (x.value || "").trim().toLowerCase() === q.payload);
            if (r) r.checked = true;
            E.syncFilterActiveFromChecked();
          }, false);
          return;
        }
  
        if (q.type === "view") {
          Animator.runFlip(() => E.setView(q.payload));
          return;
        }
  
        if (q.type === "more") {
          Animator.runFade(() => E.addMore(), true);
        }
      }
  
      viewButtons.forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          const size = btn.getAttribute("data-size");
          if (!size) return;
  
          if (E.isLocked()) { 
            E.queueAction("view", size); 
            return; 
          }
  
          if (grid.getAttribute("data-size-grid") === size) return;
  
          Animator.runFlip(() => E.setView(size));
        });
      });
  
      document.addEventListener("change", (e) => {
        const t = e.target;
        if (!(t instanceof HTMLInputElement)) return;
        if (t.type !== "radio") return;
        if (t.getAttribute("data-filter-radio") !== "1") return;
  
        const val = (t.value || "").trim().toLowerCase() || "all";
  
        if (E.isLocked()) { 
          E.queueAction("filter", val); 
          return; 
        }
  
        if (!ANIM.scrollOnFilterChange.enabled) {
          Animator.runFade(() => {
            E.setFilter(val);
            E.syncFilterActiveFromChecked();
          }, false);
          return;
        }
  
        E.setFilter(val);
        const nextList = E.filteredList();
        const keepArr = E.computeKeep(nextList, new Set());
        const { entering } = E.apply(keepArr, new Set());
  
        hookMediaRefresh();
        refreshLenis();
  
        if (entering.length > 0) {
          gsap.set(entering, {
            opacity: 0,
            scale: 0.985,
            y: 10
          });
        }
  
        E.syncFilterActiveFromChecked();
  
        requestAnimationFrame(() => {
          const sectionEl = document.querySelector('.section_products');
          E.setLocked(true);
  
          if (sectionEl && typeof window._108ScrollTo === "function" && typeof window._108StickyOffset === "function") {
            window._108ScrollTo(sectionEl, {
              offset: window._108StickyOffset(),
              behavior: ANIM.scrollOnFilterChange.behavior,
              duration: 1.0
            });
          } else {
            const scrollTarget = sectionEl ? sectionEl.offsetTop + (ANIM.scrollOnFilterChange.offset || 0) : 0;
            window.scrollTo({
              top: Math.max(0, scrollTarget),
              behavior: ANIM.scrollOnFilterChange.behavior
            });
          }
  
          const baseTop = sectionEl ? sectionEl.offsetTop : window.scrollY;
          const scrollDistance = Math.abs(window.scrollY - baseTop);
          const scrollDuration = ANIM.scrollOnFilterChange.behavior === 'smooth'
            ? Math.min(800, scrollDistance * 0.5)
            : 0;
  
          setTimeout(() => {
            if (entering.length > 0) {
              gsap.to(entering, {
                opacity: 1,
                scale: 1,
                y: 0,
                duration: ANIM.fadeIn.duration,
                ease: ANIM.fadeIn.ease,
                stagger: {
                  amount: ANIM.fadeIn.stagger * entering.length,
                  from: ANIM.fadeIn.from
                },
                clearProps: "opacity,transform",
                onComplete: () => {
                  hookMediaRefresh();
                  refreshLenis();
                  E.setLocked(false);
                }
              });
            } else {
              hookMediaRefresh();
              refreshLenis();
              E.setLocked(false);
            }
          }, scrollDuration);
        });
      });
  
      if (loadMoreBtn) {
        loadMoreBtn.addEventListener("click", (e) => {
          e.preventDefault();
  
          if (E.isLocked()) { 
            E.queueAction("more", true); 
            return; 
          }
  
          Animator.runFade(() => E.addMore(), true);
  
          // ✅ extra safety: after click & after DOM updates
          hookMediaRefresh();
          refreshLenis();
          setTimeout(() => {
            hookMediaRefresh();
            refreshLenis();
          }, 120);
        });
      }
  
      window.BYQGrid.anim = ANIM;
  
      const initialSize = grid.getAttribute("data-size-grid");
      if (initialSize) {
        viewButtons.forEach(b => b.classList.remove("is-active"));
        const defaultBtn = viewButtons.find(b => b.getAttribute("data-size") === initialSize);
        if (defaultBtn) defaultBtn.classList.add("is-active");
      }
  
      console.log("[Grid] animator ready");
    }
  
    window.BYQGrid = window.BYQGrid || {};
    window.BYQGrid.initAnimator = initAnimator;
  
    document.readyState === "loading"
      ? document.addEventListener("DOMContentLoaded", initAnimator)
      : initAnimator();
  })();
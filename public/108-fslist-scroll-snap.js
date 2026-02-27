(() => {
  // ---- CONFIG
  const FILTERS = '.filters_wrapper';
  const STICKY_TOP = 80; // px (desktop)
  const LIST = '[fs-list-element="list"]';
  const LOAD_BTN = '.load-more-button'; // Twoja klasa na "Next" (Load more)


  // ---- helpers
  const scrollToFilters = () => {
    const el = document.querySelector(FILTERS);
    if (!el) return;
    lenis.scrollTo(el, {
      offset: -STICKY_TOP,
      duration: 0.7,
      easing: (t) => 1 - Math.pow(1 - t, 3)
    });
  };

  // Odśwież Lenisa po zmianie wysokości listy
  const refreshLenis = () => {
    try { lenis.resize(); } catch (e) {}
  };

  // ---- detect "user initiated" list change
  let shouldSnap = false;

  document.addEventListener('click', (e) => {
    // klik w filtr (radio/label) albo load more
    if (e.target.closest('.filter-button') || e.target.closest(LOAD_BTN)) {
      shouldSnap = true;
    }
  });

  // ---- watch FS lifecycle via class toggles
  const bindFsList = () => {
    const list = document.querySelector(LIST);
    if (!list) return;

    const mo = new MutationObserver(() => {
      const isLoading = list.classList.contains('is-list-loading');
      // gdy loading się skończy (FS już podmienił DOM)
      if (!isLoading) {
        // 1–2 klatki na layout
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            refreshLenis();
            if (shouldSnap) scrollToFilters();
            shouldSnap = false;
          });
        });
      }
    });

    mo.observe(list, { attributes: true, attributeFilter: ['class'] });
  };

  window.addEventListener('load', () => {
    refreshLenis();
    bindFsList();
  });
})();
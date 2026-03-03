/**
 * 108™ Supply — FS List: Scroll Snap + Lenis Refresh
 * Purpose:
 * - After Finsweet List updates (filter/pagination/load more), refresh Lenis height
 * - If the update was user-initiated (clicked filter/load-more), scroll back to filters section
 *
 * Requirements:
 * - Lenis available as `window.lenis`
 * - List element: [fs-list-element="list"]
 * - Filters wrapper selector matches FILTERS constant
 * - Load more button selector matches LOAD_BTN constant
 */

(() => {
  // ---- CONFIG
  const FILTERS = '.filters_wrapper';
  const STICKY_TOP = 80; // px (desktop)
  const LIST = '[fs-list-element="list"]';

  // FIX: accepts both the original and any renamed variant
  // Sprawdź w Webflow jaką klasę MA TERAZ Twój przycisk i upewnij się że jest tu
  const LOAD_BTN_SELECTORS = [
    '.load-more-button',
    '[fs-list-element="next"]',  // domyślny Finsweet selector
    '.w-pagination-next',        // Webflow pagination fallback
  ];

  // ---- helpers
  const getLenis = () => window.lenis ?? null;

  const scrollToFilters = () => {
    const lenis = getLenis();
    if (!lenis) return;
    const el = document.querySelector(FILTERS);
    if (!el) return;
    lenis.scrollTo(el, {
      offset: -STICKY_TOP,
      duration: 0.7,
      easing: (t) => 1 - Math.pow(1 - t, 3)
    });
  };

  // FIX: safe lenis.resize() — won't throw if lenis not ready yet
  const refreshLenis = () => {
    const lenis = getLenis();
    if (!lenis) return;
    try { lenis.resize(); } catch (e) {}
  };

  // ---- detect "user initiated" list change
  let shouldSnap = false;

  document.addEventListener('click', (e) => {
    const isLoadMore = LOAD_BTN_SELECTORS.some(sel => e.target.closest(sel));
    if (e.target.closest('.filter-button') || isLoadMore) {
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
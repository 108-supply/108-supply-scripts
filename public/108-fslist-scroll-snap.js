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
  const FILTERS = '.filters_wrapper';
  const STICKY_TOP = 80;
  const LIST_WRAP = '[fs-list-element="list"]'; // możesz zmienić na wrapper jeśli masz
  const LOAD_BTN_SELECTORS = [
    '.load-more-button',
    '[fs-list-element="next"]',
    '.w-pagination-next',
  ];

  const getLenis = () => window.lenis ?? null;

  const scrollToFilters = () => {
    const lenis = getLenis();
    const el = document.querySelector(FILTERS);
    if (!lenis || !el) return;
    lenis.scrollTo(el, {
      offset: -STICKY_TOP,
      duration: 0.7,
      easing: (t) => 1 - Math.pow(1 - t, 3),
    });
  };

  const refreshLenis = () => {
    const lenis = getLenis();
    if (!lenis) return;
    try { lenis.resize(); } catch (e) {}
  };

  let shouldSnap = false;

  document.addEventListener('click', (e) => {
    // jeśli klik to polar checkout, nie rób nic (żeby nie mieszać)
    if (e.target.closest('[data-polar-checkout]')) return;

    const isLoadMore = LOAD_BTN_SELECTORS.some(sel => e.target.closest(sel));
    if (e.target.closest('.filter-button') || isLoadMore) {
      shouldSnap = true;

      // “dogrywka” — bo media potrafią zmienić wysokość po chwili
      setTimeout(refreshLenis, 150);
      setTimeout(refreshLenis, 400);
    }
  });

  const bindResizeObserver = () => {
    const target = document.querySelector(LIST_WRAP) || document.body;
    if (!target || !('ResizeObserver' in window)) return;

    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        refreshLenis();
        if (shouldSnap) {
          scrollToFilters();
          shouldSnap = false;
        }
      });
    });

    ro.observe(target);
  };

  window.addEventListener('load', () => {
    refreshLenis();
    bindResizeObserver();
  });
})();
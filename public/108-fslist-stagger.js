/**
 * 108™ Supply — FS List: Stagger Variable Setter
 * Purpose:
 * - Assigns CSS variable `--stagger` to each list card that has `.is-list-starting`
 * - Enables clean staggered entry using CSS transition-delay in your cards CSS
 *
 * Requirements:
 * - List element: [fs-list-element="list"]
 * - Cards selector matches ITEM constant (default: .motion-template_card)
 * - Your CSS uses `transition-delay: calc(var(--stagger) * 1ms)` or similar
 */

(() => {
  const LIST = '[fs-list-element="list"]';
  const ITEM = '.motion-template_card';
  const STARTING = 'is-list-starting';
  const STEP_MS = 70; // tempo staggeru (np. 50–90)

  function applyStagger(){
    const list = document.querySelector(LIST);
    if (!list) return;

    const starting = list.querySelectorAll(`${ITEM}.${STARTING}`);
    starting.forEach((el, i) => {
      el.style.setProperty('--stagger', i * STEP_MS);
    });
  }

  // 1) na start
  window.addEventListener('load', applyStagger);

  // 2) na każde doładowanie / filtr (MutationObserver)
  const list = document.querySelector(LIST);
  if (!list) return;

  const mo = new MutationObserver(() => requestAnimationFrame(applyStagger));
  mo.observe(list, { childList: true, subtree: true });
})();
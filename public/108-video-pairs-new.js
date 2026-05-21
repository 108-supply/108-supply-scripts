/*!
 * 108™ Supply — Video Pairs (JS) · rev2 (Barba-ready)
 * Desktop: example + dark with hover swap. Touch: example only (dark removed).
 * Lazy via data-src. Autoplay via IntersectionObserver + force-play for in-view.
 * Reinit po przejściu Barby przez window.on108Page (fallback: load/pageshow).
 */
(() => {
  const PAIR = '[data-video-pair]';
  const LIST = '[fs-list-element="list"]';
  const CARD = '.motion-template_card';
  const OVL  = '.card_link_overlay';

  const IS_TOUCH = !matchMedia('(hover: hover) and (pointer: fine)').matches;
  document.documentElement.classList.toggle('is-touch', IS_TOUCH);

  const ex = p => p.querySelector('video[data-role="example"]');
  const dk = p => p.querySelector('video[data-role="dark"]');

  // Lazy: ustaw src z data-src raz. Zwraca true jeśli źródło istnieje.
  function load(v) {
    if (!v) return false;
    if (v.currentSrc || v.getAttribute('src')) return true;
    const ds = v.getAttribute('data-src');
    if (ds) { v.setAttribute('src', ds); return true; }
    return false;
  }
  const play  = v => { if (v) { const p = v.play(); if (p) p.catch(() => {}); } };
  const pause = v => { if (v) { try { v.pause(); } catch (_) {} } };

  const showExample = p => { p.classList.add('show-example'); p.classList.remove('show-dark'); };
  const showDark    = p => { p.classList.add('show-dark');    p.classList.remove('show-example'); };

  // --- autoplay observer
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const p = e.target;
      if (e.isIntersecting) { if (load(ex(p))) play(ex(p)); }
      else { pause(ex(p)); pause(dk(p)); }
    }
  }, { rootMargin: IS_TOUCH ? '120px 0px' : '200px 0px', threshold: 0.01 });

  // --- init pojedynczej pary (idempotentne)
  function initPair(p) {
    if (p.__108_inited) return;
    p.__108_inited = true;

    [ex(p), dk(p)].forEach(v => {
      if (!v) return;
      v.muted = true; v.loop = true; v.playsInline = true;
      v.setAttribute('playsinline', ''); v.preload = 'none';
    });

    if (IS_TOUCH) {
      const d = dk(p);
      if (d) { d.removeAttribute('src'); d.removeAttribute('data-src'); d.remove(); }
    }
    showExample(p);
    io.observe(p);
  }

  // --- PUBLIC: scan + force-play tego co już jest w viewporcie
  // (Barba podmienia DOM w trakcie animacji, więc IO bywa leniwy na górze strony)
  function refresh() {
    requestAnimationFrame(() => {
      document.querySelectorAll(PAIR).forEach(initPair);
      const vh = innerHeight;
      document.querySelectorAll(PAIR).forEach(p => {
        const r = p.getBoundingClientRect();
        if (r.top < vh && r.bottom > 0) { if (load(ex(p))) play(ex(p)); }
      });
    });
  }

  // --- hover swap (desktop), jedna para globalnych listenerów
  if (!IS_TOUCH) {
    let timer = null;
    document.addEventListener('mouseover', (e) => {
      const ovl = e.target.closest(OVL); if (!ovl) return;
      const p = ovl.closest(CARD)?.querySelector(PAIR); if (!p) return;
      timer = setTimeout(() => {
        const d = dk(p), x = ex(p);
        if (!d) return;
        if (load(d)) play(d);
        play(x);
        const align = () => { if (d.readyState >= 2) d.currentTime = x.currentTime; };
        if (!d.paused && d.readyState >= 2) align();
        else d.addEventListener('playing', function on() { d.removeEventListener('playing', on); align(); });
        showDark(p);
      }, 60);
    }, true);
    document.addEventListener('mouseout', (e) => {
      const ovl = e.target.closest(OVL); if (!ovl) return;
      clearTimeout(timer); timer = null;
      const p = ovl.closest(CARD)?.querySelector(PAIR);
      if (p) showExample(p);
    }, true);
  }

  // --- FS List re-render → rescan
  const list = document.querySelector(LIST);
  if (list) new MutationObserver(() => refresh()).observe(list, { childList: true, subtree: true });

  // --- lifecycle: pierwszy load + każda Barba przez on108Page; pageshow jako fallback
  addEventListener('pageshow', refresh);
  if (window.on108Page) window.on108Page(refresh);
  else addEventListener('load', refresh);
})();
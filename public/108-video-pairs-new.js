/*!
 * 108™ Supply — Video Pairs (JS) · rev5 (Barba-ready)
 * Desktop: example + dark with hover swap. Touch: example only (dark removed).
 * Lazy via data-src. Autoplay via IntersectionObserver + force-play for in-view.
 * Reinit po przejściu Barby przez window.on108Page (fallback: load/pageshow).
 *
 * rev5 — bez dziury w przejściu:
 *  - dark odsłaniany DOPIERO gdy realnie ruszy (ma pierwszą klatkę) → zero tła pod filmami
 *  - example wisi na wierzchu aż dark gotowy, dopiero wtedy showDark
 *  - fallback gdy dark już zbuforowany i 'playing' nie wystrzeli
 *  - szybsze przejście: skróć transition opacity w CSS (patrz nota na końcu)
 *
 * rev4 — hover bez card_link_overlay:
 *  - hover swap podpięty pod .template-card (CARD), overlay usunięty ze strony
 *
 * rev3 — naprawa hovera:
 *  - per-para stan hovera (koniec z kumulacją listenerów 'playing')
 *  - przy zejściu dark jest pauzowany (koniec z marnowaniem dekodera w tle)
 *  - twarda synchronizacja: dark dosuwany do example PRZED pokazaniem,
 *    plus jednorazowy re-sync gdy dark realnie ruszy
 */
(() => {
  const PAIR = '[data-video-pair]';
  const LIST = '[fs-list-element="list"]';
  const CARD = '.template-card';

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

  // --- autoplay observer (example w viewporcie gra, poza — pauza)
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const p = e.target;
      if (e.isIntersecting) { if (load(ex(p))) play(ex(p)); }
      else {
        pause(ex(p));
        pause(dk(p));            // dark też pauzujemy poza ekranem
        p.__hovering = false;    // reset stanu hovera gdy znika z viewportu
      }
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

  // === HOVER SWAP (desktop) — przepisane, per-para, bez kumulacji ===
  if (!IS_TOUCH) {

    // Wchodzi w stan "dark" dla danej pary. Idempotentne dzięki p.__hovering.
    function enterDark(p) {
      if (p.__hovering) return;     // już pokazujemy dark → nic nie rób
      p.__hovering = true;

      const x = ex(p), d = dk(p);
      if (!d || !x) return;

      // jednorazowo sprzątnij ewentualny stary listener z poprzedniego cyklu
      if (p.__syncHandler) { d.removeEventListener('playing', p.__syncHandler); p.__syncHandler = null; }

      load(d);

      // TWARDY SYNC: ustaw czas dark = example ZANIM zacznie grać
      try { d.currentTime = x.currentTime; } catch (_) {}

      play(x);  // example gra dalej (wciąż na wierzchu)
      play(d);  // dark startuje w tle, niewidoczny

      // NIE pokazujemy dark od razu — czekamy aż realnie ruszy (ma pierwszą klatkę),
      // dopiero wtedy gasimy example. Zero dziury z tłem.
      const reveal = () => {
        d.removeEventListener('playing', reveal);
        p.__syncHandler = null;
        if (!p.__hovering) return;            // mysz zjechała zanim dark wstał → nic nie rób
        try { d.currentTime = x.currentTime; } catch (_) {}  // ostatni dosyn
        showDark(p);                          // dopiero TERAZ przełącz: dark gotowy
      };
      p.__syncHandler = reveal;
      d.addEventListener('playing', reveal);

      // Fallback: gdy dark już zbuforowany i gra (powrót na hoverowaną już kartę),
      // 'playing' może nie wystrzelić — odsłoń natychmiast.
      if (d.readyState >= 3 && !d.paused) { reveal(); }
    }

    // Wychodzi ze stanu "dark". Pauzuje dark (oszczędza dekoder), sprząta listener.
    function leaveDark(p) {
      if (!p.__hovering) return;
      p.__hovering = false;

      const d = dk(p);
      if (d) {
        if (p.__syncHandler) { d.removeEventListener('playing', p.__syncHandler); p.__syncHandler = null; }
        pause(d);                   // dark nie gra w tle gdy niewidoczny
      }
      showExample(p);
    }

    let hoverTimer = null;
    let pendingPair = null;

    document.addEventListener('mouseover', (e) => {
      const card = e.target.closest(CARD); if (!card) return;
      const p = card.querySelector(PAIR); if (!p) return;

      // mały debounce — nie reagujemy na muśnięcia myszą
      pendingPair = p;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        if (pendingPair === p) enterDark(p);
      }, 60);
    }, true);

    document.addEventListener('mouseout', (e) => {
      const card = e.target.closest(CARD); if (!card) return;
      // ignoruj ruchy myszy wewnątrz tej samej karty (child → child)
      if (card.contains(e.relatedTarget)) return;
      const p = card.querySelector(PAIR); if (!p) return;

      // anuluj oczekujący enter jeśli zjechaliśmy zanim wystrzelił
      if (pendingPair === p) { clearTimeout(hoverTimer); pendingPair = null; }
      leaveDark(p);
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
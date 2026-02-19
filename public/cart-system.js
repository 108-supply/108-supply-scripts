(() => {
  if (window.__A108_CART_V10__) return;
  window.__A108_CART_V10__ = true;

  document.addEventListener('DOMContentLoaded', () => {
    const CFG = {
      OPEN_MS: 500,
      CLOSE_MS: 500,
      PANEL_X_PX: 24,
      BUTTON_FADE_MS: 300,
      DUST_MS: 1600,
      DUST_CROSSFADE_MS: 180,
      HOLD_AFTER_DUST: 80,
      FOOTER_FADE_DELAY_MS: 500,
      FOOTER_FADE_MS: 500,
      EMPTY_FADE_MS: 260,
      CONTENT_HEIGHT_MS: 520,
      CONTENT_HEIGHT_EASE: 'cubic-bezier(.2,.8,.2,1)',
      EMPTY_PIN_H_PX: 200,
      COLLAPSE_MS: 450,
      COLLAPSE_EASE: 'cubic-bezier(.2,.8,.2,1)',
      DUST_SPEED_X: 12,
      DUST_SPEED_Y: 8,
      PARTICLE_MULT: 1.7,
      MAX_PARTICLES: 6500,
      MIN_PARTICLES: 1800,
      DRAWER: '#cart-drawer',
      OVERLAY: '.cart-overlay',
      CONTENT: '.cart-content',
      WRAPPER: '#cart-items-wrapper',
      TEMPLATE: '#cart-item',
      EMPTY: '#cart-empty',
      FOOTER: '[data-cart-footer="true"], .cart-footer',
      TOTAL: '#cart-total-price',
      BADGE: '#cart-badge',
      CHECKOUT: '#checkout-btn',
      CART_BTN: '#cart-icon-btn',
      CART_TEXT: '#cart-text',
      CLOSE_TEXT: '#cart-close-text',
      REMOVE_BTN: '.cart-remove-btn, .remove-button',
      ITEM: '.cart-item-cloned',
      VARIANT_SELECT: '#variant-select',
      PRICE_DISPLAY: '#price-display',
      ADD_BTN: '#add-to-cart-btn',
      LS_KEY: 'webflow_cart',
    };

    const $ = (s, r=document) => r.querySelector(s);
    const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

    const drawer = $(CFG.DRAWER);
    const overlay = $(CFG.OVERLAY);
    const content = $(CFG.CONTENT);
    const wrapper = $(CFG.WRAPPER);
    const template = $(CFG.TEMPLATE);
    const emptyEl = $(CFG.EMPTY);
    const footerEl = $(CFG.FOOTER);
    const totalEl = $(CFG.TOTAL);
    const badgeEl = $(CFG.BADGE);
    const checkoutBtn = $(CFG.CHECKOUT);
    const cartBtn = $(CFG.CART_BTN);
    const cartText = $(CFG.CART_TEXT);
    const closeText = $(CFG.CLOSE_TEXT);

    if (!wrapper || !template) return;

    const templateHTML = template.outerHTML;
    template.style.display = 'none';

    let isOpen = false;
    let isRemoving = false;
    let renderLock = false;
    let isHeightPinnedEmpty = false;

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const isIOSSafari = isIOS && isSafari;

    const getCart = () => {
      try { return JSON.parse(localStorage.getItem(CFG.LS_KEY) || '[]'); }
      catch { return []; }
    };
    const setCart = (c) => localStorage.setItem(CFG.LS_KEY, JSON.stringify(c));
    const priceNum = (p) => parseFloat(String(p||'0').replace('$','')) || 0;

    function updateBadge() {
      if (badgeEl) badgeEl.textContent = getCart().length;
    }

    function updateTotal() {
      if (!totalEl) return;
      const total = getCart().reduce((a,it)=>a+priceNum(it.price),0);
      totalEl.textContent = '$' + total.toFixed(0);
    }

    function clearAnimations(el) {
      if (!el) return;
      try { el.getAnimations().forEach(a => a.cancel()); } catch {}
      el.style.opacity = '';
      el.style.transform = '';
    }

    function pinContentHeight(px) {
      if (!content) return;
      content.style.height = Math.max(0, px) + 'px';
      content.style.overflow = 'hidden';
      void content.offsetHeight;
    }

    function unpinContentHeight() {
      if (!content) return;
      content.style.height = '';
      content.style.overflow = '';
    }

    async function animateContentHeight(fromPx, toPx) {
      if (!content) return;
      const from = Math.max(0, fromPx);
      const to = Math.max(0, toPx);
      pinContentHeight(from);
      await new Promise(res => {
        const a = content.animate(
          [{ height: from + 'px' }, { height: to + 'px' }],
          { duration: CFG.CONTENT_HEIGHT_MS, easing: CFG.CONTENT_HEIGHT_EASE }
        );
        a.onfinish = () => res();
      });
      pinContentHeight(to);
    }

    function setButtonUI(open, animate = true) {
      const dur = CFG.BUTTON_FADE_MS;
      clearAnimations(cartText);
      clearAnimations(badgeEl);
      clearAnimations(closeText);

      if (!animate) {
        if (cartText) cartText.style.display = open ? 'none' : 'inline';
        if (badgeEl) badgeEl.style.display = open ? 'none' : 'inline';
        if (closeText) closeText.style.display = open ? 'inline' : 'none';
        return;
      }

      if (open) {
        if (cartText) cartText.style.display = 'none';
        if (badgeEl) badgeEl.style.display = 'none';
        if (closeText) {
          closeText.style.display = 'inline';
          closeText.style.opacity = '0';
          const a = closeText.animate([{opacity:0},{opacity:1}], {duration:dur});
          a.onfinish = () => { closeText.style.opacity = ''; };
        }
      } else {
        if (closeText) closeText.style.display = 'none';
        if (cartText) {
          cartText.style.display = 'inline';
          cartText.style.opacity = '0';
          const a = cartText.animate([{opacity:0},{opacity:1}], {duration:dur});
          a.onfinish = () => { cartText.style.opacity = ''; };
        }
        if (badgeEl) {
          badgeEl.style.display = 'inline';
          badgeEl.style.opacity = '0';
          const a = badgeEl.animate([{opacity:0},{opacity:1}], {duration:dur});
          a.onfinish = () => { badgeEl.style.opacity = ''; };
        }
      }
    }

    async function showDrawer() {
      if (isOpen) return;
      isOpen = true;
      
      if (drawer) drawer.style.display = 'block';
      clearAnimations(overlay);
      clearAnimations(content);
      
      if (overlay) { overlay.style.display = 'block'; overlay.style.opacity = '0'; }
      if (content) { content.style.opacity = '0'; content.style.transform = `translateX(${CFG.PANEL_X_PX}px)`; }
      
      setButtonUI(true, true);
      
      // RESET TO CART VIEW
      const container = $('#checkout-container');
      const backBtn = $('#checkout-back-btn');
      
      if (container) container.style.display = 'none';
      if (backBtn) backBtn.style.display = 'none';
      
      await renderCart();
      
      if (overlay) {
        const a = overlay.animate([{opacity:0},{opacity:1}], {
          duration: CFG.OPEN_MS, easing: 'cubic-bezier(.2,.8,.2,1)'
        });
        a.onfinish = () => { overlay.style.opacity = '1'; };
      }
      
      if (content) {
        await new Promise(res => {
          const a = content.animate(
            [{transform:`translateX(${CFG.PANEL_X_PX}px)`, opacity:0},{transform:'translateX(0px)', opacity:1}],
            {duration: CFG.OPEN_MS, easing: 'cubic-bezier(.2,.8,.2,1)'}
          );
          a.onfinish = () => { content.style.opacity = '1'; content.style.transform = 'translateX(0px)'; res(); };
        });
      }
    }

    async function hideDrawer() {
      if (!isOpen) return;
      isOpen = false;
      
      // RESET CHECKOUT STATE
      const container = $('#checkout-container');
      const backBtn = $('#checkout-back-btn');
      
      if (container && container.style.display !== 'none') {
        try {
          if (window.Paddle && window.Paddle.Checkout) {
            window.Paddle.Checkout.close();
          }
        } catch {}
        
        if (container) container.style.display = 'none';
        if (backBtn) backBtn.style.display = 'none';
      }
      
      setButtonUI(false, true);
      clearAnimations(overlay);
      clearAnimations(content);
      
      if (overlay) {
        const a = overlay.animate([{opacity:1},{opacity:0}], {
          duration: CFG.CLOSE_MS, easing: 'cubic-bezier(.2,.8,.2,1)'
        });
        a.onfinish = () => { overlay.style.opacity = '0'; overlay.style.display = 'none'; };
      }
      
      if (content) {
        await new Promise(res => {
          const a = content.animate(
            [{transform:'translateX(0px)', opacity:1},{transform:`translateX(${CFG.PANEL_X_PX}px)`, opacity:0}],
            {duration: CFG.CLOSE_MS, easing: 'cubic-bezier(.2,.8,.2,1)'}
          );
          a.onfinish = () => { 
            content.style.opacity = '0'; 
            content.style.transform = `translateX(${CFG.PANEL_X_PX}px)`; 
            res(); 
          };
        });
      }
      
      if (drawer) drawer.style.display = 'none';
    }

    function setEmptyState(isEmpty) {
      clearAnimations(footerEl);
      clearAnimations(emptyEl);
      if (isEmpty) {
        if (footerEl) footerEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'block';
        if (checkoutBtn) checkoutBtn.disabled = true;
      } else {
        if (emptyEl) emptyEl.style.display = 'none';
        if (footerEl) footerEl.style.display = 'flex';
        if (checkoutBtn) checkoutBtn.disabled = false;
      }
    }

    async function fadeOutFooter() {
      const delay = CFG.FOOTER_FADE_DELAY_MS;
      const dur = CFG.FOOTER_FADE_MS;
      if (!footerEl || footerEl.style.display === 'none') return;
      clearAnimations(footerEl);
      await new Promise(res => {
        const start = () => {
          const a = footerEl.animate([{opacity:1},{opacity:0}], {
            duration: dur,
            easing: 'cubic-bezier(.2,.8,.2,1)'
          });
          a.onfinish = () => {
            footerEl.style.display = 'none';
            footerEl.style.opacity = '';
            res();
          };
        };
        if (delay > 0) setTimeout(start, delay);
        else start();
      });
    }

    async function fadeInEmpty() {
      if (!emptyEl) return;
      clearAnimations(emptyEl);
      emptyEl.style.display = 'block';
      emptyEl.style.opacity = '0';
      await new Promise(res => {
        const a = emptyEl.animate([{opacity:0},{opacity:1}], {
          duration: CFG.EMPTY_FADE_MS,
          easing: 'cubic-bezier(.2,.8,.2,1)'
        });
        a.onfinish = () => { emptyEl.style.opacity = ''; res(); };
      });
      if (checkoutBtn) checkoutBtn.disabled = true;
    }

    function buildClone() {
      const tmp = document.createElement('div');
      tmp.innerHTML = templateHTML;
      return tmp.firstElementChild;
    }

    async function maybeAnimateFromPinnedToAuto() {
      if (!content || !isHeightPinnedEmpty || !isOpen) return;
      const from = CFG.EMPTY_PIN_H_PX;
      const target = Math.max(content.scrollHeight, CFG.EMPTY_PIN_H_PX);
      if (Math.abs(target - from) < 2) {
        isHeightPinnedEmpty = false;
        unpinContentHeight();
        return;
      }
      await animateContentHeight(from, target);
      isHeightPinnedEmpty = false;
      requestAnimationFrame(() => { unpinContentHeight(); });
    }

    async function renderCart() {
      if (renderLock || isRemoving) return;
      renderLock = true;
      try {
        const cart = getCart();
        wrapper.innerHTML = '';
        if (cart.length === 0) {
          wrapper.style.display = 'none';
          if (totalEl) totalEl.textContent = '$0';
          updateBadge();
          setEmptyState(true);
          if (content) {
            isHeightPinnedEmpty = true;
            pinContentHeight(CFG.EMPTY_PIN_H_PX);
          }
          return;
        }
        wrapper.style.display = 'flex';
        setEmptyState(false);
        cart.forEach((item, index) => {
          const clone = buildClone();
          if (!clone) return;
          clone.removeAttribute('id');
          clone.classList.add('cart-item-cloned');
          clone.style.display = 'flex';
          const img = clone.querySelector('.cart-item_media img');
          if (img && item.poster) { img.src = item.poster; img.alt = item.name || 'Product'; }
          const cat = clone.querySelector('.cart-item_category');
          if (cat) cat.textContent = item.category || 'PRODUCT';
          const title = clone.querySelector('.cart-item_title');
          if (title) title.textContent = item.name || 'Product';
          const url = item.url || '#';
          clone.querySelectorAll('a.cart-item_media, a.cart-item_title').forEach(a => {
            a.href = url;
          });
          const v = clone.querySelector('.cart-item_variant');
          if (v) v.textContent = item.variant ? (item.variant.charAt(0).toUpperCase() + item.variant.slice(1) + ' License') : 'License';
          const p = clone.querySelector('.cart-item_price');
          if (p) p.textContent = item.price || '$0';
          const btn = clone.querySelector('.remove-button');
          if (btn) { btn.classList.add('cart-remove-btn'); btn.setAttribute('data-index', index); }
          wrapper.appendChild(clone);
        });
        updateBadge();
        updateTotal();
      } finally {
        renderLock = false;
      }
      await maybeAnimateFromPinnedToAuto();
    }

    const easeInOut = (t) => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2;

    async function dust(el) {
      const rect = el.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;pointer-events:none;z-index:999999;`;
      document.body.appendChild(canvas);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      let shot;
      try {
        shot = await html2canvas(el, { backgroundColor: null, scale: dpr, useCORS: true, allowTaint: false, logging: false });
      } catch (e) {
        try {
          const a = el.animate([{opacity:1},{opacity:0}], {duration: 220, easing:'cubic-bezier(.2,.8,.2,1)'});
          await new Promise(r => { a.onfinish = r; });
        } catch {}
        canvas.remove();
        return;
      }
      ctx.drawImage(shot, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = img.data;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const area = canvas.width * canvas.height;
      const mult = isIOSSafari ? Math.min(1.2, CFG.PARTICLE_MULT) : CFG.PARTICLE_MULT;
      const maxP = isIOSSafari ? Math.min(2800, CFG.MAX_PARTICLES) : CFG.MAX_PARTICLES;
      const minP = isIOSSafari ? Math.min(900, CFG.MIN_PARTICLES) : CFG.MIN_PARTICLES;
      const count = Math.min(maxP, Math.floor(Math.max(minP, area / 760) * mult));
      const parts = [];
      for (let i = 0, tries = 0; i < count && tries < count * 8; tries++) {
        const x = (Math.random() * canvas.width) | 0;
        const y = (Math.random() * canvas.height) | 0;
        const idx = (y * canvas.width + x) * 4;
        if (data[idx + 3] < 50) continue;
        const r = data[idx], g = data[idx+1], b = data[idx+2];
        const dir = 0.9 + Math.random() * 1.6;
        const twist = (Math.random() - 0.5) * 1.1;
        parts.push({
          ox: x, oy: y,
          vx: (1.2 + Math.random() * 2.6 + twist) * dir * dpr,
          vy: (-0.1 + Math.random() * 2.1) * dir * dpr,
          size: (Math.random() < 0.84 ? 1 : 2) * dpr,
          color: `rgb(${r},${g},${b})`,
          streak: Math.random() < 0.26,
          streakLen: (8 + Math.random() * 16) * dpr
        });
        i++;
      }
      const crossDur = Math.max(1, CFG.DUST_CROSSFADE_MS || 180);
      el.style.opacity = '1';
      try {
        const a = el.animate([{opacity:1},{opacity:0}], {duration: crossDur, easing:'cubic-bezier(.2,.8,.2,1)'});
        a.onfinish = () => { el.style.visibility = 'hidden'; };
      } catch {
        setTimeout(() => { el.style.visibility = 'hidden'; }, crossDur);
      }
      const start = performance.now();
      function frame(now) {
        const tNorm = Math.min(1, (now - start) / CFG.DUST_MS);
        const k = easeInOut(tNorm);
        const fadeIn = Math.min(1, (now - start) / crossDur);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const p of parts) {
          const scatter = (k * k) * 26 * dpr;
          const dx = p.vx * (k * CFG.DUST_SPEED_X) + (Math.random() - 0.5) * scatter;
          const dy = p.vy * (k * CFG.DUST_SPEED_Y) + (Math.random() - 0.5) * scatter;
          const x = p.ox + dx;
          const y = p.oy + dy;
          const alphaBase = Math.max(0, 1 - k * 1.1);
          const alpha = alphaBase * fadeIn;
          ctx.globalAlpha = alpha;
          ctx.fillStyle = p.color;
          if (p.streak) {
            const angle = Math.atan2(p.vy, p.vx);
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            ctx.globalAlpha = alpha * 0.55;
            ctx.fillRect(0, 0, p.streakLen * (0.2 + k), Math.max(1, p.size));
            ctx.restore();
            ctx.globalAlpha = alpha;
          }
          ctx.fillRect(x, y, p.size, p.size);
        }
        ctx.globalAlpha = 1;
        if (tNorm < 1) requestAnimationFrame(frame);
        else canvas.remove();
      }
      requestAnimationFrame(frame);
      await new Promise(r => setTimeout(r, CFG.DUST_MS));
      el.style.visibility = 'hidden';
    }

    async function collapseWithFLIP(el) {
      if (!wrapper) { el.remove(); return; }
      const siblings = $$(CFG.ITEM, wrapper).filter(item => item !== el);
      const siblingRects = siblings.map(s => ({ el: s, rect: s.getBoundingClientRect() }));
      const footerRect = footerEl ? footerEl.getBoundingClientRect() : null;
      el.style.position = 'absolute';
      el.style.width = el.offsetWidth + 'px';
      el.style.left = '0';
      el.style.top = el.offsetTop + 'px';
      el.style.margin = '0';
      el.style.visibility = 'hidden';
      el.style.pointerEvents = 'none';
      const siblingRectsAfter = siblings.map(s => s.getBoundingClientRect());
      const footerRectAfter = footerEl ? footerEl.getBoundingClientRect() : null;
      siblings.forEach((s, i) => {
        const oldRect = siblingRects[i].rect;
        const newRect = siblingRectsAfter[i];
        const dy = oldRect.top - newRect.top;
        if (Math.abs(dy) > 0.5) {
          s.style.transform = `translateY(${dy}px)`;
          const a = s.animate(
            [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0px)' }],
            { duration: CFG.COLLAPSE_MS, easing: CFG.COLLAPSE_EASE }
          );
          a.onfinish = () => { s.style.transform = ''; };
        }
      });
      if (footerEl && footerRect && footerRectAfter) {
        const dy = footerRect.top - footerRectAfter.top;
        if (Math.abs(dy) > 0.5) {
          footerEl.style.transform = `translateY(${dy}px)`;
          const a = footerEl.animate(
            [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0px)' }],
            { duration: CFG.COLLAPSE_MS, easing: CFG.COLLAPSE_EASE }
          );
          a.onfinish = () => { footerEl.style.transform = ''; };
        }
      }
      await new Promise(r => setTimeout(r, CFG.COLLAPSE_MS));
      el.remove();
    }

    async function removeFlow(btn) {
      if (isRemoving) return;
      isRemoving = true;
      try {
        const itemEl = btn.closest(CFG.ITEM);
        if (!itemEl) return;
        const index = parseInt(btn.getAttribute('data-index'), 10);
        if (Number.isNaN(index)) return;
        const cart = getCart();
        cart.splice(index, 1);
        setCart(cart);
        updateTotal();
        const isNowEmpty = cart.length === 0;
        if (isNowEmpty) {
          const startH = content ? content.getBoundingClientRect().height : CFG.EMPTY_PIN_H_PX;
          if (emptyEl) { emptyEl.style.display = 'block'; emptyEl.style.opacity = '0'; }
          pinContentHeight(Math.max(startH, CFG.EMPTY_PIN_H_PX));
          const dustP = dust(itemEl);
          const footerP = fadeOutFooter();
          await Promise.all([footerP, dustP]);
          if (CFG.HOLD_AFTER_DUST) await new Promise(r => setTimeout(r, CFG.HOLD_AFTER_DUST));
          itemEl.remove();
          wrapper.style.display = 'none';
          if (footerEl) footerEl.style.display = 'none';
          updateBadge();
          await animateContentHeight(Math.max(startH, CFG.EMPTY_PIN_H_PX), CFG.EMPTY_PIN_H_PX);
          await fadeInEmpty();
          isHeightPinnedEmpty = true;
          pinContentHeight(CFG.EMPTY_PIN_H_PX);
        } else {
          await dust(itemEl);
          if (CFG.HOLD_AFTER_DUST) await new Promise(r => setTimeout(r, CFG.HOLD_AFTER_DUST));
          await collapseWithFLIP(itemEl);
          $$(CFG.ITEM, wrapper).forEach((el, i) => {
            const b = el.querySelector('.remove-button');
            if (b) b.setAttribute('data-index', i);
          });
          updateBadge();
        }
        window.dispatchEvent(new Event('cartUpdated'));
      } finally {
        setTimeout(() => { isRemoving = false; }, 120);
      }
    }

    if (cartBtn) {
      cartBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isOpen) await hideDrawer();
        else await showDrawer();
      });
    }

    if (overlay) {
      overlay.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isOpen) await hideDrawer();
      });
    }

    const handleRemoveIntent = (e) => {
      if (!isOpen) return;
      const target = e.target;
      if (!target || !target.closest) return;
      const btn = target.closest(CFG.REMOVE_BTN);
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      try { btn.blur && btn.blur(); } catch {}
      removeFlow(btn);
    };

    document.addEventListener('pointerdown', handleRemoveIntent, true);
    document.addEventListener('touchstart', handleRemoveIntent, { capture: true, passive: false });

    window.addEventListener('storage', (e) => {
      if (e.key === CFG.LS_KEY && !isRemoving) {
        updateBadge();
        updateTotal();
        if (isOpen) renderCart();
      }
    });

    window.addEventListener('cartUpdated', () => {
      updateBadge();
      updateTotal();
      if (!isOpen) showDrawer();
      else if (!isRemoving) renderCart();
    });

    if (window.productData) {
      const variantSelect = $(CFG.VARIANT_SELECT);
      const priceDisplay = $(CFG.PRICE_DISPLAY);
      const addBtn = $(CFG.ADD_BTN);
      if (variantSelect && priceDisplay && addBtn) {
        function updateVariant() {
          const variant = variantSelect.value;
          const price = window.productData.prices[variant];
          const paddleId = window.productData.paddleIds[variant];
          priceDisplay.textContent = price;
          addBtn.dataset.productName = window.productData.name;
          addBtn.dataset.productPoster = window.productData.poster;
          addBtn.dataset.productCategory = window.productData.category;
          addBtn.dataset.price = price;
          addBtn.dataset.paddleId = paddleId;
          addBtn.dataset.variant = variant;
          checkIfInCart();
        }
        function checkIfInCart() {
          const cart = getCart();
          const name = addBtn.dataset.productName;
          const variant = addBtn.dataset.variant;
          const inCart = cart.some(item => item.name === name && item.variant === variant);
          const textEl = addBtn.querySelector('.button-108_text');
          if (inCart) {
            if (textEl) textEl.textContent = 'Already in Cart';
            addBtn.style.pointerEvents = 'none';
            addBtn.style.opacity = '0.6';
          } else {
            if (textEl) textEl.textContent = 'Add to Cart';
            addBtn.style.pointerEvents = 'auto';
            addBtn.style.opacity = '1';
          }
        }
        updateVariant();
        variantSelect.addEventListener('change', updateVariant);
        addBtn.addEventListener('click', (e) => {
          e.preventDefault();
          if (addBtn.style.pointerEvents === 'none') return;
          const cart = getCart();
          cart.push({
            name: addBtn.dataset.productName,
            poster: addBtn.dataset.productPoster || '',
            category: addBtn.dataset.productCategory,
            price: addBtn.dataset.price,
            priceId: addBtn.dataset.paddleId,
            variant: addBtn.dataset.variant,
            url: window.location.pathname
          });
          setCart(cart);
          window.dispatchEvent(new Event('cartUpdated'));
        });
        window.addEventListener('cartUpdated', checkIfInCart);
      }
    }

    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', () => {
        const cart = getCart();
        if (cart.length === 0) return alert('Your cart is empty!');
        if (typeof window.__A108_CHECKOUT_HANDLER__ === 'function') {
          window.__A108_CHECKOUT_HANDLER__(cart);
        } else {
          console.warn('No checkout handler.');
        }
      });
    }

    updateBadge();
    updateTotal();
    setEmptyState(getCart().length === 0);
    if (getCart().length === 0 && content) {
      isHeightPinnedEmpty = true;
      pinContentHeight(CFG.EMPTY_PIN_H_PX);
    }
    if (drawer) drawer.style.display = 'none';
    if (overlay) { overlay.style.display = 'none'; overlay.style.opacity = '0'; }
    if (content) { content.style.opacity = '0'; content.style.transform = `translateX(${CFG.PANEL_X_PX}px)`; }
    setButtonUI(false, false);
  });
})();

// ===================================
// CHECKOUT HANDLER
// ===================================
window.__A108_CHECKOUT_HANDLER__ = function(cart) {
  console.log('🛒 Opening Checkout');

  if (!window.Paddle) {
    alert('Paddle not loaded!');
    return;
  }

  const items = cart.map(item => ({
    priceId: item.priceId,
    quantity: 1
  }));

  // GET ELEMENTS
  const content = document.querySelector('.cart-content');
  const wrapper = document.getElementById('cart-items-wrapper');
  const footer = document.querySelector('.cart-footer');
  const emptyEl = document.getElementById('cart-empty');
  const container = document.getElementById('checkout-container');
  const backBtn = document.getElementById('checkout-back-btn');

  if (!container || !backBtn) {
    alert('Missing elements!');
    return;
  }

  const CHECKOUT_MIN_H = 650;
  const CHECKOUT_SAFE_PAD_PX = 48; // compliance bar (~38px) + buffer
  const CONTENT_MS = 520;
  const CONTENT_EASE = 'cubic-bezier(.2,.8,.2,1)';
  const FADE_MS = 180;
  let checkoutResizeObserver = null;
  let checkoutPollTimer = null;
  let checkoutSettleTimer = null;
  let isAdjusting = false;

  // Helper: same pattern as animateContentHeight() from removeFlow
  async function animateContentHeight(fromPx, toPx) {
    if (!content) return;
    const from = Math.max(0, fromPx);
    const to = Math.max(0, toPx);
    content.style.height = from + 'px';
    content.style.overflow = 'hidden';
    void content.offsetHeight;
    await new Promise(res => {
      const a = content.animate(
        [{ height: from + 'px' }, { height: to + 'px' }],
        { duration: CONTENT_MS, easing: CONTENT_EASE }
      );
      a.onfinish = () => res();
    });
    content.style.height = to + 'px';
  }

  function getIframeEl() {
    try { return container.querySelector('iframe'); } catch { return null; }
  }

  function normalizeCheckoutIframeStyles() {
    const iframe = getIframeEl();
    if (!iframe) return;
    // Paddle may inject very high z-index / fixed positioning.
    // We want the iframe to stay in normal flow (so container height works)
    // and to have a sensible explicit height (so it can't collapse to ~150px).
    const rectH = Math.ceil(iframe.getBoundingClientRect().height || 0);
    const styleH = Math.ceil(parseFloat(iframe.style.height || '0') || 0);
    const desiredH = Math.max(600, rectH, styleH);

    try { iframe.style.zIndex = '0'; } catch {}
    try { iframe.style.position = 'relative'; } catch {}
    try { iframe.style.top = '0px'; iframe.style.left = '0px'; } catch {}
    try { iframe.style.display = 'block'; } catch {}
    try { iframe.style.width = '100%'; } catch {}
    try { iframe.style.minHeight = desiredH + 'px'; } catch {}
    try { iframe.style.height = desiredH + 'px'; } catch {}

    // Keep wrapper tall as well, so layout/scrollHeight reflects checkout size
    try { container.style.minHeight = desiredH + 'px'; } catch {}
  }

  function getCheckoutViewHeight() {
    if (!backBtn || !container) return CHECKOUT_MIN_H;
    const backH = Math.ceil(backBtn.getBoundingClientRect().height || 0);
    const iframe = getIframeEl();
    const iframeH = iframe ? Math.ceil(iframe.getBoundingClientRect().height || 0) : 0;
    const containerH = Math.ceil(container.getBoundingClientRect().height || 0);
    const containerScrollH = Math.ceil(container.scrollHeight || 0);
    const innerH = Math.max(iframeH, containerH, containerScrollH, CHECKOUT_MIN_H);
    return Math.max(CHECKOUT_MIN_H, backH + innerH + CHECKOUT_SAFE_PAD_PX);
  }

  async function adjustToCheckoutHeight() {
    if (!content || !backBtn || !container) return;
    if (container.style.display === 'none') return;
    if (isAdjusting) return;
    isAdjusting = true;
    try {
      normalizeCheckoutIframeStyles();
      const measuredH = getCheckoutViewHeight();
      const currentH = content.getBoundingClientRect().height || 0;
      // Only EXPAND, never shrink - iframe measurement can be wrong during load
      const targetH = Math.max(measuredH, currentH, 600);
      if (targetH > 0 && targetH > currentH && Math.abs(targetH - currentH) > 2) {
        await animateContentHeight(currentH, targetH);
      }
      content.style.overflow = 'auto';
      // Do NOT unpin height - keep it so checkout stays visible
    } finally {
      isAdjusting = false;
    }
  }

  // STORE current height for animation
  const startH = content ? content.getBoundingClientRect().height : 0;

  // HIDE cart, SHOW checkout
  if (wrapper) wrapper.style.display = 'none';
  if (footer) footer.style.display = 'none';
  if (emptyEl) emptyEl.style.display = 'none';

  container.style.display = 'block';
  backBtn.style.display = 'block';

  // Ensure back button is ABOVE checkout iframe: first in DOM + higher z-index
  if (content && backBtn.parentNode === content && container.parentNode === content) {
    content.insertBefore(backBtn, container);
  }
  // Back button must stay clickable above Paddle iframe - do NOT touch content position (breaks Webflow layout)
  container.style.position = 'relative';
  container.style.zIndex = '0';
  backBtn.style.position = 'relative';
  backBtn.style.zIndex = '2147483647';
  backBtn.style.pointerEvents = 'auto';

  // Initial height animation - use fixed 650px; ResizeObserver can only expand, never shrink
  const runHeightAnimation = async () => {
    if (!content || startH <= 0) return;
    const safeMin = Math.max(CHECKOUT_MIN_H, Math.ceil(backBtn.getBoundingClientRect().height || 0) + 550);
    await animateContentHeight(startH, safeMin);
    content.style.overflow = 'auto';

    // ResizeObserver: respond to container/iframe size changes
    checkoutResizeObserver = new ResizeObserver(() => {
      if (checkoutSettleTimer) clearTimeout(checkoutSettleTimer);
      checkoutSettleTimer = setTimeout(() => {
        adjustToCheckoutHeight();
      }, 30);
    });
    checkoutResizeObserver.observe(container);

    // Poll until iframe appears (Paddle injects async), then do precise adjust
    const startedAt = Date.now();
    const poll = () => {
      if (!container || container.style.display === 'none') return;
      const iframe = getIframeEl();
      if (iframe) {
        normalizeCheckoutIframeStyles();
        adjustToCheckoutHeight();
        return;
      }
      if (Date.now() - startedAt < 4000) {
        checkoutPollTimer = setTimeout(poll, 80);
      }
    };
    poll();
  };
  runHeightAnimation();

  // BACK BUTTON
  backBtn.onclick = async function(e) {
    e.preventDefault();
    console.log('Back button clicked');

    if (checkoutResizeObserver) {
      checkoutResizeObserver.disconnect();
      checkoutResizeObserver = null;
    }
    if (checkoutPollTimer) {
      clearTimeout(checkoutPollTimer);
      checkoutPollTimer = null;
    }
    if (checkoutSettleTimer) {
      clearTimeout(checkoutSettleTimer);
      checkoutSettleTimer = null;
    }

    const fromH = content ? content.getBoundingClientRect().height : 0;

    const fadeOut = (el) => {
      if (!el) return Promise.resolve();
      try {
        const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'cubic-bezier(.2,.8,.2,1)' });
        return new Promise(r => { a.onfinish = r; });
      } catch { return Promise.resolve(); }
    };
    const fadeIn = (el) => {
      if (!el) return Promise.resolve();
      try {
        const a = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'cubic-bezier(.2,.8,.2,1)' });
        return new Promise(r => { a.onfinish = () => { el.style.opacity = ''; r(); }; });
      } catch { el.style.opacity = ''; return Promise.resolve(); }
    };

    // Fade out checkout UI first (prevents a flash/jump)
    await Promise.all([fadeOut(container), fadeOut(backBtn)]);

    // Close Paddle
    try { window.Paddle.Checkout.close(); } catch (err) { console.log('Paddle close error:', err); }

    // Hide checkout
    container.style.display = 'none';
    backBtn.style.display = 'none';
    container.style.opacity = '';
    backBtn.style.opacity = '';

    // SHOW cart
    const cartData = JSON.parse(localStorage.getItem('webflow_cart') || '[]');
    const toShow = [];
    if (cartData.length === 0) {
      if (emptyEl) { emptyEl.style.display = 'block'; emptyEl.style.opacity = '0'; toShow.push(emptyEl); }
    } else {
      if (wrapper) { wrapper.style.display = 'flex'; wrapper.style.opacity = '0'; toShow.push(wrapper); }
      if (footer) { footer.style.display = 'flex'; footer.style.opacity = '0'; toShow.push(footer); }
    }

    // Wait for layout & Paddle iframe to clear before measuring
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => requestAnimationFrame(r));

    // Animate back to cart height, then fully reset
    if (content && fromH > 0) {
      const toH = content.scrollHeight;
      content.style.height = fromH + 'px';
      content.style.overflow = 'hidden';
      void content.offsetHeight;
      await new Promise(res => {
        const a = content.animate(
          [{ height: fromH + 'px' }, { height: toH + 'px' }],
          { duration: CONTENT_MS, easing: CONTENT_EASE }
        );
        a.onfinish = () => res();
      });
    }
    if (content) {
      content.style.height = '';
      content.style.overflow = '';
    }

    // Fade in cart UI after height settles
    await Promise.all(toShow.map(fadeIn));
  };

  // OPEN PADDLE - frameInitialHeight so iframe has proper initial size
  const isDarkMode = !document.body.classList.contains('is-base');

  Paddle.Checkout.open({
    items: items,
    settings: {
      displayMode: 'inline',
      frameTarget: 'checkout-container',
      frameInitialHeight: '600',
      frameStyle: 'width: 100%; min-width: 312px; background-color: transparent; border: none;',
      variant: 'one-page',
      theme: isDarkMode ? 'dark' : 'light',
      locale: 'en'
    }
  });

  console.log('✅ Paddle opened');
};

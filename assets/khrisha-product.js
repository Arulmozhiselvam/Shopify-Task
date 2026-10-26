/*
  Khrisha product pages: gallery, variant cards, quantity, AJAX cart,
  product cards and product recommendations.
  Shared helpers are exposed on window.Khrisha for khrisha-discovery.js.
*/
(() => {
  if (window.Khrisha) return;

  const root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';

  function formatMoney(cents, format) {
    const value = typeof cents === 'string' ? parseInt(cents.replace('.', ''), 10) : cents;
    const fmt = format || '${{amount}}';
    const delimit = (number, precision, thousands = ',', decimal = '.') => {
      if (Number.isNaN(number) || number == null) return '0';
      const [whole, fraction] = (number / 100).toFixed(precision).split('.');
      const withThousands = whole.replace(/(\d)(?=(\d{3})+(?!\d))/g, `$1${thousands}`);
      return fraction ? withThousands + decimal + fraction : withThousands;
    };
    return fmt.replace(/\{\{\s*(\w+)\s*\}\}/, (_, key) => {
      switch (key) {
        case 'amount_no_decimals': return delimit(value, 0);
        case 'amount_with_comma_separator': return delimit(value, 2, '.', ',');
        case 'amount_no_decimals_with_comma_separator': return delimit(value, 0, '.', ',');
        case 'amount_with_apostrophe_separator': return delimit(value, 2, "'", '.');
        default: return delimit(value, 2);
      }
    });
  }

  /* ---------- Cart ---------- */

  // Adds items to the cart and refreshes Dawn's cart drawer / notification / bubble.
  async function addToCart(body) {
    const cartUI = document.querySelector('cart-drawer') || document.querySelector('cart-notification');
    const payload = body instanceof FormData ? body : toFormData(body);
    if (cartUI && typeof cartUI.getSectionsToRender === 'function') {
      payload.append('sections', cartUI.getSectionsToRender().map((s) => s.id).join(','));
      payload.append('sections_url', window.location.pathname);
      if (typeof cartUI.setActiveElement === 'function') cartUI.setActiveElement(document.activeElement);
    }

    const response = await fetch(`${root}cart/add.js`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: payload,
    });
    const data = await response.json();
    if (!response.ok || data.status) {
      throw new Error(data.description || data.message || 'This item could not be added to your bag.');
    }

    if (cartUI && typeof cartUI.renderContents === 'function' && data.sections) {
      cartUI.classList.remove('is-empty');
      cartUI.renderContents(data);
    } else if (!cartUI) {
      window.location.href = `${root}cart`;
      return data;
    }

    // Dawn declares these as top-level script bindings, not window properties.
    if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
      publish(PUB_SUB_EVENTS.cartUpdate, { source: 'khrisha', productVariantId: data.variant_id, cartData: data });
    }
    return data;
  }

  function toFormData(obj) {
    const fd = new FormData();
    Object.entries(obj).forEach(([key, value]) => {
      if (value && typeof value === 'object') {
        Object.entries(value).forEach(([k, v]) => fd.append(`${key}[${k}]`, v));
      } else {
        fd.append(key, value);
      }
    });
    return fd;
  }

  /* ---------- Gallery ---------- */

  // Works on any element containing [data-gallery-stage] with .detail-slide children.
  class Gallery {
    constructor(el, { pad = false } = {}) {
      this.el = el;
      this.pad = pad;
      this.slides = [...el.querySelectorAll('[data-gallery-stage] .detail-slide')];
      this.thumbs = [...el.querySelectorAll('[data-gallery-thumb]')];
      this.counter = el.querySelector('[data-gallery-current]');
      if (!this.slides.length) return;

      const start = this.thumbs.findIndex((t) => t.getAttribute('aria-pressed') === 'true');
      this.show(start > -1 ? start : 0);

      el.querySelector('[data-gallery-prev]')?.addEventListener('click', () => this.step(-1));
      el.querySelector('[data-gallery-next]')?.addEventListener('click', () => this.step(1));
      this.thumbs.forEach((thumb) => thumb.addEventListener('click', () => this.show(Number(thumb.dataset.galleryThumb))));

      const stage = el.querySelector('[data-gallery-stage]');
      stage.tabIndex = -1;
      stage.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') this.step(-1);
        if (e.key === 'ArrowRight') this.step(1);
      });
      let startX = null;
      stage.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
      stage.addEventListener('touchend', (e) => {
        if (startX === null) return;
        const dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 40) this.step(dx < 0 ? 1 : -1);
        startX = null;
      });
    }

    step(delta) {
      this.show((this.index + delta + this.slides.length) % this.slides.length);
    }

    show(index) {
      if (index < 0 || index >= this.slides.length) return;
      this.index = index;
      this.slides.forEach((slide, i) => {
        slide.classList.toggle('is-active', i === index);
        slide.setAttribute('aria-hidden', i === index ? 'false' : 'true');
      });
      this.thumbs.forEach((thumb, i) => thumb.setAttribute('aria-pressed', i === index ? 'true' : 'false'));
      this.thumbs[index]?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      if (this.counter) {
        const n = String(index + 1);
        this.counter.textContent = this.pad ? n.padStart(2, '0') : n;
      }
    }

    showMedia(mediaId) {
      const index = this.slides.findIndex((s) => s.dataset.mediaId === String(mediaId));
      if (index > -1) this.show(index);
    }
  }

  /* ---------- Quantity ---------- */

  function bindQuantity(scope, onChange) {
    const input = scope.querySelector('[data-qty-input]');
    if (!input) return null;
    const clamp = () => {
      const min = Number(input.min) || 1;
      const max = input.max ? Number(input.max) : Infinity;
      let value = parseInt(input.value, 10);
      if (Number.isNaN(value)) value = min;
      input.value = Math.min(Math.max(value, min), max);
      onChange && onChange(Number(input.value));
    };
    scope.querySelectorAll('[data-qty]').forEach((btn) =>
      btn.addEventListener('click', () => {
        input.value = (parseInt(input.value, 10) || 1) + Number(btn.dataset.qty);
        clamp();
      })
    );
    input.addEventListener('change', clamp);
    return { input, clamp, get value() { return Number(input.value) || 1; } };
  }

  function setBusy(button, busy) {
    button.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  /* ---------- <kh-product> ---------- */

  class KhProduct extends HTMLElement {
    connectedCallback() {
      const json = this.querySelector('[data-product-json]');
      this.data = json ? JSON.parse(json.textContent) : { variants: [] };
      this.moneyFormat = this.dataset.moneyFormat;
      this.form = this.querySelector('form.kh-product-form');
      this.variantInput = this.querySelector('[data-variant-input]');
      this.addButton = this.querySelector('[data-add-button]');
      this.addLabel = this.querySelector('[data-add-label]');
      this.installment = this.querySelector('[data-installment]');
      this.availability = this.querySelector('[data-availability]');
      this.error = this.querySelector('[data-form-error]');
      this.gallery = new Gallery(this.querySelector('[data-gallery]'));
      this.variant = this.data.variants.find((v) => String(v.id) === this.variantInput.value) || this.data.variants[0];
      this.qty = bindQuantity(this, () => this.render());

      this.querySelectorAll('[data-variant-id]').forEach((btn) =>
        btn.addEventListener('click', () => this.selectVariant(btn.dataset.variantId))
      );
      this.form.addEventListener('submit', (e) => this.onSubmit(e));
    }

    selectVariant(id) {
      const variant = this.data.variants.find((v) => String(v.id) === String(id));
      if (!variant) return;
      this.variant = variant;
      this.variantInput.value = variant.id;
      this.querySelectorAll('[data-variant-id]').forEach((btn) =>
        btn.setAttribute('aria-pressed', btn.dataset.variantId === String(id) ? 'true' : 'false')
      );
      if (variant.featured_media) this.gallery.showMedia(variant.featured_media.id);

      // Keep the max quantity in step with tracked inventory.
      const input = this.qty && this.qty.input;
      if (input) {
        if (variant.inventory_management === 'shopify' && variant.inventory_policy === 'deny' && variant.inventory_quantity > 0) {
          input.max = variant.inventory_quantity;
        } else {
          input.removeAttribute('max');
        }
        this.qty.clamp();
      }

      const url = new URL(window.location.href);
      url.searchParams.set('variant', variant.id);
      window.history.replaceState({}, '', url.toString());
      this.error.textContent = '';
      this.render();
    }

    render() {
      const v = this.variant;
      if (!v) return;
      const qty = this.qty ? this.qty.value : 1;
      const total = v.price * qty;
      this.addButton.disabled = !v.available;
      this.addLabel.textContent = v.available
        ? `${this.dataset.buttonLabel} · ${formatMoney(total, this.moneyFormat)}`
        : 'Sold out';
      if (this.installment) this.installment.textContent = formatMoney(Math.round(total / 4), this.moneyFormat);
      if (this.availability) {
        this.availability.innerHTML = v.available
          ? `In stock · ${this.dataset.deliveryText || ''}`
          : `<span class="is-out">Sold out</span> · ${this.dataset.soldOutText || ''}`;
      }
    }

    async onSubmit(event) {
      event.preventDefault();
      if (this.addButton.disabled) return;
      this.error.textContent = '';
      setBusy(this.addButton, true);
      try {
        await addToCart(new FormData(this.form));
      } catch (err) {
        this.error.textContent = err.message;
      } finally {
        setBusy(this.addButton, false);
      }
    }
  }

  /* ---------- <kh-card> (related product card) ---------- */

  class KhCard extends HTMLElement {
    connectedCallback() {
      this.images = [...this.querySelectorAll('.product-photo-link img')];
      this.dots = [...this.querySelectorAll('[data-dot]')];
      this.index = 0;
      this.querySelector('[data-card-prev]')?.addEventListener('click', () => this.show(this.index - 1));
      this.querySelector('[data-card-next]')?.addEventListener('click', () => this.show(this.index + 1));
      this.dots.forEach((dot, i) => dot.addEventListener('click', () => this.show(i)));

      const add = this.querySelector('[data-card-add]');
      add?.addEventListener('click', async () => {
        const label = add.querySelector('span');
        const original = label.textContent;
        setBusy(add, true);
        try {
          await addToCart({ id: add.dataset.variantId, quantity: 1 });
          label.textContent = 'Added';
        } catch (err) {
          label.textContent = 'Unavailable';
        } finally {
          setBusy(add, false);
          setTimeout(() => { label.textContent = original; }, 2000);
        }
      });
    }

    show(i) {
      if (this.images.length < 2) return;
      this.index = (i + this.images.length) % this.images.length;
      this.images.forEach((img, n) => {
        img.classList.toggle('shown', n === this.index);
        img.setAttribute('aria-hidden', n === this.index ? 'false' : 'true');
      });
      this.dots.forEach((dot, n) => dot.setAttribute('aria-pressed', n === this.index ? 'true' : 'false'));
    }
  }

  /* ---------- <kh-recommendations> ---------- */

  class KhRecommendations extends HTMLElement {
    connectedCallback() {
      if (!this.dataset.url) return;
      const observer = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();
        fetch(this.dataset.url)
          .then((r) => r.text())
          .then((html) => {
            const fresh = new DOMParser().parseFromString(html, 'text/html').querySelector('kh-recommendations');
            if (fresh && fresh.querySelector('kh-card')) {
              this.innerHTML = fresh.innerHTML;
              this.closest('[data-hide-when-empty]')?.removeAttribute('hidden');
            }
          })
          .catch(() => {});
      }, { rootMargin: '0px 0px 400px 0px' });
      observer.observe(this);
    }
  }

  customElements.define('kh-product', KhProduct);
  customElements.define('kh-card', KhCard);
  customElements.define('kh-recommendations', KhRecommendations);

  window.Khrisha = { formatMoney, addToCart, Gallery, bindQuantity, setBusy };
})();

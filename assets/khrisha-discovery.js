/*
  Custom Discovery Set builder.
  Depends on window.Khrisha from khrisha-product.js (both load with defer, in order).
*/
(() => {
  const MAX_SUGGESTIONS = 8;
  const normalize = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  class KhDiscovery extends HTMLElement {
    connectedCallback() {
      const { Gallery, bindQuantity } = window.Khrisha;
      this.setSize = Number(this.dataset.setSize) || 6;
      this.price = Number(this.dataset.price) || 0;
      this.moneyFormat = this.dataset.moneyFormat;
      this.mode = 'choose';
      this.styles = new Set();

      const poolEl = this.querySelector('[data-pool]');
      try {
        this.pool = poolEl ? JSON.parse(poolEl.textContent) : [];
      } catch (e) {
        this.pool = [];
      }

      this.form = this.querySelector('form.kh-discovery-form');
      this.addButton = this.querySelector('[data-add-button]');
      this.addLabel = this.querySelector('[data-add-label]');
      this.installment = this.querySelector('[data-installment]');
      this.error = this.querySelector('[data-form-error]');
      this.hint = this.querySelector('[data-hint]');
      this.progress = this.querySelector('[data-progress]');
      this.copyButton = this.querySelector('[data-copy]');
      this.copyStatus = this.querySelector('[data-copy-status]');
      this.preferences = this.querySelector('[data-preferences]');
      this.choices = [...this.querySelectorAll('[data-choice]')];
      this.soldOut = this.addButton.hasAttribute('data-sold-out');

      new Gallery(this.querySelector('[data-gallery]'), { pad: true });
      this.qty = bindQuantity(this, () => this.update());

      this.querySelectorAll('[data-mode]').forEach((btn) => btn.addEventListener('click', () => this.setMode(btn.dataset.mode)));
      this.querySelectorAll('[data-family]').forEach((btn) =>
        btn.addEventListener('click', () => {
          const name = btn.dataset.family;
          this.styles.has(name) ? this.styles.delete(name) : this.styles.add(name);
          btn.setAttribute('aria-pressed', this.styles.has(name) ? 'true' : 'false');
          this.update();
        })
      );
      this.preferences.addEventListener('input', () => this.update());
      this.choices.forEach((choice) => this.bindChoice(choice));
      this.copyButton.addEventListener('click', () => this.copy());
      this.form.addEventListener('submit', (e) => this.onSubmit(e));
      this.update();
    }

    /* ----- Mode ----- */

    setMode(mode) {
      this.mode = mode;
      this.querySelectorAll('[data-mode]').forEach((btn) => btn.setAttribute('aria-pressed', btn.dataset.mode === mode ? 'true' : 'false'));
      this.querySelectorAll('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== mode; });
      this.copyStatus.textContent = '';
      this.error.textContent = '';
      this.update();
    }

    /* ----- Combobox ----- */

    bindChoice(choice) {
      const input = choice.querySelector('[data-choice-input]');
      const list = choice.querySelector('[role="listbox"]');
      let active = -1;
      let results = [];
      let searchTimer;

      const close = () => {
        list.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
        active = -1;
      };

      const render = () => {
        list.innerHTML = '';
        if (!results.length) {
          close();
          return;
        }
        results.forEach((name, i) => {
          const option = document.createElement('div');
          option.setAttribute('role', 'option');
          option.id = `${list.id}-${i}`;
          option.setAttribute('aria-selected', i === active ? 'true' : 'false');
          option.textContent = name;
          option.addEventListener('mousedown', (e) => e.preventDefault());
          option.addEventListener('click', () => pick(name));
          list.appendChild(option);
        });
        list.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        if (active > -1) {
          input.setAttribute('aria-activedescendant', `${list.id}-${active}`);
          list.children[active].scrollIntoView({ block: 'nearest' });
        } else {
          input.removeAttribute('aria-activedescendant');
        }
      };

      const pick = (name) => {
        input.value = name;
        close();
        this.update();
      };

      const search = (query) => {
        clearTimeout(searchTimer);
        const terms = normalize(query).split(/\s+/).filter(Boolean);
        if (!terms.length) {
          results = [];
          render();
          return;
        }
        if (this.pool.length) {
          results = this.pool.filter((name) => terms.every((t) => normalize(name).includes(t))).slice(0, MAX_SUGGESTIONS);
          active = -1;
          render();
          return;
        }
        // No curated list: fall back to the store's predictive search.
        searchTimer = setTimeout(async () => {
          try {
            const url = `${this.dataset.searchUrl}.json?q=${encodeURIComponent(query)}&resources[type]=product&resources[limit]=${MAX_SUGGESTIONS}`;
            const data = await (await fetch(url)).json();
            const products = (data.resources && data.resources.results && data.resources.results.products) || [];
            results = products.map((p) => (p.title.includes(p.vendor) ? p.title : `${p.vendor} ${p.title}`));
            active = -1;
            if (input === document.activeElement) render();
          } catch (e) {
            results = [];
            render();
          }
        }, 200);
      };

      input.addEventListener('input', () => {
        search(input.value);
        this.update();
      });
      input.addEventListener('focus', () => input.value && search(input.value));
      input.addEventListener('blur', close);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
        if (!results.length || list.hidden) return;
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          active = (active + 1) % results.length;
          render();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          active = active <= 0 ? results.length - 1 : active - 1;
          render();
        } else if (e.key === 'Enter' && active > -1) {
          e.preventDefault();
          pick(results[active]);
        }
      });
      choice.querySelector('[data-choice-clear]').addEventListener('click', () => {
        input.value = '';
        close();
        input.focus();
        this.update();
      });
    }

    /* ----- State ----- */

    picks() {
      return this.choices.map((c) => c.querySelector('[data-choice-input]').value.trim());
    }

    state() {
      if (this.mode === 'choose') {
        const picks = this.picks();
        const filled = picks.filter(Boolean);
        const seen = new Map();
        const duplicates = new Set();
        picks.forEach((p, i) => {
          if (!p) return;
          const key = normalize(p);
          if (seen.has(key)) {
            duplicates.add(i);
            duplicates.add(seen.get(key));
          } else {
            seen.set(key, i);
          }
        });
        const remaining = this.setSize - filled.length;
        let hint = 'Your set is ready.';
        if (duplicates.size) hint = 'Two picks are the same. Choose a different fragrance.';
        else if (remaining > 0) hint = `Choose ${remaining} more fragrance${remaining === 1 ? '' : 's'} to continue.`;
        return { picks, filled, duplicates, valid: remaining === 0 && !duplicates.size, hint, hasContent: filled.length > 0 };
      }
      const notes = this.preferences.value.trim();
      const valid = this.styles.size > 0 || notes.length >= 3;
      return {
        notes,
        valid,
        hasContent: valid,
        hint: valid ? 'We’ll curate your set around these.' : 'Pick a style or tell us what you love.',
      };
    }

    update() {
      const s = this.state();
      if (this.mode === 'choose') {
        this.choices.forEach((choice, i) => {
          choice.classList.toggle('is-filled', Boolean(s.picks[i]));
          choice.classList.toggle('is-duplicate', s.duplicates.has(i));
        });
        this.progress.textContent = `${s.filled.length} / ${this.setSize}`;
      }
      this.hint.textContent = s.hint;
      this.copyButton.disabled = !s.hasContent;

      const qty = this.qty ? this.qty.value : 1;
      const total = this.price * qty;
      const { formatMoney } = window.Khrisha;
      this.addButton.disabled = this.soldOut;
      this.addButton.setAttribute('aria-describedby', this.hint.id);
      this.addLabel.textContent = this.soldOut ? 'Sold out' : `${this.dataset.buttonLabel} · ${formatMoney(total, this.moneyFormat)}`;
      if (this.installment) this.installment.textContent = formatMoney(Math.round(total / 4), this.moneyFormat);
      return s;
    }

    properties(s) {
      if (this.mode === 'choose') {
        const props = { Personalisation: `I chose my ${this.setSize}` };
        s.picks.forEach((p, i) => { props[`Fragrance ${i + 1}`] = p; });
        return props;
      }
      const props = { Personalisation: 'Curate for me' };
      if (this.styles.size) props['Preferred styles'] = [...this.styles].join(', ');
      if (s.notes) props['What I love'] = s.notes;
      return props;
    }

    summary(s) {
      const props = this.properties(s);
      return ['Custom Discovery Set', ...Object.entries(props).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`)].join('\n');
    }

    async copy() {
      const s = this.state();
      try {
        await navigator.clipboard.writeText(this.summary(s));
        this.copyStatus.textContent = 'Copied. Paste your preferences anywhere you need them.';
      } catch (e) {
        this.copyStatus.textContent = 'Your preferences couldn’t be copied. They will still be saved with your order.';
      }
    }

    async onSubmit(event) {
      event.preventDefault();
      const s = this.update();
      if (!s.valid) {
        this.error.textContent = s.hint;
        if (this.mode === 'choose') {
          const firstEmpty = this.choices.find((c, i) => !s.picks[i] || s.duplicates.has(i));
          firstEmpty && firstEmpty.querySelector('input').focus();
        } else {
          this.preferences.focus();
        }
        return;
      }
      this.error.textContent = '';
      const fd = new FormData(this.form);
      Object.entries(this.properties(s)).forEach(([key, value]) => {
        if (value) fd.append(`properties[${key}]`, value);
      });
      window.Khrisha.setBusy(this.addButton, true);
      try {
        await window.Khrisha.addToCart(fd);
      } catch (err) {
        this.error.textContent = err.message;
      } finally {
        window.Khrisha.setBusy(this.addButton, false);
      }
    }
  }

  customElements.define('kh-discovery', KhDiscovery);
})();

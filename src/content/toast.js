(function registerToast(root) {
  'use strict';

  const ns = (root.KoreaFinder = root.KoreaFinder || {});

  const HOST_ID = 'korea-finder-toast-host';
  const originalStylesMap = new WeakMap();
  const highlightTimersMap = new WeakMap();

  let toastTimer = null;

  function ensureToastContainer() {
    if (typeof document === 'undefined') return null;

    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ID;
      host.style.cssText =
        'position:fixed;bottom:24px;right:24px;z-index:2147483647;pointer-events:none;margin:0;padding:0;border:0;background:transparent;';

      const shadow = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = `
        :host {
          all: initial;
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 2147483647;
          pointer-events: none;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", sans-serif;
        }
        .kf-toast {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 210px;
          max-width: 340px;
          padding: 11px 15px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.96);
          color: #0f172a;
          border: 1px solid rgba(15, 23, 42, 0.1);
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.14), 0 2px 6px rgba(15, 23, 42, 0.06);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          opacity: 0;
          transform: translateY(10px) scale(0.97);
          transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          pointer-events: none;
        }
        .kf-toast.visible {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        .kf-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          flex-shrink: 0;
          background: #2563eb;
        }
        .kf-toast[data-variant="success"] .kf-dot {
          background: #10b981;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
        }
        .kf-toast[data-variant="muted"] .kf-dot {
          background: #94a3b8;
        }
        .kf-body {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .kf-msg {
          font-size: 13px;
          font-weight: 600;
          line-height: 1.35;
          word-break: keep-all;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .kf-sub {
          font-size: 11px;
          line-height: 1.3;
          color: #64748b;
        }
        @media (prefers-color-scheme: dark) {
          .kf-toast {
            background: rgba(17, 24, 39, 0.94);
            color: #f8fafc;
            border-color: rgba(148, 163, 184, 0.2);
            box-shadow: 0 14px 34px rgba(0, 0, 0, 0.48);
          }
          .kf-sub {
            color: #94a3b8;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .kf-toast {
            transition: none;
          }
        }
      `;

      const toastEl = document.createElement('div');
      toastEl.className = 'kf-toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      toastEl.innerHTML =
        '<span class="kf-dot"></span><div class="kf-body"><div class="kf-msg"></div><div class="kf-sub"></div></div>';

      shadow.appendChild(style);
      shadow.appendChild(toastEl);

      const mountTarget = document.body || document.documentElement;
      if (!mountTarget) return null;
      mountTarget.appendChild(host);
    }

    return host.shadowRoot ? host.shadowRoot.querySelector('.kf-toast') : null;
  }

  function showToast(options = {}) {
    const toastEl = ensureToastContainer();
    if (!toastEl) return;

    const message = String(options.message || '').trim();
    if (!message) return;
    const subtext = String(options.subtext || '').trim();
    const variant = options.variant || 'info';
    const duration = typeof options.duration === 'number' ? options.duration : 2400;

    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }

    toastEl.setAttribute('data-variant', variant);
    const msgEl = toastEl.querySelector('.kf-msg');
    const subEl = toastEl.querySelector('.kf-sub');
    if (msgEl) msgEl.textContent = message;
    if (subEl) {
      subEl.textContent = subtext;
      subEl.style.display = subtext ? 'block' : 'none';
    }

    toastEl.classList.remove('visible');
    void toastEl.offsetWidth;
    toastEl.classList.add('visible');

    toastTimer = setTimeout(() => {
      toastEl.classList.remove('visible');
      toastTimer = null;
    }, duration);
  }

  function highlightElement(el) {
    if (!el || !(el instanceof Element)) return;

    if (!originalStylesMap.has(el)) {
      originalStylesMap.set(el, {
        boxShadow: el.style.boxShadow,
        outline: el.style.outline,
        transition: el.style.transition
      });
    }

    const prevTimer = highlightTimersMap.get(el);
    if (prevTimer) {
      clearTimeout(prevTimer);
    }

    el.style.transition = 'box-shadow 0.2s ease, outline-color 0.2s ease';
    el.style.outline = '2px solid #2563eb';
    el.style.boxShadow = '0 0 0 4px rgba(37, 99, 235, 0.3)';

    const timer = setTimeout(() => {
      const orig = originalStylesMap.get(el);
      if (orig) {
        el.style.boxShadow = orig.boxShadow;
        el.style.outline = orig.outline;
        el.style.transition = orig.transition;
        originalStylesMap.delete(el);
      }
      highlightTimersMap.delete(el);
    }, 1400);

    highlightTimersMap.set(el, timer);
  }

  ns.toast = Object.freeze({
    showToast,
    highlightElement
  });
})(globalThis);

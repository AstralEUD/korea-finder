(function initContentScript(root) {
  'use strict';

  if (root.__koreaFinderInitialized) return;
  root.__koreaFinderInitialized = true;

  const ns = root.KoreaFinder;
  const { MSG, FALLBACK_VARIANTS } = ns.constants;
  const {
    getSettings,
    isHostDisabled,
    isHostAutoSelect,
    onSettingsChanged
  } = ns.storage;
  const { parseShortcut, matchesShortcut } = ns.shortcut;
  const { createMatcher } = ns.matcher;
  const { findAndSelectKorea } = ns.domFinder;
  const { showToast } = ns.toast;

  let currentSettings = null;
  let currentCombo = parseShortcut('');
  let cachedBaseVariants = null;
  let cachedMatcher = null;
  let cachedMatcherKey = '';
  let lastContextTarget = null;
  let autoSelectAttempted = false;

  async function loadBaseVariants() {
    if (cachedBaseVariants) return cachedBaseVariants;
    try {
      const url = chrome.runtime.getURL('data/koreaVariants.json');
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const arr = await res.json();
      cachedBaseVariants = Array.from(
        new Set(arr.map((v) => String(v || '').trim()).filter(Boolean))
      );
    } catch (_err) {
      cachedBaseVariants = [...FALLBACK_VARIANTS];
    }
    return cachedBaseVariants;
  }

  async function getActiveSettings() {
    if (currentSettings) return currentSettings;
    currentSettings = await getSettings();
    currentCombo = parseShortcut(currentSettings.customShortcut);
    return currentSettings;
  }

  async function getMatcher(settings) {
    const baseVariants = await loadBaseVariants();
    const key = JSON.stringify({
      cv: settings.customVariants || [],
      il: Boolean(settings.includeLanguage),
      it: Boolean(settings.includeTimezone),
      ic: Boolean(settings.includeCurrency)
    });
    if (!cachedMatcher || cachedMatcherKey !== key) {
      cachedMatcher = createMatcher(baseVariants, {
        customVariants: settings.customVariants,
        includeLanguage: settings.includeLanguage,
        includeTimezone: settings.includeTimezone,
        includeCurrency: settings.includeCurrency
      });
      cachedMatcherKey = key;
    }
    return cachedMatcher;
  }

  function isEditableTarget(el) {
    if (!el || !(el instanceof Element)) return false;
    if (el.isContentEditable) return true;

    const tag = (el.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA') return true;
    if (tag === 'INPUT') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (['button', 'submit', 'reset', 'checkbox', 'radio', 'file'].includes(type)) {
        return false;
      }
      if (
        el.hasAttribute('list') ||
        el.getAttribute('role') === 'combobox' ||
        /\bcountry\b/i.test(el.getAttribute('autocomplete') || '')
      ) {
        return false;
      }
      return true;
    }
    return false;
  }

  function getDeepActiveEl() {
    let active = document.activeElement;
    while (active && active.shadowRoot && active.shadowRoot.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    return active;
  }

  function getPreferredContextTarget(fromContextMenu) {
    if (!fromContextMenu || !lastContextTarget) return null;
    if (Date.now() - lastContextTarget.time > 10000) return null;
    if (!lastContextTarget.el || !lastContextTarget.el.isConnected) return null;
    return lastContextTarget.el;
  }

  async function runFindKorea(options = {}) {
    const manual = Boolean(options.manual);
    const suppressNotFoundToast = Boolean(options.suppressNotFoundToast);
    const skipTopFrame = Boolean(options.skipTopFrame);
    const fromContextMenu = Boolean(options.fromContextMenu);

    if (skipTopFrame && window === window.top) {
      return { found: false };
    }

    const settings = await getActiveSettings();
    if (!manual) {
      if (!settings.enabled) return { found: false, disabled: true };
      if (isHostDisabled(settings, location.hostname)) {
        return { found: false, disabled: true };
      }
    }

    const matcher = await getMatcher(settings);
    const preferredTarget = getPreferredContextTarget(fromContextMenu);
    const result = await findAndSelectKorea(matcher, { preferredTarget });

    if (settings.showToast) {
      if (result.found) {
        const subtext =
          result.totalFields > 1
            ? `${result.cycleIndex + 1}/${result.totalFields} · 다시 누르면 다음 필드`
            : '';
        showToast({
          message: `🇰🇷 ${result.label} 선택됨`,
          subtext,
          variant: 'success'
        });
      } else if (!suppressNotFoundToast) {
        showToast({
          message: '국가 선택 목록을 찾지 못했습니다',
          variant: 'muted'
        });
      }
    }

    return result;
  }

  root.__koreaFinderRun = runFindKorea;

  function onContextMenu(e) {
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    const target =
      path.find((node) => node instanceof Element) ||
      (e.target instanceof Element ? e.target : null);
    if (target) {
      lastContextTarget = { el: target, time: Date.now() };
    }
  }

  function onKeyDown(e) {
    if (!currentSettings) return;
    if (!currentSettings.enabled) return;
    if (isHostDisabled(currentSettings, location.hostname)) return;
    if (!matchesShortcut(e, currentCombo)) return;

    const active = getDeepActiveEl();
    if (isEditableTarget(active)) return;

    e.preventDefault();
    e.stopPropagation();
    runFindKorea({ manual: false, suppressNotFoundToast: false });
  }

  window.addEventListener('contextmenu', onContextMenu, true);
  window.addEventListener('keydown', onKeyDown, true);

  getActiveSettings().then((settings) => {
    if (
      !autoSelectAttempted &&
      settings.enabled &&
      !isHostDisabled(settings, location.hostname) &&
      isHostAutoSelect(settings, location.hostname)
    ) {
      autoSelectAttempted = true;
      setTimeout(() => {
        runFindKorea({ manual: false, suppressNotFoundToast: true });
      }, 250);
    }
  });

  onSettingsChanged((updated) => {
    currentSettings = updated;
    currentCombo = parseShortcut(updated.customShortcut);
    cachedMatcher = null;
    cachedMatcherKey = '';
  });

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || !msg.type) return false;

      if (msg.type === MSG.PING) {
        sendResponse({ ok: true });
        return false;
      }

      if (msg.type === MSG.FIND_KOREA) {
        runFindKorea({
          manual: msg.manual !== false,
          suppressNotFoundToast: Boolean(msg.suppressNotFoundToast),
          skipTopFrame: Boolean(msg.skipTopFrame),
          fromContextMenu: Boolean(msg.fromContextMenu)
        }).then(sendResponse);
        return true;
      }

      if (msg.type === MSG.SHOW_TOAST) {
        getActiveSettings().then((settings) => {
          if (settings.showToast && msg.message) {
            showToast({
              message: msg.message,
              subtext: msg.subtext || '',
              variant: msg.variant || 'muted'
            });
          }
          sendResponse({ ok: true });
        });
        return true;
      }

      return false;
    });
  }
})(globalThis);

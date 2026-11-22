(function registerStorage(root) {
  'use strict';

  const ns = (root.KoreaFinder = root.KoreaFinder || {});
  const { DEFAULT_SETTINGS } = ns.constants;

  const PREVIEW_STORAGE_KEY = 'korea_finder_preview_settings';

  function hasChromeSync() {
    return (
      typeof chrome !== 'undefined' &&
      Boolean(chrome.storage && chrome.storage.sync)
    );
  }

  function normalizeHostname(hostname) {
    return String(hostname || '')
      .trim()
      .toLowerCase()
      .replace(/^www\./, '');
  }

  function sanitizeSettings(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const shortcutRaw =
      typeof src.customShortcut === 'string' ? src.customShortcut.trim() : '';

    const disabledHosts = Array.isArray(src.disabledHosts)
      ? Array.from(
          new Set(src.disabledHosts.map(normalizeHostname).filter(Boolean))
        )
      : [];

    const disabledSet = new Set(disabledHosts);
    const autoSelectHosts = Array.isArray(src.autoSelectHosts)
      ? Array.from(
          new Set(
            src.autoSelectHosts
              .map(normalizeHostname)
              .filter((h) => Boolean(h) && !disabledSet.has(h))
          )
        )
      : [];

    const customVariants = Array.isArray(src.customVariants)
      ? Array.from(
          new Set(src.customVariants.map((v) => String(v || '').trim()).filter(Boolean))
        )
      : [];

    return {
      enabled: typeof src.enabled === 'boolean' ? src.enabled : DEFAULT_SETTINGS.enabled,
      customShortcut: shortcutRaw || DEFAULT_SETTINGS.customShortcut,
      includeLanguage:
        typeof src.includeLanguage === 'boolean'
          ? src.includeLanguage
          : DEFAULT_SETTINGS.includeLanguage,
      includeTimezone:
        typeof src.includeTimezone === 'boolean'
          ? src.includeTimezone
          : DEFAULT_SETTINGS.includeTimezone,
      includeCurrency:
        typeof src.includeCurrency === 'boolean'
          ? src.includeCurrency
          : DEFAULT_SETTINGS.includeCurrency,
      showToast:
        typeof src.showToast === 'boolean' ? src.showToast : DEFAULT_SETTINGS.showToast,
      customVariants,
      disabledHosts,
      autoSelectHosts
    };
  }

  function readLocalFallback() {
    try {
      if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
      const text = localStorage.getItem(PREVIEW_STORAGE_KEY);
      if (!text) return { ...DEFAULT_SETTINGS };
      return sanitizeSettings(JSON.parse(text));
    } catch (_e) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function writeLocalFallback(next) {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(next));
      if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
        window.dispatchEvent(
          new CustomEvent('korea-finder-settings-changed', { detail: next })
        );
      }
    } catch (_e) {
      // Ignore storage quota or restricted context errors in preview mode.
    }
  }

  function getSettings() {
    if (!hasChromeSync()) {
      return Promise.resolve(readLocalFallback());
    }
    return new Promise((resolve) => {
      chrome.storage.sync.get(
        {
          enabled: DEFAULT_SETTINGS.enabled,
          customShortcut: '',
          includeLanguage: DEFAULT_SETTINGS.includeLanguage,
          includeTimezone: DEFAULT_SETTINGS.includeTimezone,
          includeCurrency: DEFAULT_SETTINGS.includeCurrency,
          showToast: DEFAULT_SETTINGS.showToast,
          customVariants: DEFAULT_SETTINGS.customVariants,
          disabledHosts: DEFAULT_SETTINGS.disabledHosts,
          autoSelectHosts: DEFAULT_SETTINGS.autoSelectHosts
        },
        (items) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            resolve(sanitizeSettings(DEFAULT_SETTINGS));
            return;
          }
          resolve(sanitizeSettings(items));
        }
      );
    });
  }

  async function saveSettings(partial) {
    const current = await getSettings();
    const mergedInput = { ...current, ...(partial || {}) };
    const sanitized = sanitizeSettings(mergedInput);

    if (!hasChromeSync()) {
      writeLocalFallback(sanitized);
      return sanitized;
    }

    return new Promise((resolve, reject) => {
      chrome.storage.sync.set(sanitized, () => {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(sanitized);
      });
    });
  }

  function isHostDisabled(settings, hostname) {
    const normalized = normalizeHostname(hostname);
    if (!normalized) return false;
    const list = Array.isArray(settings?.disabledHosts) ? settings.disabledHosts : [];
    return list.some((h) => normalizeHostname(h) === normalized);
  }

  function isHostAutoSelect(settings, hostname) {
    const normalized = normalizeHostname(hostname);
    if (!normalized) return false;
    if (isHostDisabled(settings, normalized)) return false;
    const list = Array.isArray(settings?.autoSelectHosts) ? settings.autoSelectHosts : [];
    return list.some((h) => normalizeHostname(h) === normalized);
  }

  async function toggleHostDisabled(hostname) {
    const normalized = normalizeHostname(hostname);
    if (!normalized) return { settings: await getSettings(), disabled: false };

    const settings = await getSettings();
    const exists = isHostDisabled(settings, normalized);
    const nextHosts = exists
      ? settings.disabledHosts.filter((h) => normalizeHostname(h) !== normalized)
      : [...settings.disabledHosts, normalized];
    const nextAuto = !exists
      ? (settings.autoSelectHosts || []).filter((h) => normalizeHostname(h) !== normalized)
      : settings.autoSelectHosts || [];

    const updated = await saveSettings({
      disabledHosts: nextHosts,
      autoSelectHosts: nextAuto
    });
    return { settings: updated, disabled: !exists };
  }

  async function toggleHostAutoSelect(hostname) {
    const normalized = normalizeHostname(hostname);
    if (!normalized) return { settings: await getSettings(), autoSelect: false };

    const settings = await getSettings();
    const exists = isHostAutoSelect(settings, normalized);
    const nextAuto = exists
      ? (settings.autoSelectHosts || []).filter((h) => normalizeHostname(h) !== normalized)
      : [...(settings.autoSelectHosts || []), normalized];
    const nextDisabled = !exists
      ? (settings.disabledHosts || []).filter((h) => normalizeHostname(h) !== normalized)
      : settings.disabledHosts || [];

    const updated = await saveSettings({
      autoSelectHosts: nextAuto,
      disabledHosts: nextDisabled
    });
    return { settings: updated, autoSelect: !exists };
  }

  function exportSettingsJson(settings) {
    const payload = {
      app: 'Korea Finder',
      version: getVersion(),
      exportedAt: new Date().toISOString(),
      settings: sanitizeSettings(settings)
    };
    return JSON.stringify(payload, null, 2);
  }

  async function importSettingsJson(jsonText) {
    let parsed;
    try {
      parsed = JSON.parse(String(jsonText || ''));
    } catch (_err) {
      throw new Error('올바른 JSON 형식이 아닙니다.');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('유효한 설정 데이터가 아닙니다.');
    }

    const rawSettings =
      parsed.settings && typeof parsed.settings === 'object' && !Array.isArray(parsed.settings)
        ? parsed.settings
        : parsed;

    const knownKeys = [
      'enabled',
      'customShortcut',
      'includeLanguage',
      'includeTimezone',
      'includeCurrency',
      'showToast',
      'customVariants',
      'disabledHosts',
      'autoSelectHosts'
    ];
    if (!knownKeys.some((k) => k in rawSettings)) {
      throw new Error('Korea Finder 설정 항목을 찾을 수 없습니다.');
    }

    const sanitized = sanitizeSettings(rawSettings);
    return saveSettings(sanitized);
  }

  function onSettingsChanged(callback) {
    if (typeof callback !== 'function') return () => {};

    const cleanups = [];

    if (
      typeof chrome !== 'undefined' &&
      chrome.storage &&
      chrome.storage.onChanged
    ) {
      const listener = (_changes, areaName) => {
        if (areaName && areaName !== 'sync') return;
        getSettings().then(callback);
      };
      chrome.storage.onChanged.addListener(listener);
      cleanups.push(() => chrome.storage.onChanged.removeListener(listener));
    }

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      const localListener = (e) => {
        if (e && e.detail) callback(sanitizeSettings(e.detail));
      };
      window.addEventListener('korea-finder-settings-changed', localListener);
      cleanups.push(() =>
        window.removeEventListener('korea-finder-settings-changed', localListener)
      );
    }

    return () => cleanups.forEach((fn) => fn());
  }

  function getVersion() {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
        return chrome.runtime.getManifest().version || '0.4.0';
      }
    } catch (_e) {
      // Fallback for non-extension preview
    }
    return '0.4.0';
  }

  ns.storage = Object.freeze({
    normalizeHostname,
    sanitizeSettings,
    getSettings,
    saveSettings,
    isHostDisabled,
    isHostAutoSelect,
    toggleHostDisabled,
    toggleHostAutoSelect,
    exportSettingsJson,
    importSettingsJson,
    onSettingsChanged,
    getVersion
  });
})(globalThis);

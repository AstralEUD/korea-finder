(function registerShortcut(root) {
  'use strict';

  const ns = (root.KoreaFinder = root.KoreaFinder || {});

  const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'];
  const MODIFIER_MAP = {
    ctrl: 'Ctrl',
    control: 'Ctrl',
    alt: 'Alt',
    option: 'Alt',
    shift: 'Shift',
    meta: 'Meta',
    cmd: 'Meta',
    command: 'Meta',
    win: 'Meta'
  };

  const DEFAULT_COMBO = Object.freeze({
    raw: 'Shift+K',
    ctrl: false,
    alt: false,
    shift: true,
    meta: false,
    key: 'k',
    code: 'KeyK'
  });

  function normalizeKeyToken(rawKey) {
    const trimmed = String(rawKey || '').trim();
    if (!trimmed) return null;
    if (/^[a-z]$/i.test(trimmed)) {
      const upper = trimmed.toUpperCase();
      return {
        label: upper,
        key: trimmed.toLowerCase(),
        code: 'Key' + upper,
        isFunctionKey: false
      };
    }
    if (/^[0-9]$/.test(trimmed)) {
      return {
        label: trimmed,
        key: trimmed,
        code: 'Digit' + trimmed,
        isFunctionKey: false
      };
    }
    if (/^F([1-9]|1[0-2])$/i.test(trimmed)) {
      const upper = trimmed.toUpperCase();
      return {
        label: upper,
        key: upper,
        code: upper,
        isFunctionKey: true
      };
    }
    return null;
  }

  function normalizeShortcutString(str) {
    if (str === undefined || str === null) return '';
    const trimmed = String(str).trim();
    if (!trimmed) return '';

    const parts = trimmed.split('+').map((p) => p.trim());
    if (parts.some((p) => !p)) return null;

    const keyPart = parts[parts.length - 1];
    const modParts = parts.slice(0, -1);

    const parsedMods = new Set();
    for (const m of modParts) {
      const mapped = MODIFIER_MAP[m.toLowerCase()];
      if (!mapped) return null;
      parsedMods.add(mapped);
    }

    const keyInfo = normalizeKeyToken(keyPart);
    if (!keyInfo) return null;

    // Require at least one modifier for letter/digit shortcuts to avoid hijacking normal typing
    if (parsedMods.size === 0 && !keyInfo.isFunctionKey) {
      return null;
    }

    const orderedMods = MODIFIER_ORDER.filter((m) => parsedMods.has(m));
    return [...orderedMods, keyInfo.label].join('+');
  }

  function validateShortcut(str) {
    if (str === undefined || str === null || String(str).trim() === '') {
      return true;
    }
    return normalizeShortcutString(str) !== null;
  }

  function parseShortcut(str) {
    const normalized = normalizeShortcutString(str);
    if (!normalized) {
      return { ...DEFAULT_COMBO };
    }

    const parts = normalized.split('+');
    const keyInfo = normalizeKeyToken(parts[parts.length - 1]);
    const modSet = new Set(parts.slice(0, -1));

    return {
      raw: normalized,
      ctrl: modSet.has('Ctrl'),
      alt: modSet.has('Alt'),
      shift: modSet.has('Shift'),
      meta: modSet.has('Meta'),
      key: keyInfo.key,
      code: keyInfo.code
    };
  }

  function extractKeyFromKeyboardEvent(e) {
    const code = String(e.code || '');
    const key = String(e.key || '');

    if (
      ['Control', 'Alt', 'Shift', 'Meta', 'OS'].includes(key) ||
      /^(Control|Alt|Shift|Meta)(Left|Right)$/.test(code)
    ) {
      return null;
    }

    const codeLetter = code.match(/^Key([A-Z])$/);
    if (codeLetter) return codeLetter[1];

    const codeDigit = code.match(/^Digit([0-9])$/);
    if (codeDigit) return codeDigit[1];

    const codeFn = code.match(/^F([1-9]|1[0-2])$/);
    if (codeFn) return 'F' + codeFn[1];

    const keyInfo = normalizeKeyToken(key);
    return keyInfo ? keyInfo.label : null;
  }

  function formatShortcutFromEvent(e) {
    if (!e) return null;
    const keyLabel = extractKeyFromKeyboardEvent(e);
    if (!keyLabel) return null;

    const mods = [];
    if (e.ctrlKey) mods.push('Ctrl');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    if (e.metaKey) mods.push('Meta');

    const keyInfo = normalizeKeyToken(keyLabel);
    if (!keyInfo) return null;
    if (mods.length === 0 && !keyInfo.isFunctionKey) return null;

    return [...mods, keyInfo.label].join('+');
  }

  function matchesShortcut(e, combo) {
    if (!e || !combo) return false;
    if (Boolean(combo.ctrl) !== Boolean(e.ctrlKey)) return false;
    if (Boolean(combo.alt) !== Boolean(e.altKey)) return false;
    if (Boolean(combo.shift) !== Boolean(e.shiftKey)) return false;
    if (Boolean(combo.meta) !== Boolean(e.metaKey)) return false;

    // Prefer physical key code so shortcuts still work under Korean/non-Latin IME
    if (e.code && combo.code && e.code === combo.code) {
      return true;
    }

    const eventKey = String(e.key || '');
    if (/^F([1-9]|1[0-2])$/i.test(combo.key)) {
      return eventKey.toUpperCase() === combo.key.toUpperCase();
    }
    return eventKey.toLowerCase() === String(combo.key || '').toLowerCase();
  }

  function splitShortcutTokens(str) {
    const normalized = normalizeShortcutString(str) || DEFAULT_COMBO.raw;
    return normalized.split('+');
  }

  ns.shortcut = Object.freeze({
    DEFAULT_SHORTCUT: DEFAULT_COMBO.raw,
    normalizeShortcutString,
    validateShortcut,
    parseShortcut,
    formatShortcutFromEvent,
    matchesShortcut,
    splitShortcutTokens
  });
})(globalThis);

(function registerConstants(root) {
  'use strict';

  const ns = (root.KoreaFinder = root.KoreaFinder || {});

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    customShortcut: 'Shift+K',
    includeLanguage: false,
    includeTimezone: false,
    includeCurrency: false,
    showToast: true,
    customVariants: [],
    disabledHosts: [],
    autoSelectHosts: []
  });

  const MSG = Object.freeze({
    PING: 'KOREA_FINDER_PING',
    FIND_KOREA: 'FIND_KOREA',
    SHOW_TOAST: 'KOREA_FINDER_SHOW_TOAST',
    RUN_FIND_KOREA: 'RUN_FIND_KOREA'
  });

  const CONTENT_SCRIPT_FILES = Object.freeze([
    'src/shared/constants.js',
    'src/shared/storage.js',
    'src/shared/shortcut.js',
    'src/shared/matcher.js',
    'src/content/toast.js',
    'src/content/domFinder.js',
    'src/content/main.js'
  ]);

  const FALLBACK_VARIANTS = Object.freeze([
    'South Korea',
    'Republic of Korea',
    'Korea, Republic of',
    'Korea (South)',
    'Korea',
    '대한민국',
    '한국'
  ]);

  const REPO_URL = 'https://github.com/AstralEUD/korea-finder';

  ns.constants = Object.freeze({
    DEFAULT_SETTINGS,
    MSG,
    CONTENT_SCRIPT_FILES,
    FALLBACK_VARIANTS,
    REPO_URL
  });
})(globalThis);

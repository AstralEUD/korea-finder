(function initOptions(root) {
  'use strict';

  const ns = root.KoreaFinder;
  const { DEFAULT_SETTINGS, FALLBACK_VARIANTS } = ns.constants;
  const {
    getSettings,
    saveSettings,
    normalizeHostname,
    exportSettingsJson,
    importSettingsJson,
    onSettingsChanged,
    getVersion
  } = ns.storage;
  const {
    parseShortcut,
    formatShortcutFromEvent,
    matchesShortcut,
    splitShortcutTokens
  } = ns.shortcut;
  const { createMatcher } = ns.matcher;
  const { findAndSelectKorea, resetCycleState } = ns.domFinder;
  const { showToast } = ns.toast;

  const versionBadge = document.getElementById('versionBadge');
  const shortcutRecorder = document.getElementById('shortcutRecorder');
  const shortcutKbdPreview = document.getElementById('shortcutKbdPreview');
  const recorderStatusText = document.getElementById('recorderStatusText');
  const resetShortcutBtn = document.getElementById('resetShortcutBtn');
  const shortcutStatus = document.getElementById('shortcutStatus');
  const openGlobalShortcutsBtn = document.getElementById('openGlobalShortcutsBtn');

  const optEnabled = document.getElementById('optEnabled');
  const optShowToast = document.getElementById('optShowToast');
  const optIncludeLanguage = document.getElementById('optIncludeLanguage');
  const optIncludeTimezone = document.getElementById('optIncludeTimezone');
  const optIncludeCurrency = document.getElementById('optIncludeCurrency');

  const autoHostInput = document.getElementById('autoHostInput');
  const addAutoHostBtn = document.getElementById('addAutoHostBtn');
  const autoHostChips = document.getElementById('autoHostChips');
  const autoHostEmpty = document.getElementById('autoHostEmpty');

  const hostInput = document.getElementById('hostInput');
  const addHostBtn = document.getElementById('addHostBtn');
  const hostChips = document.getElementById('hostChips');
  const hostEmpty = document.getElementById('hostEmpty');

  const variantInput = document.getElementById('variantInput');
  const addVariantBtn = document.getElementById('addVariantBtn');
  const customVariantChips = document.getElementById('customVariantChips');
  const customVariantEmpty = document.getElementById('customVariantEmpty');

  const builtinCountBadge = document.getElementById('builtinCountBadge');
  const builtinList = document.getElementById('builtinList');

  const exportSettingsBtn = document.getElementById('exportSettingsBtn');
  const importSettingsBtn = document.getElementById('importSettingsBtn');
  const importSettingsFile = document.getElementById('importSettingsFile');
  const backupStatus = document.getElementById('backupStatus');

  const pgShortcutInline = document.getElementById('pgShortcutInline');
  const testRunBtn = document.getElementById('testRunBtn');
  const testResetBtn = document.getElementById('testResetBtn');
  const pgCountrySelect = document.getElementById('pgCountrySelect');
  const pgIsoSelect = document.getElementById('pgIsoSelect');
  const pgPhoneSelect = document.getElementById('pgPhoneSelect');
  const pgDatalistInput = document.getElementById('pgDatalistInput');
  const pgComboTrigger = document.getElementById('pgComboTrigger');
  const pgComboValue = document.getElementById('pgComboValue');
  const pgComboListbox = document.getElementById('pgComboListbox');
  const pgVirtualTrigger = document.getElementById('pgVirtualTrigger');
  const pgVirtualValue = document.getElementById('pgVirtualValue');
  const pgVirtualListbox = document.getElementById('pgVirtualListbox');
  const pgVirtualSearchInput = document.getElementById('pgVirtualSearchInput');
  const pgVirtualOptions = document.getElementById('pgVirtualOptions');
  const pgTimezoneSelect = document.getElementById('pgTimezoneSelect');
  const pgCurrencySelect = document.getElementById('pgCurrencySelect');
  const pgDecoyCombo = document.getElementById('pgDecoyCombo');
  const pgDecoyListbox = document.getElementById('pgDecoyListbox');

  let builtinVariants = [...FALLBACK_VARIANTS];
  let currentSettings = { ...DEFAULT_SETTINGS };
  let recording = false;
  let statusTimer = null;
  let backupTimer = null;

  const VIRTUAL_ALL_COUNTRIES = [
    { value: 'AU', label: 'Australia' },
    { value: 'BR', label: 'Brazil' },
    { value: 'CA', label: 'Canada' },
    { value: 'FR', label: 'France' },
    { value: 'DE', label: 'Germany' },
    { value: 'JP', label: 'Japan' },
    { value: 'KP', label: 'North Korea' },
    { value: 'KR', label: 'South Korea (대한민국)' },
    { value: 'GB', label: 'United Kingdom' },
    { value: 'US', label: 'United States' }
  ];

  function renderKeycaps(container, shortcutStr) {
    if (!container) return;
    container.innerHTML = '';
    for (const token of splitShortcutTokens(shortcutStr)) {
      const kbd = document.createElement('kbd');
      kbd.className = 'kf-kbd';
      kbd.textContent = token;
      container.appendChild(kbd);
    }
  }

  function showBanner(el, timerRefSetter, timerRefGetter, text, variant = 'success', autoHideMs = 2400) {
    el.textContent = text;
    el.className = `kf-banner visible ${variant}`;
    const prev = timerRefGetter();
    if (prev) clearTimeout(prev);
    if (autoHideMs > 0) {
      timerRefSetter(
        setTimeout(() => {
          el.className = 'kf-banner';
        }, autoHideMs)
      );
    }
  }

  function showShortcutStatus(text, variant = 'success', autoHideMs = 2200) {
    showBanner(
      shortcutStatus,
      (t) => {
        statusTimer = t;
      },
      () => statusTimer,
      text,
      variant,
      autoHideMs
    );
  }

  function showBackupStatus(text, variant = 'success', autoHideMs = 2600) {
    showBanner(
      backupStatus,
      (t) => {
        backupTimer = t;
      },
      () => backupTimer,
      text,
      variant,
      autoHideMs
    );
  }

  function setRecording(next) {
    recording = next;
    shortcutRecorder.classList.toggle('recording', recording);
    recorderStatusText.textContent = recording
      ? '키 조합을 누르세요 (ESC 취소)'
      : '클릭하여 새 단축키 녹화';
  }

  function renderChips(container, emptyEl, items, onRemove) {
    container.innerHTML = '';
    emptyEl.style.display = items.length ? 'none' : 'block';

    for (const item of items) {
      const chip = document.createElement('span');
      chip.className = 'kf-chip';

      const text = document.createElement('span');
      text.textContent = item;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-label', `${item} 삭제`);
      btn.textContent = '×';
      btn.addEventListener('click', () => onRemove(item));

      chip.appendChild(text);
      chip.appendChild(btn);
      container.appendChild(chip);
    }
  }

  function renderSettings(settings) {
    currentSettings = settings;
    const combo = parseShortcut(settings.customShortcut);

    renderKeycaps(shortcutKbdPreview, combo.raw);
    renderKeycaps(pgShortcutInline, combo.raw);

    optEnabled.checked = Boolean(settings.enabled);
    optShowToast.checked = Boolean(settings.showToast);
    optIncludeLanguage.checked = Boolean(settings.includeLanguage);
    optIncludeTimezone.checked = Boolean(settings.includeTimezone);
    optIncludeCurrency.checked = Boolean(settings.includeCurrency);

    renderChips(
      autoHostChips,
      autoHostEmpty,
      settings.autoSelectHosts || [],
      async (host) => {
        const next = (currentSettings.autoSelectHosts || []).filter((h) => h !== host);
        renderSettings(await saveSettings({ autoSelectHosts: next }));
      }
    );

    renderChips(hostChips, hostEmpty, settings.disabledHosts || [], async (host) => {
      const next = (currentSettings.disabledHosts || []).filter((h) => h !== host);
      renderSettings(await saveSettings({ disabledHosts: next }));
    });

    renderChips(
      customVariantChips,
      customVariantEmpty,
      settings.customVariants || [],
      async (variant) => {
        const next = (currentSettings.customVariants || []).filter((v) => v !== variant);
        renderSettings(await saveSettings({ customVariants: next }));
      }
    );
  }

  async function loadBuiltinVariants() {
    try {
      const url =
        typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
          ? chrome.runtime.getURL('data/koreaVariants.json')
          : '../../data/koreaVariants.json';
      const res = await fetch(url);
      if (res.ok) {
        const arr = await res.json();
        builtinVariants = Array.from(
          new Set(arr.map((v) => String(v || '').trim()).filter(Boolean))
        );
      }
    } catch (_err) {
      builtinVariants = [...FALLBACK_VARIANTS];
    }

    builtinCountBadge.textContent = `${builtinVariants.length}개`;
    builtinList.innerHTML = '';
    for (const item of builtinVariants) {
      const tag = document.createElement('span');
      tag.className = 'builtin-tag';
      tag.textContent = item;
      builtinList.appendChild(tag);
    }
  }

  function sanitizeHostInput(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return '';
    try {
      if (/^https?:\/\//i.test(trimmed)) {
        return normalizeHostname(new URL(trimmed).hostname);
      }
    } catch (_err) {
      // Fall through to plain hostname parsing
    }
    return normalizeHostname(trimmed.split('/')[0]);
  }

  async function addAutoSelectHost() {
    const host = sanitizeHostInput(autoHostInput.value);
    if (!host) return;
    const currentAuto = currentSettings.autoSelectHosts || [];
    const nextAuto = currentAuto.includes(host) ? currentAuto : [...currentAuto, host];
    const nextDisabled = (currentSettings.disabledHosts || []).filter((h) => h !== host);
    renderSettings(
      await saveSettings({
        autoSelectHosts: nextAuto,
        disabledHosts: nextDisabled
      })
    );
    autoHostInput.value = '';
  }

  async function addDisabledHost() {
    const host = sanitizeHostInput(hostInput.value);
    if (!host) return;
    const currentDisabled = currentSettings.disabledHosts || [];
    const nextDisabled = currentDisabled.includes(host)
      ? currentDisabled
      : [...currentDisabled, host];
    const nextAuto = (currentSettings.autoSelectHosts || []).filter((h) => h !== host);
    renderSettings(
      await saveSettings({
        disabledHosts: nextDisabled,
        autoSelectHosts: nextAuto
      })
    );
    hostInput.value = '';
  }

  async function addCustomVariant() {
    const val = variantInput.value.trim();
    if (!val) return;
    if (!currentSettings.customVariants.includes(val)) {
      const next = [...currentSettings.customVariants, val];
      renderSettings(await saveSettings({ customVariants: next }));
    }
    variantInput.value = '';
  }

  async function runPlaygroundTest() {
    const matcher = createMatcher(builtinVariants, {
      customVariants: currentSettings.customVariants,
      includeLanguage: currentSettings.includeLanguage,
      includeTimezone: currentSettings.includeTimezone,
      includeCurrency: currentSettings.includeCurrency
    });
    const result = await findAndSelectKorea(matcher);

    if (currentSettings.showToast) {
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
      } else {
        showToast({
          message: '국가 선택 목록을 찾지 못했습니다',
          variant: 'muted'
        });
      }
    }
  }

  function renderVirtualOptions(query) {
    const q = String(query || '').trim().toLowerCase();
    // Simulate virtualized viewport: show first 3 items when empty, filtered items when searching
    const visible = q
      ? VIRTUAL_ALL_COUNTRIES.filter((c) => c.label.toLowerCase().includes(q))
      : VIRTUAL_ALL_COUNTRIES.slice(0, 3);

    pgVirtualOptions.innerHTML = '';
    for (const country of visible) {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('data-value', country.value);
      li.textContent = country.label;
      li.addEventListener('click', () => {
        pgVirtualValue.textContent = country.label;
        pgVirtualListbox.setAttribute('hidden', '');
        pgVirtualTrigger.setAttribute('aria-expanded', 'false');
      });
      pgVirtualOptions.appendChild(li);
    }
  }

  function setupPlaygroundCombos() {
    function wireCombo(btn, listbox, labelEl) {
      btn.addEventListener('click', () => {
        const open = listbox.hasAttribute('hidden');
        listbox.toggleAttribute('hidden', !open);
        btn.setAttribute('aria-expanded', String(open));
      });
      listbox.querySelectorAll('[role="option"]').forEach((opt) => {
        opt.addEventListener('click', () => {
          if (labelEl) labelEl.textContent = opt.textContent.trim();
          listbox.setAttribute('hidden', '');
          btn.setAttribute('aria-expanded', 'false');
        });
      });
    }

    wireCombo(pgComboTrigger, pgComboListbox, pgComboValue);
    wireCombo(pgDecoyCombo, pgDecoyListbox, pgDecoyCombo.querySelector('span'));

    renderVirtualOptions('');
    pgVirtualTrigger.addEventListener('click', () => {
      const open = pgVirtualListbox.hasAttribute('hidden');
      pgVirtualListbox.toggleAttribute('hidden', !open);
      pgVirtualTrigger.setAttribute('aria-expanded', String(open));
      if (open) {
        renderVirtualOptions(pgVirtualSearchInput.value);
      }
    });
    pgVirtualSearchInput.addEventListener('input', () => {
      renderVirtualOptions(pgVirtualSearchInput.value);
    });
  }

  function resetPlayground() {
    pgCountrySelect.value = '';
    pgIsoSelect.value = '';
    pgPhoneSelect.value = '';
    pgDatalistInput.value = '';
    pgTimezoneSelect.value = '';
    pgCurrencySelect.value = '';
    pgComboValue.textContent = '-- 국가를 선택하세요 --';
    pgComboListbox.setAttribute('hidden', '');
    pgComboTrigger.setAttribute('aria-expanded', 'false');
    pgVirtualValue.textContent = '-- 검색하여 국가 선택 --';
    pgVirtualSearchInput.value = '';
    renderVirtualOptions('');
    pgVirtualListbox.setAttribute('hidden', '');
    pgVirtualTrigger.setAttribute('aria-expanded', 'false');
    pgDecoyListbox.setAttribute('hidden', '');
    pgDecoyCombo.setAttribute('aria-expanded', 'false');
    resetCycleState();
  }

  // Event listeners
  shortcutRecorder.addEventListener('click', () => setRecording(!recording));
  shortcutRecorder.addEventListener('blur', () => {
    if (recording) setRecording(false);
  });

  resetShortcutBtn.addEventListener('click', async () => {
    setRecording(false);
    renderSettings(
      await saveSettings({ customShortcut: DEFAULT_SETTINGS.customShortcut })
    );
    showShortcutStatus('기본 단축키(Shift+K)로 복원되었습니다.', 'success');
  });

  openGlobalShortcutsBtn.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    } else {
      showShortcutStatus(
        'Chrome 주소창에서 chrome://extensions/shortcuts 를 열어 변경할 수 있습니다.',
        'muted',
        3200
      );
    }
  });

  optEnabled.addEventListener('change', async () => {
    renderSettings(await saveSettings({ enabled: optEnabled.checked }));
  });

  optShowToast.addEventListener('change', async () => {
    renderSettings(await saveSettings({ showToast: optShowToast.checked }));
  });

  optIncludeLanguage.addEventListener('change', async () => {
    renderSettings(
      await saveSettings({ includeLanguage: optIncludeLanguage.checked })
    );
  });

  optIncludeTimezone.addEventListener('change', async () => {
    renderSettings(
      await saveSettings({ includeTimezone: optIncludeTimezone.checked })
    );
  });

  optIncludeCurrency.addEventListener('change', async () => {
    renderSettings(
      await saveSettings({ includeCurrency: optIncludeCurrency.checked })
    );
  });

  addAutoHostBtn.addEventListener('click', addAutoSelectHost);
  autoHostInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addAutoSelectHost();
  });

  addHostBtn.addEventListener('click', addDisabledHost);
  hostInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addDisabledHost();
  });

  addVariantBtn.addEventListener('click', addCustomVariant);
  variantInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addCustomVariant();
  });

  exportSettingsBtn.addEventListener('click', () => {
    const json = exportSettingsJson(currentSettings);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `korea-finder-settings-v${getVersion()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showBackupStatus('설정을 JSON 파일로 내보냈습니다.', 'success');
  });

  importSettingsBtn.addEventListener('click', () => {
    importSettingsFile.value = '';
    importSettingsFile.click();
  });

  importSettingsFile.addEventListener('change', async () => {
    const file = importSettingsFile.files && importSettingsFile.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const updated = await importSettingsJson(text);
      renderSettings(updated);
      showBackupStatus('설정을 성공적으로 복원했습니다.', 'success');
    } catch (err) {
      showBackupStatus(err.message || '설정을 불러오지 못했습니다.', 'error');
    }
  });

  testRunBtn.addEventListener('click', runPlaygroundTest);
  testResetBtn.addEventListener('click', resetPlayground);

  window.addEventListener(
    'keydown',
    async (e) => {
      if (recording) {
        e.preventDefault();
        e.stopPropagation();

        if (e.key === 'Escape') {
          setRecording(false);
          return;
        }

        const formatted = formatShortcutFromEvent(e);
        if (!formatted) {
          showShortcutStatus(
            'Ctrl/Alt/Shift/Meta + 영문/숫자 또는 F1~F12 키를 눌러주세요.',
            'error',
            2600
          );
          return;
        }

        renderSettings(await saveSettings({ customShortcut: formatted }));
        setRecording(false);
        showShortcutStatus(`단축키가 ${formatted}(으)로 저장되었습니다.`, 'success');
        return;
      }

      // Allow testing the active shortcut directly inside the Options playground
      const active = document.activeElement;
      if (
        active &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') &&
        active !== pgDatalistInput &&
        active !== pgVirtualSearchInput
      ) {
        return;
      }

      const combo = parseShortcut(currentSettings.customShortcut);
      if (matchesShortcut(e, combo)) {
        e.preventDefault();
        runPlaygroundTest();
      }
    },
    true
  );

  async function boot() {
    versionBadge.textContent = `v${getVersion()}`;
    setupPlaygroundCombos();
    await loadBuiltinVariants();
    renderSettings(await getSettings());
    onSettingsChanged(renderSettings);
  }

  boot();
})(globalThis);

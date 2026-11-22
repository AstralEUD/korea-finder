(function initPopup(root) {
  'use strict';

  const ns = root.KoreaFinder;
  const { MSG, DEFAULT_SETTINGS } = ns.constants;
  const {
    getSettings,
    saveSettings,
    isHostDisabled,
    isHostAutoSelect,
    toggleHostDisabled,
    toggleHostAutoSelect,
    getVersion
  } = ns.storage;
  const {
    parseShortcut,
    formatShortcutFromEvent,
    splitShortcutTokens
  } = ns.shortcut;

  const versionBadge = document.getElementById('versionBadge');
  const enabledToggle = document.getElementById('enabledToggle');
  const runBtn = document.getElementById('runBtn');
  const runShortcutKbd = document.getElementById('runShortcutKbd');
  const resultBanner = document.getElementById('resultBanner');

  const currentHostLabel = document.getElementById('currentHostLabel');
  const siteAutoToggle = document.getElementById('siteAutoToggle');
  const siteExcludeToggle = document.getElementById('siteExcludeToggle');
  const siteExcludeHint = document.getElementById('siteExcludeHint');

  const shortcutRecorder = document.getElementById('shortcutRecorder');
  const shortcutKbdPreview = document.getElementById('shortcutKbdPreview');
  const recorderStatusText = document.getElementById('recorderStatusText');
  const resetShortcutBtn = document.getElementById('resetShortcutBtn');
  const shortcutBanner = document.getElementById('shortcutBanner');

  const openOptionsBtn = document.getElementById('openOptionsBtn');
  const openGlobalShortcutsBtn = document.getElementById('openGlobalShortcutsBtn');

  let activeTab = null;
  let activeHost = '';
  let recording = false;
  let bannerTimer = null;

  function renderKeycaps(container, shortcutStr) {
    if (!container) return;
    container.innerHTML = '';
    const tokens = splitShortcutTokens(shortcutStr);
    for (const token of tokens) {
      const kbd = document.createElement('kbd');
      kbd.className = 'kf-kbd';
      kbd.textContent = token;
      container.appendChild(kbd);
    }
  }

  function showBanner(el, text, variant = 'muted', autoHideMs = 0) {
    if (!el) return;
    el.textContent = text;
    el.className = `kf-banner visible ${variant}`;
    if (autoHideMs > 0) {
      if (bannerTimer) clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => {
        el.className = 'kf-banner';
      }, autoHideMs);
    }
  }

  function isSupportedWebUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (!/^(https?|file):\/\//i.test(url)) return false;
    if (
      /^https:\/\/chromewebstore\.google\.com/i.test(url) ||
      /^https:\/\/chrome\.google\.com\/webstore/i.test(url)
    ) {
      return false;
    }
    return true;
  }

  function syncUi(settings) {
    const combo = parseShortcut(settings.customShortcut);
    enabledToggle.checked = Boolean(settings.enabled);
    renderKeycaps(runShortcutKbd, combo.raw);
    renderKeycaps(shortcutKbdPreview, combo.raw);

    if (activeHost) {
      siteExcludeToggle.checked = isHostDisabled(settings, activeHost);
      siteAutoToggle.checked = isHostAutoSelect(settings, activeHost);
    }
  }

  function setRecordingState(next) {
    recording = next;
    shortcutRecorder.classList.toggle('recording', recording);
    recorderStatusText.textContent = recording
      ? '키 조합을 누르세요 (ESC 취소)'
      : '클릭하여 변경';
  }

  async function loadCurrentTabInfo(settings) {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        activeTab = tab || null;
        if (tab?.url && isSupportedWebUrl(tab.url)) {
          const parsed = new URL(tab.url);
          activeHost = parsed.hostname || '';
          currentHostLabel.textContent = activeHost || '로컬 파일';
          siteExcludeToggle.disabled = !activeHost;
          siteAutoToggle.disabled = !activeHost;
          siteExcludeToggle.checked = activeHost
            ? isHostDisabled(settings, activeHost)
            : false;
          siteAutoToggle.checked = activeHost
            ? isHostAutoSelect(settings, activeHost)
            : false;
        } else {
          activeHost = '';
          currentHostLabel.textContent = '지원되지 않는 페이지';
          siteExcludeToggle.disabled = true;
          siteAutoToggle.disabled = true;
          siteExcludeHint.textContent =
            '브라우저 설정 및 웹 스토어 페이지에서는 사용할 수 없습니다.';
          runBtn.disabled = true;
        }
        return;
      } catch (_err) {
        // Fall through to preview mode
      }
    }

    // Preview mode when opened directly as a standalone web page
    activeHost = window.location.hostname || 'localhost';
    currentHostLabel.textContent = `${activeHost} (미리보기)`;
    siteExcludeToggle.disabled = false;
    siteAutoToggle.disabled = false;
    siteExcludeToggle.checked = isHostDisabled(settings, activeHost);
    siteAutoToggle.checked = isHostAutoSelect(settings, activeHost);
  }

  async function boot() {
    versionBadge.textContent = `v${getVersion()}`;
    const settings = await getSettings();
    syncUi(settings);
    await loadCurrentTabInfo(settings);
  }

  enabledToggle.addEventListener('change', async () => {
    const updated = await saveSettings({ enabled: enabledToggle.checked });
    syncUi(updated);
  });

  siteAutoToggle.addEventListener('change', async () => {
    if (!activeHost) return;
    const { settings } = await toggleHostAutoSelect(activeHost);
    syncUi(settings);
  });

  siteExcludeToggle.addEventListener('change', async () => {
    if (!activeHost) return;
    const { settings } = await toggleHostDisabled(activeHost);
    syncUi(settings);
  });

  runBtn.addEventListener('click', async () => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage || !activeTab?.id) {
      showBanner(
        resultBanner,
        '확장 프로그램 팝업에서 실행하면 현재 탭의 국가 목록을 선택합니다.',
        'muted',
        2600
      );
      return;
    }

    runBtn.disabled = true;
    try {
      const res = await chrome.runtime.sendMessage({
        type: MSG.RUN_FIND_KOREA,
        tabId: activeTab.id
      });
      if (res?.found) {
        const extra =
          res.totalFields > 1 ? ` (${res.cycleIndex + 1}/${res.totalFields})` : '';
        showBanner(resultBanner, `🇰🇷 ${res.label} 선택됨${extra}`, 'success');
      } else if (res?.unsupported) {
        showBanner(resultBanner, res.reason || '실행할 수 없는 페이지입니다.', 'error');
      } else {
        showBanner(
          resultBanner,
          '현재 페이지에서 국가 선택 목록을 찾지 못했습니다.',
          'muted'
        );
      }
    } catch (_err) {
      showBanner(resultBanner, '페이지와 통신하지 못했습니다. 새로고침 후 시도하세요.', 'error');
    } finally {
      runBtn.disabled = false;
    }
  });

  shortcutRecorder.addEventListener('click', () => {
    setRecordingState(!recording);
  });

  shortcutRecorder.addEventListener('blur', () => {
    if (recording) setRecordingState(false);
  });

  window.addEventListener(
    'keydown',
    async (e) => {
      if (!recording) return;
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setRecordingState(false);
        return;
      }

      const formatted = formatShortcutFromEvent(e);
      if (!formatted) {
        showBanner(
          shortcutBanner,
          'Ctrl/Alt/Shift/Meta + 영문/숫자 또는 F1~F12 키를 눌러주세요.',
          'error',
          2200
        );
        return;
      }

      const updated = await saveSettings({ customShortcut: formatted });
      syncUi(updated);
      setRecordingState(false);
      showBanner(shortcutBanner, `단축키가 ${formatted}(으)로 저장되었습니다.`, 'success', 2000);
    },
    true
  );

  resetShortcutBtn.addEventListener('click', async () => {
    const updated = await saveSettings({
      customShortcut: DEFAULT_SETTINGS.customShortcut
    });
    syncUi(updated);
    setRecordingState(false);
    showBanner(shortcutBanner, '기본 단축키(Shift+K)로 복원되었습니다.', 'success', 1800);
  });

  openOptionsBtn.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open('../options/options.html', '_blank', 'noopener');
    }
  });

  openGlobalShortcutsBtn.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    } else {
      showBanner(
        shortcutBanner,
        'Chrome 주소창에 chrome://extensions/shortcuts 를 입력해 전역 단축키를 변경할 수 있습니다.',
        'muted',
        2600
      );
    }
  });

  boot();
})(globalThis);

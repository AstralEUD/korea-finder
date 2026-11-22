if (typeof importScripts === 'function' && !globalThis.KoreaFinder) {
  importScripts('/src/shared/constants.js', '/src/shared/storage.js');
}

(function initServiceWorker(root) {
  'use strict';

  const { MSG, CONTENT_SCRIPT_FILES } = root.KoreaFinder.constants;

  const MENU_ID = 'korea-finder-select';

  function isInjectableUrl(url) {
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

  async function ensureInjected(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: [...CONTENT_SCRIPT_FILES]
      });
      return true;
    } catch (_allFramesErr) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: [...CONTENT_SCRIPT_FILES]
        });
        return true;
      } catch (topErr) {
        console.warn('Korea Finder injection error:', topErr);
        return false;
      }
    }
  }

  async function sendToFrame(tabId, message, frameId = 0) {
    try {
      return await chrome.tabs.sendMessage(tabId, message, { frameId });
    } catch (_err) {
      return null;
    }
  }

  async function runInSubframes(tabId) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: () => {
          if (window === window.top) return null;
          if (typeof globalThis.__koreaFinderRun === 'function') {
            return globalThis.__koreaFinderRun({
              manual: true,
              suppressNotFoundToast: true,
              skipTopFrame: true
            });
          }
          return null;
        }
      });

      for (const item of results || []) {
        if (item && item.result && item.result.found) {
          return item.result;
        }
      }
    } catch (_err) {
      // Ignore restricted frames
    }
    return null;
  }

  async function runFindKoreaInTab(tabId, options = {}) {
    if (!tabId) {
      return { found: false, unsupported: true, reason: '활성 탭을 찾을 수 없습니다.' };
    }

    let tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch (_err) {
      return { found: false, unsupported: true, reason: '탭 정보를 읽을 수 없습니다.' };
    }

    if (!isInjectableUrl(tab?.url)) {
      return {
        found: false,
        unsupported: true,
        reason: '브라우저 설정 및 웹 스토어 페이지에서는 실행할 수 없습니다.'
      };
    }

    const manual = options.manual !== false;
    const fromContextMenu = Boolean(options.fromContextMenu);
    const hasSpecificFrame =
      typeof options.frameId === 'number' && options.frameId >= 0;

    if (hasSpecificFrame) {
      let res = await sendToFrame(
        tabId,
        { type: MSG.FIND_KOREA, manual, fromContextMenu, suppressNotFoundToast: false },
        options.frameId
      );
      if (!res) {
        const ok = await ensureInjected(tabId);
        if (!ok) {
          return { found: false, unsupported: true, reason: '스크립트 주입에 실패했습니다.' };
        }
        res = await sendToFrame(
          tabId,
          { type: MSG.FIND_KOREA, manual, fromContextMenu, suppressNotFoundToast: false },
          options.frameId
        );
      }
      return res || { found: false };
    }

    let topRes = await sendToFrame(
      tabId,
      { type: MSG.FIND_KOREA, manual, fromContextMenu, suppressNotFoundToast: true },
      0
    );

    if (!topRes) {
      const injected = await ensureInjected(tabId);
      if (!injected) {
        return { found: false, unsupported: true, reason: '스크립트 주입에 실패했습니다.' };
      }
      topRes = await sendToFrame(
        tabId,
        { type: MSG.FIND_KOREA, manual, fromContextMenu, suppressNotFoundToast: true },
        0
      );
    }

    if (topRes && topRes.found) {
      return topRes;
    }

    const subRes = await runInSubframes(tabId);
    if (subRes && subRes.found) {
      return subRes;
    }

    await sendToFrame(
      tabId,
      {
        type: MSG.SHOW_TOAST,
        message: '국가 선택 목록을 찾지 못했습니다',
        variant: 'muted'
      },
      0
    );

    return { found: false };
  }

  function setupContextMenu() {
    if (!chrome.contextMenus) return;
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create(
        {
          id: MENU_ID,
          title: '🇰🇷 한국 자동 선택 (Korea Finder)',
          contexts: ['page', 'editable', 'frame']
        },
        () => {
          void chrome.runtime.lastError;
        }
      );
    });
  }

  chrome.runtime.onInstalled.addListener(() => {
    setupContextMenu();
  });

  if (chrome.contextMenus && chrome.contextMenus.onClicked) {
    chrome.contextMenus.onClicked.addListener((info, tab) => {
      if (info.menuItemId === MENU_ID && tab?.id) {
        runFindKoreaInTab(tab.id, {
          frameId: typeof info.frameId === 'number' ? info.frameId : undefined,
          manual: true,
          fromContextMenu: true
        });
      }
    });
  }

  if (chrome.commands && chrome.commands.onCommand) {
    chrome.commands.onCommand.addListener(async (command) => {
      if (command !== 'find-korea') return;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        runFindKoreaInTab(tab.id, { manual: true });
      }
    });
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return false;

    if (msg.type === MSG.RUN_FIND_KOREA) {
      const targetTabId = msg.tabId || sender?.tab?.id;
      if (targetTabId) {
        runFindKoreaInTab(targetTabId, { manual: true }).then(sendResponse);
      } else {
        chrome.tabs
          .query({ active: true, currentWindow: true })
          .then(([tab]) => runFindKoreaInTab(tab?.id, { manual: true }))
          .then(sendResponse);
      }
      return true;
    }

    if (msg.type === MSG.FIND_KOREA) {
      const targetTabId = sender?.tab?.id;
      if (targetTabId) {
        runFindKoreaInTab(targetTabId, { manual: true }).then(sendResponse);
      } else {
        chrome.tabs
          .query({ active: true, currentWindow: true })
          .then(([tab]) => runFindKoreaInTab(tab?.id, { manual: true }))
          .then(sendResponse);
      }
      return true;
    }

    return false;
  });
})(globalThis);

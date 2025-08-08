// background service worker

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'find-korea') {
    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      if (!tab?.id) return;
      await chrome.scripting.executeScript({
        target: {tabId: tab.id},
        files: ['contentScript.js']
      });
      await chrome.tabs.sendMessage(tab.id, {type: 'FIND_KOREA'});
    } catch (e) {
      console.error('Korea Finder error', e);
    }
  }
});

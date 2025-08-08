// background service worker

async function injectAndRun(tabId){
  if (!tabId) return;
  try {
    await chrome.scripting.executeScript({target:{tabId}, files:['contentScript.js']});
    await chrome.tabs.sendMessage(tabId, {type:'FIND_KOREA'});
  } catch(e){
    console.error('Korea Finder injection error', e);
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'find-korea') {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    injectAndRun(tab?.id);
  }
});

// Fallback: allow direct runtime.sendMessage({type:'FIND_KOREA'}) from any page
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'FIND_KOREA') {
    const tabId = sender?.tab?.id;
    if (tabId) {
      injectAndRun(tabId);
      sendResponse({ok:true, injected:true});
    } else {
      // Try active tab as fallback
      chrome.tabs.query({active:true,currentWindow:true}).then(tabs=>{
        injectAndRun(tabs[0]?.id);
      });
      sendResponse({ok:true, injected:false});
    }
    return true; // async if needed
  }
});

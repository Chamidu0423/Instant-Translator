// Simple in-memory cache to prevent spamming the API
const translationCache = new Map();

// Context Menu Setup
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "translate-selection",
    title: "Translate Selection",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "translate-selection") {
    chrome.tabs.sendMessage(tab.id, {
      action: "translate_context",
      text: info.selectionText
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "translate") {
    const cacheKey = `${request.lang}_${request.text.trim()}`;
    
    // Check Cache First
    if (translationCache.has(cacheKey)) {
      sendResponse({ translated: translationCache.get(cacheKey) });
      return true; // async
    }

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${request.lang}&dt=t&q=${encodeURIComponent(request.text)}`;
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then(data => {
        // Defensive: check structure
        let translated = '';
        if (Array.isArray(data) && Array.isArray(data[0])) {
          for (let i = 0; i < data[0].length; i++) {
            if (data[0][i][0]) {
              translated += data[0][i][0];
            }
          }
          // Save to cache on success
          if (translated !== '') {
            translationCache.set(cacheKey, translated);
            //  Limit map size to 500 items max to prevent unbounded memory growth
            if (translationCache.size > 500) {
              const firstKey = translationCache.keys().next().value;
              translationCache.delete(firstKey);
            }
          }
        } else {
          translated = '[Translation unavailable]';
        }
        sendResponse({ translated });
      })
      .catch(err => sendResponse({ error: err.message || 'Translation failed' }));
    return true; // Keep channel open for async
  }
});

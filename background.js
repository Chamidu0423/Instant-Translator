// background.js - Professionalized

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "translate") {
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
          // Google API splits long sentences by punctuation (like . or -) into multiple chunks
          // We need to iterate over all chunks to get the full translation
          for (let i = 0; i < data[0].length; i++) {
            if (data[0][i][0]) {
              translated += data[0][i][0];
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

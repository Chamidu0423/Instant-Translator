let triggerMethod = 'select';
let targetLang = 'si';
let displayMethod = 'tooltip';
let hoverTimer = null;
let popup = null;
let popupShownAt = 0;
let popupTimeout = null;
let popupRect = null;

// Load settings
chrome.storage.sync.get(['triggerMethod', 'targetLang', 'displayMethod'], (settings) => {
  if (settings.triggerMethod) triggerMethod = settings.triggerMethod;
  if (settings.targetLang) targetLang = settings.targetLang;
  if (settings.displayMethod) displayMethod = settings.displayMethod;
});

// Update settings on change
chrome.storage.onChanged.addListener((changes) => {
  if (changes.triggerMethod) triggerMethod = changes.triggerMethod.newValue;
  if (changes.targetLang) targetLang = changes.targetLang.newValue;
  if (changes.displayMethod) displayMethod = changes.displayMethod.newValue;
});

// Listener for Context Menu translations from background
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "translate_context") {
    let selection = window.getSelection();
    let rect;
    if (selection.rangeCount > 0) {
      rect = selection.getRangeAt(0).getBoundingClientRect();
    } else {
      rect = { top: window.innerHeight / 2, left: window.innerWidth / 2, bottom: window.innerHeight / 2, right: window.innerWidth / 2 };
    }
    processTranslation(msg.text, rect, selection.rangeCount > 0 ? selection.getRangeAt(0) : null);
  }
});

// Remove popup utility
function removePopup() {
    popup.classList.add('fadeout');
    setTimeout(() => { if (popup) popup.remove(); popup = null; }, 200);
    if (popupTimeout) {
      clearTimeout(popupTimeout);
      popupTimeout = null;
    }
    popupRect = null;
}

// SELECT method
function handleSelect() {
  if (triggerMethod !== 'select') return;
  let selection = window.getSelection();
  let text = selection.toString().trim();
  if (text.length > 0) {
    let range = selection.getRangeAt(0);
    if (selection.anchorNode && selection.anchorNode.parentElement && selection.anchorNode.parentElement.classList.contains('custom-inline-translation')) {
      return; 
    }
    let rect = range.getBoundingClientRect();
    processTranslation(text, rect, range);
  }
}
document.addEventListener('mouseup', handleSelect);

//HOVER method
function handleMouseMove(e) {
  if (triggerMethod !== 'hover') return;
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    let range;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(e.clientX, e.clientY);
    }
    if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
      if (range.startContainer.parentElement && range.startContainer.parentElement.classList.contains('custom-inline-translation')) {
        return; 
      }
      
      let text = range.startContainer.textContent;
      let left = text.slice(0, range.startOffset).search(/\S+$/);
      let right = text.slice(range.startOffset).search(/\s/);
      if (right < 0) right = text.length;
      else right += range.startOffset;
      
      let word = text.slice(left, right);
      
      if (word && word.trim().length > 0) {
        let hoverRange = null;
        try {
          hoverRange = document.createRange();
          hoverRange.setStart(range.startContainer, left);
          hoverRange.setEnd(range.startContainer, right);
          let rect = hoverRange.getBoundingClientRect();
          processTranslation(word, rect, hoverRange);
        } catch(err) {
          processTranslation(word, range.getBoundingClientRect());
        }
      }
    }
  }, 800);
}
document.addEventListener('mousemove', handleMouseMove);

document.addEventListener('scroll', removePopup, true);
window.addEventListener('blur', removePopup);

// Get word at cursor (Improved to remove punctuation)
function getWordAtPosition(str, pos) {
  let left = str.slice(0, pos).search(/\S+$/);
  let right = str.slice(pos).search(/\s/);
  if (right < 0) right = str.length;
  let word = str.slice(left, right + pos);
  
  // Trim common punctuation marks from ends
  return word.replace(/^[.,;:!?"'()[\]{}<>]+|[.,;:!?"'()[\]{}<>]+$/g, '').trim();
}

// Translate via background
function processTranslation(text, rect, range = null) {
  let inlineSpan = null;
  
  if (displayMethod === 'inline' && range) {
    //Prepare inline replacement
    inlineSpan = document.createElement('span');
    inlineSpan.className = 'custom-inline-translation';
    inlineSpan.dataset.originalText = text;
    inlineSpan.innerText = ' [Translating...] ';
    inlineSpan.style.cursor = 'pointer';
    inlineSpan.style.backgroundColor = 'rgba(255, 235, 59, 0.4)'; // Light yellow highlight
    inlineSpan.style.borderBottom = '1px dashed #666';
    
    try {
      range.deleteContents();
      range.insertNode(inlineSpan);
      // Clear selection so it doesnt immediately retrigger
      window.getSelection().removeAllRanges();
    } catch (e) {
      console.error("Could not insert inline node", e);
      displayMethod = 'tooltip'; // fallback
    }
  } else {
    // Tooltip method
    if (!popup) {
      showPopup('Translating...', rect, true);
    } else {
      popup.innerText = 'Translating...';
      popup.style.opacity = '0.7';
      popupRect = rect;
    }
  }
  
  chrome.runtime.sendMessage({ action: "translate", text: text.slice(0, 500), lang: targetLang }, (response) => {
    let resultText = (response && response.translated) ? response.translated : (response && response.error ? response.error : 'Translation failed');
    
    if (displayMethod === 'inline' && inlineSpan) {
      inlineSpan.innerText = ` ${resultText} `;
      inlineSpan.dataset.translatedText = ` ${resultText} `;
      inlineSpan.dataset.currentState = 'translated';
    } else {
      showPopup(resultText, rect);
    }
  });
}

// Handle click on inline translations to toggle text
document.addEventListener('click', (e) => {
  if (e.target && e.target.classList.contains('custom-inline-translation')) {
    const span = e.target;
    if (span.dataset.currentState === 'translated') {
      span.innerText = span.dataset.originalText;
      span.dataset.currentState = 'original';
      span.style.backgroundColor = 'transparent';
    } else {
      span.innerText = span.dataset.translatedText;
      span.dataset.currentState = 'translated';
      span.style.backgroundColor = 'rgba(255, 235, 59, 0.4)';
    }
    // Prevent this click from clearing tooltips or retriggering selection
    e.stopPropagation();
  }
});

// Show popup (With Dark/Light Mode and Audio support)
function showPopup(text, rect, loading = false) {
  const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const bgColor = isDark ? '#333' : '#fff';
  const textColor = isDark ? '#fff' : '#111';
  const borderColor = isDark ? '1px solid #555' : '1px solid #ddd';
  
  if (popup) {
    popup.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span>${text}</span>
        ${(!loading && text.indexOf('Translating') !== 0 && text !== 'Translation failed') ? '<span class="speak-btn" style="cursor:pointer;font-size:16px;" title="Listen">🔊</span>' : ''}
      </div>
    `;
    popup.style.opacity = loading ? '0.7' : '1';
    popup.style.top = `${Math.max(8, window.scrollY + rect.top - 48)}px`;
    popup.style.left = `${Math.max(8, window.scrollX + rect.left)}px`;
    popup.style.backgroundColor = bgColor;
    popup.style.color = textColor;
    popup.style.border = borderColor;
    popupShownAt = Date.now();
    popupRect = rect;
    setupAudio(text, loading);
    return;
  }

  popup = document.createElement('div');
  popup.id = 'custom-translator-popup';
  popup.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <span>${text}</span>
      ${!loading ? '<span class="speak-btn" style="cursor:pointer;font-size:16px;" title="Listen">🔊</span>' : ''}
    </div>
  `;
  Object.assign(popup.style, {
    position: 'absolute',
    backgroundColor: bgColor,
    color: textColor,
    border: borderColor,
    padding: '8px 12px',
    borderRadius: '8px',
    zIndex: '2147483647',
    fontSize: '15px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    pointerEvents: 'auto', // changed so user can click speaker button
    opacity: loading ? '0.7' : '1',
    transition: 'opacity 0.2s',
    top: `${Math.max(8, window.scrollY + rect.top - 48)}px`,
    left: `${Math.max(8, window.scrollX + rect.left)}px`,
    maxWidth: '320px',
    maxHeight: '120px',
    overflow: 'auto',
    wordBreak: 'break-word',
  });
  popup.className = 'custom-translator-popup';
  document.body.appendChild(popup);
  popupShownAt = Date.now();
  popupRect = rect;
  setupAudio(text, loading);
}

// Ensure audio can be played
function setupAudio(text, loading) {
  if (loading) return;
  const speakBtn = popup.querySelector('.speak-btn');
  if (speakBtn) {
    speakBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = targetLang;
      window.speechSynthesis.speak(utterance);
    });
  }
}



// Hide popup when mouse moves away from popup or selection area
document.addEventListener('mousemove', function hidePopupOnMouseOut(e) {
  if (!popup || !popupRect) return;
  
  // Add a small delay before checking to prevent instant hiding right after selection
  if (Date.now() - popupShownAt < 500) return;

  // Get mouse position
  const x = e.clientX;
  const y = e.clientY;
  
  // Popup bounding box with a small buffer area
  const popupBox = popup.getBoundingClientRect();
  const buffer = 20; // 20px buffer around the popup and selection
  
  // Selection bounding box
  const selBox = popupRect;
  
  // If mouse is NOT over popup or selection area including buffer hide
  const overPopup = x >= (popupBox.left - buffer) && x <= (popupBox.right + buffer) && 
                    y >= (popupBox.top - buffer) && y <= (popupBox.bottom + buffer);
                    
  const overSel = x >= (selBox.left - buffer) && x <= (selBox.right + buffer) && 
                  y >= (selBox.top - buffer) && y <= (selBox.bottom + buffer);
                  
  if (!overPopup && !overSel) {
    removePopup();
  }
});

// Add fadeout animation
const style = document.createElement('style');
style.textContent = `
#custom-translator-popup.fadeout {
  opacity: 0 !important;
  transition: opacity 0.2s;
}`;
document.head.appendChild(style);

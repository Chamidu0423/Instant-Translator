// popup.js - Professionalized

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(['triggerMethod', 'targetLang', 'displayMethod'], (res) => {
    if(res.triggerMethod) document.getElementById('trigger').value = res.triggerMethod;
    if(res.targetLang) document.getElementById('lang').value = res.targetLang;
    if(res.displayMethod) document.getElementById('display').value = res.displayMethod;
  });
});

document.getElementById('saveBtn').addEventListener('click', () => {
  const trigger = document.getElementById('trigger').value;
  const lang = document.getElementById('lang').value;
  const display = document.getElementById('display').value;
  chrome.storage.sync.set({ triggerMethod: trigger, targetLang: lang, displayMethod: display }, () => {
    const status = document.getElementById('statusMsg');
    status.style.display = 'block';
    setTimeout(() => {
      status.style.display = 'none';
      window.close();
    }, 800);
  });
});

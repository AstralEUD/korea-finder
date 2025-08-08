// Options page script for Korea Finder

const shortcutInput = document.getElementById('shortcutInput');
const saveBtn = document.getElementById('saveBtn');
const statusEl = document.getElementById('status');
const variantsTa = document.getElementById('variants');

(async function loadVariants() {
  try {
    const url = chrome.runtime.getURL('data/koreaVariants.json');
    const res = await fetch(url);
    const arr = await res.json();
    variantsTa.value = arr.join('\n');
  } catch (e) {
    variantsTa.value = '로드 실패';
  }
})();

chrome.storage.sync.get({customShortcut: ''}, ({customShortcut}) => {
  if (customShortcut) shortcutInput.value = customShortcut;});

function validateShortcut(str) {
  if (!str) return true; // empty = use default
  const parts = str.split('+');
  if (!parts.length) return false;
  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1).map(p => p.toLowerCase());
  const validMod = ['ctrl','alt','shift','meta'];
  if (modifiers.some(m => !validMod.includes(m.toLowerCase()))) return false;
  if (!/^[a-z]$/i.test(key) && !/^F([1-9]|1[0-2])$/i.test(key)) return false;
  return true;
}

saveBtn.addEventListener('click', () => {
  const val = shortcutInput.value.trim();
  if (!validateShortcut(val)) {
    statusEl.textContent = '잘못된 형식입니다.';
    statusEl.style.color = '#c00';
    return;
  }
  chrome.storage.sync.set({customShortcut: val}, () => {
    statusEl.textContent = '저장 완료';
    statusEl.style.color = '#0a7';
    setTimeout(() => statusEl.textContent = '', 2000);
  });
});

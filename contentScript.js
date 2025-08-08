// Content script to search and select Korea in common country dropdown/select or autocomplete lists
// Added direct key listener for Shift+K because Chrome commands disallow plain Shift+K in manifest.

async function loadVariants() {
  try {
    const url = chrome.runtime.getURL('data/koreaVariants.json');
    const res = await fetch(url);
    const arr = await res.json();
    return Array.from(new Set(arr.map(v => v.trim()).filter(Boolean)));
  } catch (e) {
    console.warn('Failed to load koreaVariants', e);
    return ['South Korea','Republic of Korea','Korea (South)','Korea','대한민국','한국'];
  }
}

// Normalize text for comparison
function norm(t) {
  return t
    .toLowerCase()
    .replace(/\u00A0/g, ' ')
    .replace(/[^a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ]+/g, ' ') // keep basic
    .replace(/\s+/g, ' ') // collapse
    .trim();
}

function scoreMatch(optionText, variantsNorm) {
  const n = norm(optionText);
  if (!n) return 0;
  // exact
  if (variantsNorm.has(n)) return 1000;
  // partial heuristics
  if (/korea/.test(n)) {
    let s = 100;
    if (/south/.test(n)) s += 50;
    if (/republic/.test(n)) s += 40;
    return s;
  }
  if (/대한민국|한국/.test(optionText)) return 900;
  return 0;
}

function selectHtmlSelect(selectEl, variantsNorm) {
  let best = {score: 0, index: -1};
  const options = Array.from(selectEl.options);
  options.forEach((opt, idx) => {
    const s = scoreMatch(opt.textContent || '', variantsNorm);
    if (s > best.score) best = {score: s, index: idx};
  });
  if (best.index >= 0) {
    selectEl.selectedIndex = best.index;
    selectEl.dispatchEvent(new Event('change', {bubbles: true}));
    selectEl.scrollIntoView({block: 'center', behavior: 'smooth'});
    flash(selectEl.options[best.index]);
    return true;
  }
  return false;
}

function flash(el) {
  const originalOutline = el.style.outline;
  el.style.outline = '3px solid #2d9bef';
  setTimeout(() => { el.style.outline = originalOutline; }, 1500);
}

function findMatchingDataList(variantsNorm) {
  const inputs = document.querySelectorAll('input[list]');
  for (const input of inputs) {
    const listId = input.getAttribute('list');
    if (!listId) continue;
    const dl = document.getElementById(listId);
    if (!dl) continue;
    let best = {score: 0, opt: null};
    dl.querySelectorAll('option').forEach(opt => {
      const s = scoreMatch(opt.value || opt.textContent || '', variantsNorm);
      if (s > best.score) best = {score: s, opt};
    });
    if (best.opt) {
      input.value = best.opt.value || best.opt.textContent;
      input.dispatchEvent(new Event('input', {bubbles: true}));
      flash(input);
      input.scrollIntoView({block: 'center', behavior: 'smooth'});
      return true;
    }
  }
  return false;
}

function findAriaCombobox(variantsNorm) {
  // Common pattern: role="combobox" with listbox
  const comboCandidates = document.querySelectorAll('[role="combobox"], [aria-haspopup="listbox"]');
  for (const el of comboCandidates) {
    // Try to open if closed
    el.click();
    const listboxId = el.getAttribute('aria-controls');
    let listbox = listboxId ? document.getElementById(listboxId) : null;
    if (!listbox) {
      listbox = document.querySelector('[role="listbox"]');
    }
    if (!listbox) continue;
    let best = {score: 0, item: null};
    listbox.querySelectorAll('[role="option"], li, div').forEach(item => {
      const txt = item.textContent || '';
      const s = scoreMatch(txt, variantsNorm);
      if (s > best.score) best = {score: s, item};
    });
    if (best.item) {
      best.item.scrollIntoView({block: 'center', behavior: 'smooth'});
      flash(best.item);
      best.item.click();
      return true;
    }
  }
  return false;
}

async function findAndSelectKorea() {
  const variants = await loadVariants();
  const variantsNorm = new Set(variants.map(v => norm(v)));

  // 1. Active / focused select first
  const active = document.activeElement;
  if (active && active.tagName === 'SELECT') {
    if (selectHtmlSelect(active, variantsNorm)) return true;
  }

  // 2. All select elements (heuristic: visible & many country options)
  const selects = Array.from(document.querySelectorAll('select')).filter(s => s.offsetParent !== null);
  for (const sel of selects) {
    if (selectHtmlSelect(sel, variantsNorm)) return true;
  }

  // 3. datalist
  if (findMatchingDataList(variantsNorm)) return true;

  // 4. ARIA combobox / listbox patterns
  if (findAriaCombobox(variantsNorm)) return true;

  // 5. Fallback: try inputs with autocomplete country style lists
  const inputs = document.querySelectorAll('input[type="text"], input:not([type])');
  for (const input of inputs) {
    const placeholder = (input.getAttribute('placeholder') || '').toLowerCase();
    if (/country|국가|나라/.test(placeholder)) {
      input.focus();
      input.value = variants[0];
      input.dispatchEvent(new Event('input', {bubbles: true}));
      flash(input);
      return true;
    }
  }

  console.info('Korea Finder: no suitable element found');
  return false;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'FIND_KOREA') {
    findAndSelectKorea().then(found => sendResponse({found}));
    return true; // async
  }
});

// Dynamic keyboard shortcut binding
(function setupDynamicShortcut(){
  if (window.__koreaFinderDynamicKeybound) return;
  window.__koreaFinderDynamicKeybound = true;
  let currentCombo = {raw: 'Shift+K'}; // default page-level

  function parseCombo(str){
    if (!str) return {raw: 'Shift+K', shift: true, key: 'k'};
    const parts = str.split('+');
    const last = parts[parts.length-1];
    const combo = {raw: str, ctrl:false, alt:false, shift:false, meta:false, key:last.toLowerCase()};
    parts.slice(0,-1).forEach(p=>{const m=p.toLowerCase(); if(m==='ctrl') combo.ctrl=true; if(m==='alt') combo.alt=true; if(m==='shift') combo.shift=true; if(m==='meta') combo.meta=true;});
    if (last.toUpperCase().startsWith('F')) combo.key = last.toUpperCase();
    return combo;
  }

  function matches(e, combo){
    if (!combo) return false;
    if (!!combo.ctrl !== e.ctrlKey) return false;
    if (!!combo.alt !== e.altKey) return false;
    if (!!combo.shift !== e.shiftKey) return false;
    if (!!combo.meta !== e.metaKey) return false;
    const key = combo.key;
    if (/^F([1-9]|1[0-2])$/.test(key)) return e.key.toUpperCase() === key;
    return e.key.toLowerCase() === key;
  }

  function handler(e){
    if (matches(e, currentCombo)) {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      const editable = document.activeElement && (document.activeElement.isContentEditable || /^(INPUT|TEXTAREA)$/i.test(tag));
      if (editable) return; // don't hijack typing fields
      findAndSelectKorea();
      e.preventDefault();
    }
  }

  window.addEventListener('keydown', handler, true);

  function loadShortcut(){
    chrome.storage?.sync.get({customShortcut:''}, ({customShortcut}) => {
      currentCombo = parseCombo(customShortcut);
    });
  }
  loadShortcut();
  // Listen to storage changes (another tab options updated)
  chrome.storage?.onChanged?.addListener(changes => {
    if (changes.customShortcut) loadShortcut();
  });
})();

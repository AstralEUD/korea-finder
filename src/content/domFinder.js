(function registerDomFinder(root) {
  'use strict';

  const ns = (root.KoreaFinder = root.KoreaFinder || {});
  const { scoreFieldContext, scoreOption } = ns.matcher;
  const { highlightElement } = ns.toast;

  const OPTION_SCORE_THRESHOLD = 450;
  const CYCLE_TTL_MS = 5000;

  let cycleState = {
    timestamp: 0,
    lastElement: null,
    index: 0
  };

  function resetCycleState() {
    cycleState = { timestamp: 0, lastElement: null, index: 0 };
  }

  function isElementVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    if (
      el.hidden ||
      el.getAttribute('aria-hidden') === 'true' ||
      (typeof el.closest === 'function' && el.closest('[hidden], [aria-hidden="true"]'))
    ) {
      return false;
    }

    if (typeof el.checkVisibility === 'function') {
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
        return false;
      }
    } else {
      const style = window.getComputedStyle(el);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        parseFloat(style.opacity) === 0
      ) {
        return false;
      }
    }

    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getDeepActiveElement(doc = document) {
    let active = doc.activeElement;
    while (active && active.shadowRoot && active.shadowRoot.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    return active;
  }

  function isPreferredElement(el, preferredTarget) {
    if (!el || !preferredTarget || !(preferredTarget instanceof Element)) {
      return false;
    }
    if (
      el === preferredTarget ||
      el.contains(preferredTarget) ||
      preferredTarget.contains(el)
    ) {
      return true;
    }
    const itiRoot = preferredTarget.closest && preferredTarget.closest('.iti');
    if (itiRoot && itiRoot.contains(el)) {
      return true;
    }
    const labelEl = preferredTarget.closest && preferredTarget.closest('label');
    if (labelEl) {
      if (labelEl.contains(el)) return true;
      const forId = labelEl.getAttribute('for');
      if (forId && el.id === forId) return true;
    }
    return false;
  }

  function querySelectorAllDeep(selector, rootNode = document, maxDepth = 4) {
    const results = [];
    const seen = new WeakSet();

    function collect(node, depth) {
      if (!node || depth > maxDepth) return;

      if (typeof node.querySelectorAll === 'function') {
        const matched = node.querySelectorAll(selector);
        for (const el of matched) {
          if (!seen.has(el)) {
            seen.add(el);
            results.push(el);
          }
        }
      }

      if (depth >= maxDepth) return;

      const scanRoot = node === document ? document.documentElement || document.body : node;
      if (!scanRoot || typeof document.createTreeWalker !== 'function') return;

      const walker = document.createTreeWalker(scanRoot, NodeFilter.SHOW_ELEMENT);
      let cur = walker.currentNode;
      while (cur) {
        if (cur.shadowRoot) {
          collect(cur.shadowRoot, depth + 1);
        }
        cur = walker.nextNode();
      }
    }

    collect(rootNode, 0);
    return results;
  }

  function simulateClick(el) {
    if (!el || typeof el.dispatchEvent !== 'function') return;
    const common = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: typeof window !== 'undefined' ? window : undefined
    };

    if (typeof PointerEvent === 'function') {
      el.dispatchEvent(
        new PointerEvent('pointerdown', { ...common, pointerId: 1, isPrimary: true })
      );
    }
    if (typeof MouseEvent === 'function') {
      el.dispatchEvent(new MouseEvent('mousedown', common));
    }
    if (typeof PointerEvent === 'function') {
      el.dispatchEvent(
        new PointerEvent('pointerup', { ...common, pointerId: 1, isPrimary: true })
      );
    }
    if (typeof MouseEvent === 'function') {
      el.dispatchEvent(new MouseEvent('mouseup', common));
    }

    if (typeof el.click === 'function') {
      el.click();
    } else if (typeof MouseEvent === 'function') {
      el.dispatchEvent(new MouseEvent('click', common));
    }
  }

  function setNativeSelectIndex(selectEl, index) {
    const opt = selectEl.options[index];
    if (!opt) return;

    const setter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      'value'
    )?.set;

    if (setter && opt.value !== undefined) {
      setter.call(selectEl, opt.value);
    }
    selectEl.selectedIndex = index;

    selectEl.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    selectEl.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  function setNativeInputValue(inputEl, value) {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )?.set;
    if (setter) {
      setter.call(inputEl, value);
    } else {
      inputEl.value = value;
    }
    inputEl.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  function getLeafOptionItems(container) {
    const rawItems = Array.from(
      container.querySelectorAll(
        '[role="option"], [role="menuitem"], [role="menuitemradio"], [data-country-code], [data-iso], li'
      )
    );
    return rawItems.filter((item) => {
      if (!isElementVisible(item)) return false;
      // Exclude outer wrapper elements that contain child option/list items
      const nestedOption = item.querySelector(
        '[role="option"], [role="menuitem"], [role="menuitemradio"], [data-country-code], [data-iso], li'
      );
      return !nestedOption;
    });
  }

  function findBestOptionInItems(items, matcher, fieldContext, optionCount) {
    let best = { score: 0, item: null, label: '' };
    const totalCount = optionCount || items.length;

    for (const item of items) {
      if (item.disabled || item.getAttribute('aria-disabled') === 'true') {
        continue;
      }
      const text = (
        item.textContent ||
        item.getAttribute('aria-label') ||
        item.getAttribute('title') ||
        ''
      ).trim();
      const value =
        item.getAttribute('value') ||
        item.getAttribute('data-value') ||
        item.getAttribute('data-code') ||
        '';
      const countryCode =
        item.getAttribute('data-country-code') ||
        item.getAttribute('data-iso') ||
        '';
      const dialCode = item.getAttribute('data-dial-code') || '';

      const s = scoreOption(
        {
          text,
          value,
          countryCode,
          dialCode,
          fieldContext,
          optionCount: totalCount
        },
        matcher
      );
      if (s > best.score) {
        best = { score: s, item, label: text || value || countryCode };
      }
    }

    return best.score >= OPTION_SCORE_THRESHOLD ? best : null;
  }

  function tryOpenListboxes(matcher, preferredTarget = null) {
    const listboxes = querySelectorAllDeep(
      '[role="listbox"], [role="menu"], .iti__country-list'
    ).filter(isElementVisible);

    for (const lb of listboxes) {
      if (preferredTarget && !isPreferredElement(lb, preferredTarget)) {
        continue;
      }
      const items = getLeafOptionItems(lb);
      if (!items.length) continue;
      const best = findBestOptionInItems(items, matcher, null, items.length);
      if (best && best.item) {
        best.item.scrollIntoView({ block: 'center', behavior: 'smooth' });
        highlightElement(best.item);
        simulateClick(best.item);
        return {
          found: true,
          label: best.label,
          fieldType: 'listbox',
          cycleIndex: 0,
          totalFields: 1
        };
      }
    }
    return null;
  }

  function findSearchInputForCombobox(comboEl, listbox) {
    if (
      comboEl &&
      comboEl.tagName === 'INPUT' &&
      !comboEl.readOnly &&
      !comboEl.disabled
    ) {
      return comboEl;
    }

    const inputSelector =
      'input[type="text"], input[type="search"], input:not([type]), [role="searchbox"]';

    if (comboEl && typeof comboEl.querySelector === 'function') {
      const inner = comboEl.querySelector(inputSelector);
      if (inner && isElementVisible(inner) && !inner.readOnly) return inner;
    }

    if (listbox && typeof listbox.querySelector === 'function') {
      const inList = listbox.querySelector(inputSelector);
      if (inList && isElementVisible(inList) && !inList.readOnly) return inList;
    }

    const parent = comboEl && comboEl.parentElement;
    if (parent && typeof parent.querySelector === 'function') {
      const sibling = parent.querySelector(inputSelector);
      if (sibling && isElementVisible(sibling) && !sibling.readOnly) return sibling;
    }

    return null;
  }

  function resolveListboxForCombobox(comboEl, preExistingSet) {
    const ctrlId =
      comboEl.getAttribute('aria-controls') || comboEl.getAttribute('aria-owns');
    if (ctrlId) {
      const rootNode = comboEl.getRootNode();
      for (const id of ctrlId.trim().split(/\s+/)) {
        const target =
          (rootNode && typeof rootNode.getElementById === 'function'
            ? rootNode.getElementById(id)
            : null) || document.getElementById(id);
        if (target && isElementVisible(target)) {
          return target;
        }
      }
    }

    const visibleNow = querySelectorAllDeep(
      '[role="listbox"], [role="menu"], .iti__country-list'
    ).filter(isElementVisible);
    for (const lb of visibleNow) {
      if (!preExistingSet.has(lb)) {
        return lb;
      }
    }
    return null;
  }

  function waitForListboxOrSearch(comboEl, preExistingSet, timeoutMs = 300) {
    return new Promise((resolve) => {
      function readyListbox() {
        const lb = resolveListboxForCombobox(comboEl, preExistingSet);
        if (!lb) return null;
        if (
          getLeafOptionItems(lb).length > 0 ||
          findSearchInputForCombobox(comboEl, lb)
        ) {
          return lb;
        }
        return null;
      }

      const immediate = readyListbox();
      if (immediate) {
        resolve(immediate);
        return;
      }

      let done = false;
      let observer = null;
      let timer = null;
      let poll = null;

      function finish(result) {
        if (done) return;
        done = true;
        if (observer) observer.disconnect();
        if (timer) clearTimeout(timer);
        if (poll) clearInterval(poll);
        resolve(result);
      }

      function check() {
        const lb = readyListbox();
        if (lb) finish(lb);
      }

      if (typeof MutationObserver === 'function' && document.body) {
        observer = new MutationObserver(check);
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['aria-expanded', 'aria-hidden', 'style', 'class', 'hidden']
        });
      }

      poll = setInterval(check, 40);
      timer = setTimeout(() => finish(resolveListboxForCombobox(comboEl, preExistingSet)), timeoutMs);
    });
  }

  function waitForMatchingOptionInListbox(
    comboEl,
    preExistingSet,
    matcher,
    fieldContext,
    timeoutMs = 260
  ) {
    return new Promise((resolve) => {
      function findNow() {
        const lb = resolveListboxForCombobox(comboEl, preExistingSet);
        if (!lb) return null;
        const items = getLeafOptionItems(lb);
        if (!items.length) return null;
        return findBestOptionInItems(items, matcher, fieldContext, items.length);
      }

      const immediate = findNow();
      if (immediate) {
        resolve(immediate);
        return;
      }

      let done = false;
      let observer = null;
      let timer = null;
      let poll = null;

      function finish(result) {
        if (done) return;
        done = true;
        if (observer) observer.disconnect();
        if (timer) clearTimeout(timer);
        if (poll) clearInterval(poll);
        resolve(result);
      }

      function check() {
        const match = findNow();
        if (match) finish(match);
      }

      if (typeof MutationObserver === 'function' && document.body) {
        observer = new MutationObserver(check);
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true
        });
      }

      poll = setInterval(check, 40);
      timer = setTimeout(() => finish(null), timeoutMs);
    });
  }

  async function applyComboboxCandidate(candidate, matcher) {
    const el = candidate.element;
    const preExisting = new Set(
      querySelectorAllDeep(
        '[role="listbox"], [role="menu"], .iti__country-list'
      ).filter(isElementVisible)
    );

    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus({ preventScroll: true });
    simulateClick(el);

    const listbox = await waitForListboxOrSearch(el, preExisting, 300);
    if (listbox) {
      const items = getLeafOptionItems(listbox);
      const best = findBestOptionInItems(items, matcher, candidate.ctx, items.length);
      if (best && best.item) {
        best.item.scrollIntoView({ block: 'center', behavior: 'smooth' });
        simulateClick(best.item);
        highlightElement(el);
        return { matched: true, label: best.label };
      }
    }

    // Typeahead / virtualized combobox fallback: filter options via search input
    const searchInput = findSearchInputForCombobox(el, listbox);
    if (searchInput) {
      const prevValue = searchInput.value || '';
      const queries = ['South Korea', '대한민국'];
      for (const query of queries) {
        searchInput.focus({ preventScroll: true });
        setNativeInputValue(searchInput, query);
        searchInput.dispatchEvent(
          new KeyboardEvent('keyup', { key: 'a', bubbles: true })
        );

        const match = await waitForMatchingOptionInListbox(
          el,
          preExisting,
          matcher,
          candidate.ctx,
          260
        );
        if (match && match.item) {
          match.item.scrollIntoView({ block: 'center', behavior: 'smooth' });
          simulateClick(match.item);
          highlightElement(el);
          return { matched: true, label: match.label };
        }
      }

      // Restore search value when nothing matched
      setNativeInputValue(searchInput, prevValue);
    }

    // Close unrelated or unmatched combobox cleanly
    el.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        bubbles: true
      })
    );
    return { matched: false };
  }

  function collectSyncCandidates(matcher, activeEl, preferredTarget) {
    const candidates = [];

    // 1. Native <select> elements
    const selects = querySelectorAllDeep('select').filter(isElementVisible);
    for (const sel of selects) {
      const fieldContext = scoreFieldContext(sel);
      const options = Array.from(sel.options);
      let best = { score: 0, index: -1, label: '' };

      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        if (opt.disabled) continue;
        const text = (opt.textContent || opt.label || '').trim();
        const s = scoreOption(
          {
            text,
            value: opt.value,
            fieldContext,
            optionCount: options.length
          },
          matcher
        );
        if (s > best.score) {
          best = { score: s, index: i, label: text || opt.value };
        }
      }

      if (best.index >= 0 && best.score >= OPTION_SCORE_THRESHOLD) {
        const priority =
          best.score +
          fieldContext.countryScore +
          fieldContext.phoneScore +
          fieldContext.timezoneScore +
          fieldContext.currencyScore +
          (sel === activeEl ? 250 : 0) +
          (isPreferredElement(sel, preferredTarget) ? 600 : 0);

        candidates.push({
          type: 'select',
          element: sel,
          priority,
          label: best.label,
          apply: async () => {
            setNativeSelectIndex(sel, best.index);
            sel.scrollIntoView({ block: 'center', behavior: 'smooth' });
            highlightElement(sel);
            return { matched: true, label: best.label };
          }
        });
      }
    }

    // 2. <input list="..."> with <datalist>
    const listInputs = querySelectorAllDeep('input[list]').filter(isElementVisible);
    for (const input of listInputs) {
      const listId = input.getAttribute('list');
      if (!listId) continue;
      const rootNode = input.getRootNode();
      const dl =
        (rootNode && typeof rootNode.getElementById === 'function'
          ? rootNode.getElementById(listId)
          : null) || document.getElementById(listId);
      if (!dl) continue;

      const fieldContext = scoreFieldContext(input);
      const options = Array.from(dl.querySelectorAll('option'));
      let best = { score: 0, opt: null, label: '' };

      for (const opt of options) {
        if (opt.disabled) continue;
        const text = (opt.textContent || opt.label || opt.value || '').trim();
        const s = scoreOption(
          {
            text,
            value: opt.value,
            fieldContext,
            optionCount: options.length
          },
          matcher
        );
        if (s > best.score) {
          best = { score: s, opt, label: opt.value || text };
        }
      }

      if (best.opt && best.score >= OPTION_SCORE_THRESHOLD) {
        const val = best.opt.value || best.opt.textContent.trim();
        const priority =
          best.score +
          fieldContext.countryScore +
          fieldContext.phoneScore +
          fieldContext.timezoneScore +
          fieldContext.currencyScore +
          (input === activeEl ? 250 : 0) +
          (isPreferredElement(input, preferredTarget) ? 600 : 0);

        candidates.push({
          type: 'datalist',
          element: input,
          priority,
          label: val,
          apply: async () => {
            setNativeInputValue(input, val);
            input.scrollIntoView({ block: 'center', behavior: 'smooth' });
            highlightElement(input);
            return { matched: true, label: val };
          }
        });
      }
    }

    return candidates;
  }

  function collectComboboxCandidates(matcher, activeEl, preferredTarget) {
    const allCombos = querySelectorAllDeep(
      '[role="combobox"], [aria-haspopup="listbox"], .iti__selected-flag, .iti__selected-country'
    ).filter(isElementVisible);

    const eligible = [];
    for (const el of allCombos) {
      const ctx = scoreFieldContext(el);
      const isFocused = el === activeEl;
      const isPreferred = isPreferredElement(el, preferredTarget);
      if (!isFocused && !isPreferred && !ctx.isRelevantLikely) {
        continue;
      }

      const priority =
        800 +
        ctx.countryScore +
        ctx.phoneScore +
        ctx.timezoneScore +
        ctx.currencyScore +
        (isFocused ? 350 : 0) +
        (isPreferred ? 600 : 0);

      const candidate = {
        type: 'combobox',
        element: el,
        ctx,
        priority
      };
      candidate.apply = () => applyComboboxCandidate(candidate, matcher);
      eligible.push(candidate);
    }

    return eligible;
  }

  function tryTextInputFallback(activeEl, preferredTarget) {
    const inputs = querySelectorAllDeep(
      'input[type="text"], input[type="search"], input:not([type])'
    ).filter(
      (el) =>
        isElementVisible(el) &&
        !el.readOnly &&
        !el.hasAttribute('list') &&
        el.getAttribute('role') !== 'combobox'
    );

    const candidates = [];
    for (const input of inputs) {
      const ctx = scoreFieldContext(input);
      const ac = (input.getAttribute('autocomplete') || '').toLowerCase();
      const isPreferred = isPreferredElement(input, preferredTarget);
      if (ctx.countryScore >= 25 || /\bcountry\b/.test(ac)) {
        candidates.push({
          element: input,
          isPreferred,
          priority:
            ctx.countryScore +
            (input === activeEl ? 250 : 0) +
            (isPreferred ? 600 : 0)
        });
      }
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => b.priority - a.priority);

    const target = candidates[0].element;
    const pageLang = (document.documentElement.lang || '').toLowerCase();
    const fillVal = pageLang.startsWith('ko') ? '대한민국' : 'South Korea';

    target.focus();
    setNativeInputValue(target, fillVal);
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    highlightElement(target);

    return {
      found: true,
      label: fillVal,
      fieldType: 'text',
      cycleIndex: 0,
      totalFields: candidates.length
    };
  }

  async function findAndSelectKorea(matcher, options = {}) {
    if (!matcher) return { found: false };

    const preferredTarget = options.preferredTarget || null;
    const activeEl = getDeepActiveElement();

    // 1. Prioritize already-open listbox or menu overlays
    const openResult = tryOpenListboxes(matcher, preferredTarget);
    if (openResult) return openResult;

    // 2. If user explicitly right-clicked a text country input, populate it directly
    if (preferredTarget) {
      const directText = tryTextInputFallback(activeEl, preferredTarget);
      if (
        directText &&
        isPreferredElement(getDeepActiveElement(), preferredTarget)
      ) {
        return directText;
      }
    }

    // 3. Collect all synchronous & ARIA combobox candidates for unified cycling
    const candidates = [
      ...collectSyncCandidates(matcher, activeEl, preferredTarget),
      ...collectComboboxCandidates(matcher, activeEl, preferredTarget)
    ];
    candidates.sort((a, b) => b.priority - a.priority);

    if (candidates.length > 0) {
      const now = Date.now();
      const isRecentCycle =
        !preferredTarget &&
        now - cycleState.timestamp < CYCLE_TTL_MS &&
        candidates.length > 1 &&
        candidates.some((c) => c.element === cycleState.lastElement);

      let startIdx = 0;
      if (isRecentCycle) {
        const lastIdx = candidates.findIndex(
          (c) => c.element === cycleState.lastElement
        );
        startIdx = (lastIdx + 1) % candidates.length;
      }

      for (let offset = 0; offset < candidates.length; offset++) {
        const idx = (startIdx + offset) % candidates.length;
        const chosen = candidates[idx];
        const outcome = await chosen.apply();
        if (outcome && outcome.matched) {
          cycleState = {
            timestamp: now,
            lastElement: chosen.element,
            index: idx
          };

          return {
            found: true,
            label: outcome.label || chosen.label,
            fieldType: chosen.type,
            cycleIndex: idx,
            totalFields: candidates.length
          };
        }
      }
    }

    // 4. Fallback to country text input
    const textResult = tryTextInputFallback(activeEl, preferredTarget);
    if (textResult) return textResult;

    return { found: false };
  }

  ns.domFinder = Object.freeze({
    isElementVisible,
    querySelectorAllDeep,
    simulateClick,
    findAndSelectKorea,
    resetCycleState
  });
})(globalThis);

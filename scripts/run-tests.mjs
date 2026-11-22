#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildTargetManifest } from './package.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function collectJsFiles(relDir) {
  const abs = path.join(ROOT_DIR, relDir);
  const files = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.posix.join(relDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsFiles(rel));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(rel);
    }
  }
  return files;
}

function validateManifestAndFiles() {
  const baseManifest = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, 'manifest.json'), 'utf8')
  );
  const pkg = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8')
  );

  assert.equal(baseManifest.manifest_version, 3, 'manifest_version must be 3');
  assert.equal(baseManifest.version, pkg.version, 'manifest.json and package.json versions must match');

  for (const iconPath of Object.values(baseManifest.icons || {})) {
    assert.ok(fs.existsSync(path.join(ROOT_DIR, iconPath)), `Missing icon: ${iconPath}`);
  }
  assert.ok(
    fs.existsSync(path.join(ROOT_DIR, baseManifest.action.default_popup)),
    'Missing default_popup'
  );
  assert.ok(
    fs.existsSync(path.join(ROOT_DIR, baseManifest.options_ui.page)),
    'Missing options_ui.page'
  );
  assert.ok(
    fs.existsSync(path.join(ROOT_DIR, baseManifest.background.service_worker)),
    'Missing background.service_worker'
  );

  for (const cs of baseManifest.content_scripts || []) {
    for (const jsFile of cs.js || []) {
      assert.ok(fs.existsSync(path.join(ROOT_DIR, jsFile)), `Missing content_script: ${jsFile}`);
    }
  }

  for (const war of baseManifest.web_accessible_resources || []) {
    for (const res of war.resources || []) {
      assert.ok(fs.existsSync(path.join(ROOT_DIR, res)), `Missing web_accessible_resource: ${res}`);
    }
  }

  const ffManifest = buildTargetManifest(baseManifest, 'firefox');
  assert.ok(Array.isArray(ffManifest.background.scripts), 'Firefox manifest must have background.scripts');
  assert.ok(ffManifest.browser_specific_settings?.gecko?.id, 'Firefox manifest must have gecko id');
  for (const s of ffManifest.background.scripts) {
    assert.ok(fs.existsSync(path.join(ROOT_DIR, s)), `Missing Firefox background script: ${s}`);
  }

  const variants = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, 'data/koreaVariants.json'), 'utf8')
  );
  assert.ok(Array.isArray(variants) && variants.length >= 40, 'koreaVariants.json must be non-empty array');

  for (const jsRel of [...collectJsFiles('src'), ...collectJsFiles('tests')]) {
    const code = fs.readFileSync(path.join(ROOT_DIR, jsRel), 'utf8');
    new vm.Script(code, { filename: jsRel });
  }
}

// Lightweight DOM & Browser Environment for executing tests/test-suite.js directly in Node
function createDomEnvironment() {
  class MiniEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.bubbles = Boolean(init.bubbles);
      this.cancelable = Boolean(init.cancelable);
      this.composed = Boolean(init.composed);
      this.target = null;
      this.currentTarget = null;
      this._stopped = false;
      this._defaultPrevented = false;
      Object.assign(this, init);
    }
    stopPropagation() {
      this._stopped = true;
    }
    preventDefault() {
      this._defaultPrevented = true;
    }
  }

  class MiniClassList {
    constructor(el) {
      this.el = el;
    }
    _list() {
      return (this.el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
    }
    add(...tokens) {
      const set = new Set(this._list());
      for (const t of tokens) set.add(t);
      this.el.setAttribute('class', Array.from(set).join(' '));
    }
    remove(...tokens) {
      const set = new Set(this._list());
      for (const t of tokens) set.delete(t);
      this.el.setAttribute('class', Array.from(set).join(' '));
    }
    contains(token) {
      return this._list().includes(token);
    }
    toggle(token, force) {
      const has = this.contains(token);
      const next = force === undefined ? !has : Boolean(force);
      if (next) this.add(token);
      else this.remove(token);
      return next;
    }
  }

  function parseHtmlInto(parent, html, ownerDocument) {
    parent.childNodes = [];
    const stack = [parent];
    const voidTags = new Set(['input', 'br', 'hr', 'img', 'meta', 'link']);
    const tokenRe = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9-]+)\s*>|<([a-zA-Z0-9-]+)((?:\s+[^<>]*?)?)\s*(\/?)>|([^<]+)/g;
    let match;

    while ((match = tokenRe.exec(html)) !== null) {
      if (match[0].startsWith('<!--')) continue;
      if (match[1]) {
        const closing = match[1].toUpperCase();
        while (stack.length > 1) {
          const top = stack.pop();
          if (top.tagName === closing) break;
        }
      } else if (match[2]) {
        const tag = match[2].toLowerCase();
        const attrStr = match[3] || '';
        const selfClose = Boolean(match[4]) || voidTags.has(tag);
        const el = ownerDocument.createElement(tag);
        const attrRe = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
        let am;
        while ((am = attrRe.exec(attrStr)) !== null) {
          const key = am[1];
          const val = am[2] ?? am[3] ?? am[4] ?? '';
          el.setAttribute(key, val);
        }
        stack[stack.length - 1].appendChild(el);
        if (!selfClose) {
          stack.push(el);
        }
      } else if (match[5]) {
        const text = match[5];
        if (text.trim() || stack[stack.length - 1].childNodes.length >= 0) {
          stack[stack.length - 1].appendChild(new MiniTextNode(text, ownerDocument));
        }
      }
    }
  }

  function matchesSimpleSelector(el, sel) {
    let rest = sel.trim();
    if (!rest) return false;

    const notMatch = rest.match(/:not\(\[([a-zA-Z0-9_-]+)\]\)/);
    if (notMatch) {
      if (el.hasAttribute(notMatch[1])) return false;
      rest = rest.replace(notMatch[0], '');
    }

    const attrMatches = Array.from(
      rest.matchAll(/\[([a-zA-Z0-9_-]+)(?:=["']?([^"'\]]*)["']?)?\]/g)
    );
    for (const m of attrMatches) {
      const attrName = m[1];
      const expected = m[2];
      if (!el.hasAttribute(attrName)) return false;
      if (expected !== undefined && el.getAttribute(attrName) !== expected) return false;
    }
    rest = rest.replace(/\[[^\]]*\]/g, '');

    const tagMatch = rest.match(/^([a-zA-Z0-9_-]+)/);
    if (tagMatch) {
      if (el.tagName !== tagMatch[1].toUpperCase()) return false;
      rest = rest.slice(tagMatch[0].length);
    }

    for (const m of rest.matchAll(/#([a-zA-Z0-9_-]+)/g)) {
      if (el.id !== m[1]) return false;
    }

    for (const m of rest.matchAll(/\.([a-zA-Z0-9_-]+)/g)) {
      if (!el.classList.contains(m[1])) return false;
    }

    return true;
  }

  function matchesSelectorList(el, selectorList) {
    return selectorList
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .some((sel) => matchesSimpleSelector(el, sel));
  }

  class MiniTextNode {
    constructor(data, ownerDocument) {
      this.nodeType = 3;
      this.data = data;
      this.parentNode = null;
      this.ownerDocument = ownerDocument;
    }
    get textContent() {
      return this.data;
    }
  }

  class MiniElement {
    constructor(tagName, ownerDocument) {
      this.nodeType = 1;
      this.tagName = tagName.toUpperCase();
      this.ownerDocument = ownerDocument;
      this.attributes = new Map();
      this.childNodes = [];
      this.parentNode = null;
      this.style = { display: '', visibility: '', opacity: '1', cssText: '' };
      this.listeners = new Map();
      this.classList = new MiniClassList(this);
      this.shadowRoot = null;
      this._value = undefined;
      this._selectedIndex = -1;
    }

    get parentElement() {
      return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
    }

    get isConnected() {
      let cur = this;
      while (cur) {
        if (cur === this.ownerDocument.documentElement) return true;
        cur = cur.parentNode || cur.host || null;
      }
      return false;
    }

    get id() {
      return this.getAttribute('id') || '';
    }
    set id(v) {
      this.setAttribute('id', v);
    }

    get className() {
      return this.getAttribute('class') || '';
    }
    set className(v) {
      this.setAttribute('class', v);
    }

    get disabled() {
      return this.hasAttribute('disabled');
    }
    set disabled(v) {
      if (v) this.setAttribute('disabled', '');
      else this.removeAttribute('disabled');
    }

    get hidden() {
      return this.hasAttribute('hidden');
    }
    set hidden(v) {
      if (v) this.setAttribute('hidden', '');
      else this.removeAttribute('hidden');
    }

    get readOnly() {
      return this.hasAttribute('readonly');
    }

    get options() {
      if (this.tagName !== 'SELECT') return [];
      return this.querySelectorAll('option');
    }

    get selectedIndex() {
      if (this.tagName !== 'SELECT') return -1;
      const opts = this.options;
      if (this._selectedIndex >= 0 && this._selectedIndex < opts.length) {
        return this._selectedIndex;
      }
      return opts.length > 0 ? 0 : -1;
    }
    set selectedIndex(idx) {
      this._selectedIndex = idx;
      const opt = this.options[idx];
      if (opt) this._value = opt.value;
    }

    get value() {
      if (this.tagName === 'SELECT') {
        if (this._value !== undefined) return this._value;
        const idx = this.selectedIndex;
        return idx >= 0 && this.options[idx] ? this.options[idx].value : '';
      }
      if (this.tagName === 'OPTION') {
        const attrVal = this.getAttribute('value');
        return attrVal !== null ? attrVal : this.textContent.trim();
      }
      if (this._value !== undefined) return this._value;
      return this.getAttribute('value') || '';
    }
    set value(v) {
      const str = String(v ?? '');
      this._value = str;
      if (this.tagName === 'SELECT') {
        const idx = this.options.findIndex((o) => o.value === str);
        this._selectedIndex = idx;
      }
    }

    get textContent() {
      return this.childNodes.map((c) => c.textContent).join('');
    }
    set textContent(v) {
      this.childNodes = v ? [new MiniTextNode(String(v), this.ownerDocument)] : [];
    }

    get innerHTML() {
      return '';
    }
    set innerHTML(html) {
      parseHtmlInto(this, String(html || ''), this.ownerDocument);
    }

    setAttribute(name, value) {
      this.attributes.set(String(name), String(value));
    }
    getAttribute(name) {
      return this.attributes.has(name) ? this.attributes.get(name) : null;
    }
    hasAttribute(name) {
      return this.attributes.has(name);
    }
    removeAttribute(name) {
      this.attributes.delete(name);
    }
    toggleAttribute(name, force) {
      const has = this.hasAttribute(name);
      const next = force === undefined ? !has : Boolean(force);
      if (next) this.setAttribute(name, '');
      else this.removeAttribute(name);
      return next;
    }

    appendChild(child) {
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    }

    attachShadow({ mode }) {
      const sr = new MiniShadowRoot(this, this.ownerDocument, mode);
      this.shadowRoot = sr;
      return sr;
    }

    getRootNode() {
      let cur = this;
      while (cur.parentNode) cur = cur.parentNode;
      return cur instanceof MiniShadowRoot ? cur : this.ownerDocument;
    }

    checkVisibility() {
      let cur = this;
      while (cur && cur.nodeType === 1) {
        if (cur.hasAttribute('hidden')) return false;
        if (cur.style.display === 'none' || cur.style.visibility === 'hidden') return false;
        cur = cur.parentNode;
      }
      return true;
    }

    getBoundingClientRect() {
      return this.checkVisibility()
        ? { width: 120, height: 32, top: 10, left: 10, right: 130, bottom: 42 }
        : { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 };
    }

    scrollIntoView() {}
    focus() {
      this.ownerDocument.activeElement = this;
    }

    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(fn);
    }
    removeEventListener(type, fn) {
      const arr = this.listeners.get(type);
      if (!arr) return;
      this.listeners.set(type, arr.filter((f) => f !== fn));
    }
    dispatchEvent(event) {
      if (!event.target) event.target = this;
      let cur = this;
      while (cur) {
        event.currentTarget = cur;
        const handlers = cur.listeners?.get(event.type) || [];
        for (const fn of handlers) {
          fn.call(cur, event);
        }
        if (!event.bubbles || event._stopped) break;
        cur = cur.parentNode || null;
      }
      return !event._defaultPrevented;
    }

    click() {
      this.dispatchEvent(new MiniEvent('click', { bubbles: true, cancelable: true }));
    }

    closest(selector) {
      let cur = this;
      while (cur && cur.nodeType === 1) {
        if (matchesSelectorList(cur, selector)) return cur;
        cur = cur.parentElement;
      }
      return null;
    }

    querySelectorAll(selector) {
      const out = [];
      const walk = (node) => {
        for (const child of node.childNodes || []) {
          if (child.nodeType === 1) {
            if (matchesSelectorList(child, selector)) out.push(child);
            walk(child);
          }
        }
      };
      walk(this);
      return out;
    }

    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }
  }

  class MiniShadowRoot extends MiniElement {
    constructor(host, ownerDocument, mode) {
      super('#shadow-root', ownerDocument);
      this.host = host;
      this.mode = mode;
      this.activeElement = null;
    }
    getElementById(id) {
      return this.querySelector(`#${id}`);
    }
  }

  const document = {
    documentElement: null,
    body: null,
    activeElement: null,
    createElement(tag) {
      return new MiniElement(tag, document);
    },
    getElementById(id) {
      return this.documentElement.querySelector(`[id="${id}"]`);
    },
    querySelectorAll(sel) {
      return this.documentElement.querySelectorAll(sel);
    },
    querySelector(sel) {
      return this.documentElement.querySelector(sel);
    },
    createTreeWalker(rootNode) {
      const list = [];
      const visit = (n) => {
        if (n.nodeType === 1) list.push(n);
        for (const c of n.childNodes || []) visit(c);
      };
      visit(rootNode);
      let idx = 0;
      return {
        get currentNode() {
          return list[idx] || null;
        },
        nextNode() {
          idx++;
          return list[idx] || null;
        }
      };
    }
  };

  document.documentElement = new MiniElement('html', document);
  document.body = new MiniElement('body', document);
  document.documentElement.appendChild(document.body);
  document.documentElement.setAttribute('lang', 'en');

  for (const id of ['summary', 'results', 'fixture']) {
    const el = document.createElement(id === 'results' ? 'ul' : 'div');
    el.id = id;
    document.body.appendChild(el);
  }

  const store = new Map();
  const context = {
    globalThis: null,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URL,
    Blob,
    document,
    Element: MiniElement,
    Event: MiniEvent,
    CustomEvent: MiniEvent,
    KeyboardEvent: MiniEvent,
    MouseEvent: MiniEvent,
    PointerEvent: MiniEvent,
    HTMLSelectElement: MiniElement,
    HTMLInputElement: MiniElement,
    NodeFilter: { SHOW_ELEMENT: 1 },
    CSS: { escape: (s) => String(s).replace(/([^\w-])/g, '\\$1') },
    getComputedStyle(el) {
      return el.style;
    },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    },
    fetch: async (relPath) => {
      const cleaned = relPath.replace(/^\.\.\//, '');
      const text = fs.readFileSync(path.join(ROOT_DIR, cleaned), 'utf8');
      return { ok: true, status: 200, json: async () => JSON.parse(text) };
    }
  };
  context.window = context;
  context.globalThis = context;
  context.MutationObserver = class {
    constructor(cb) {
      this.cb = cb;
    }
    observe() {}
    disconnect() {}
  };

  return context;
}

async function run() {
  validateManifestAndFiles();
  console.log('PASS: Manifests, assets, and JS syntax checks');

  const ctx = createDomEnvironment();
  vm.createContext(ctx);

  const scriptsToLoad = [
    'src/shared/constants.js',
    'src/shared/storage.js',
    'src/shared/shortcut.js',
    'src/shared/matcher.js',
    'src/content/toast.js',
    'src/content/domFinder.js',
    'tests/test-suite.js'
  ];

  for (const rel of scriptsToLoad) {
    const code = fs.readFileSync(path.join(ROOT_DIR, rel), 'utf8');
    vm.runInContext(code, ctx, { filename: rel });
  }

  // Wait for async IIFE in tests/test-suite.js to finish
  const deadline = Date.now() + 10000;
  while (!ctx.__koreaFinderTestReport && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 25));
  }

  const report = ctx.__koreaFinderTestReport;
  assert.ok(report, 'Test suite did not produce __koreaFinderTestReport');

  const resultItems = ctx.document.getElementById('results').childNodes;
  for (const li of resultItems) {
    console.log(`  ${li.textContent}`);
  }
  console.log(`\nSummary: ${report.passed}/${report.total} passed, ${report.failed} failed`);
  assert.equal(report.failed, 0, `${report.failed} test(s) failed`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

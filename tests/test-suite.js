(async function runTestSuite() {
  'use strict';

  const { matcher, shortcut, domFinder, toast, storage } = globalThis.KoreaFinder;
  const resultsEl = document.getElementById('results');
  const summaryEl = document.getElementById('summary');
  const fixtureEl = document.getElementById('fixture');

  const tests = [];
  function test(name, fn) {
    tests.push({ name, fn });
  }

  function assert(cond, message) {
    if (!cond) {
      throw new Error(message || 'Assertion failed');
    }
  }

  function assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(
        `${message || 'Value mismatch'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
      );
    }
  }

  const variantsRes = await fetch('../data/koreaVariants.json');
  const baseVariants = await variantsRes.json();
  const defaultMatcher = matcher.createMatcher(baseVariants, { includeLanguage: false });
  const langMatcher = matcher.createMatcher(baseVariants, { includeLanguage: true });

  // 1. Normalization & Multilingual tests
  test('Unicode normalization preserves non-Latin & removes Latin diacritics', () => {
    assertEqual(matcher.normalizeText('Corée du Sud'), 'coree du sud');
    assertEqual(matcher.normalizeText('Südkorea'), 'sudkorea');
    assertEqual(matcher.normalizeText('República de Corea'), 'republica de corea');
    assertEqual(matcher.normalizeText('韓国'), '韓国');
    assertEqual(matcher.normalizeText('南韓'), '南韓');
    assertEqual(matcher.normalizeText('Южная Корея'), 'южная корея');
    assertEqual(matcher.normalizeText('Κορέα (Νότια)'), 'κορεα νοτια');
    assertEqual(matcher.normalizeText('كوريا الجنوبية'), 'كوريا الجنوبية');
    assertEqual(matcher.normalizeText('대한민국'), '대한민국');
    assertEqual(matcher.normalizeText('Hàn Quốc'), 'han quoc');
    assertEqual(matcher.normalizeText('เกาหลีใต้'), 'เกาหลีใต้');
  });

  test('Multilingual variants all achieve high match scores', () => {
    const samples = [
      'South Korea',
      'Republic of Korea',
      '대한민국',
      '한국',
      '韓国',
      '南韓',
      '韩国',
      'Corée du Sud',
      'Südkorea',
      'República de Corea',
      'Южная Корея',
      'Κορέα (Νότια)',
      'كوريا الجنوبية',
      'Hàn Quốc',
      'เกาหลีใต้'
    ];
    for (const s of samples) {
      const score = matcher.scoreOption({ text: s }, defaultMatcher);
      assert(score >= 850, `Expected >= 850 for "${s}", got ${score}`);
    }
  });

  // 2. North Korea exclusion regression tests
  test('Blocks all North Korea / DPRK representations with score 0', () => {
    const northSamples = [
      { text: 'North Korea' },
      { text: "Korea, Democratic People's Republic of" },
      { text: "Democratic People's Republic of Korea (+850)" },
      { text: 'DPRK' },
      { text: 'Korea, North' },
      { text: '북한' },
      { text: '조선민주주의인민공화국' },
      { text: '北朝鮮' },
      { text: 'Corée du Nord' },
      { text: 'Corea del Norte' },
      { text: 'Nordkorea' },
      { text: 'Северная Корея' },
      { text: 'Korea', value: 'KP' },
      { text: 'Korea', value: 'PRK' },
      { text: 'Korea', value: '408' },
      { text: '+850', value: '+850' }
    ];
    for (const entry of northSamples) {
      const score = matcher.scoreOption(entry, defaultMatcher);
      assertEqual(score, 0, `Expected score 0 for North Korea sample ${JSON.stringify(entry)}`);
    }
  });

  test('South Korea variants beat standalone "Korea" and ignore North Korea', () => {
    const dprk = matcher.scoreOption(
      { text: "Korea, Democratic People's Republic of (+850)", value: 'KP' },
      defaultMatcher
    );
    const plainKorea = matcher.scoreOption({ text: 'Korea' }, defaultMatcher);
    const southKorea = matcher.scoreOption({ text: 'South Korea' }, defaultMatcher);
    const rokWithCode = matcher.scoreOption(
      { text: 'Republic of Korea (+82)', value: 'KR' },
      defaultMatcher
    );

    assertEqual(dprk, 0);
    assert(southKorea > plainKorea, 'South Korea should outrank plain Korea');
    assert(rokWithCode > plainKorea, 'Republic of Korea (+82) should outrank plain Korea');
  });

  // 3. Language option separation tests
  test('Language entries ("한국어", "Korean") respect includeLanguage and field context', () => {
    assertEqual(matcher.scoreOption({ text: '한국어' }, defaultMatcher), 0);
    assertEqual(matcher.scoreOption({ text: 'Korean' }, defaultMatcher), 0);
    assert(matcher.scoreOption({ text: '한국어' }, langMatcher) >= 900);
    assert(matcher.scoreOption({ text: 'Korean' }, langMatcher) >= 900);
    assert(
      matcher.scoreOption(
        {
          text: '한국어',
          value: 'ko',
          fieldContext: { countryScore: 0, phoneScore: 0, languageScore: 35, isCountryLikely: false }
        },
        defaultMatcher
      ) >= 900
    );
  });

  test('Custom variants receive highest priority', () => {
    const custom = matcher.createMatcher(baseVariants, {
      customVariants: ['ROK (Seoul HQ)']
    });
    const score = matcher.scoreOption({ text: 'ROK (Seoul HQ)' }, custom);
    assertEqual(score, 1100);
  });

  // 4. Shortcut & IME tests
  test('Shortcut normalization, validation, and default fallback', () => {
    assertEqual(shortcut.normalizeShortcutString(' shift + k '), 'Shift+K');
    assertEqual(shortcut.normalizeShortcutString('meta + alt + c'), 'Alt+Meta+C');
    assertEqual(shortcut.normalizeShortcutString('k'), null);
    assertEqual(shortcut.normalizeShortcutString('F8'), 'F8');
    assertEqual(shortcut.validateShortcut(''), true);
    assertEqual(shortcut.validateShortcut('Ctrl+Shift+K'), true);
    assertEqual(shortcut.validateShortcut('invalid+k'), false);

    const def = shortcut.parseShortcut('');
    assertEqual(def.raw, 'Shift+K');
    assertEqual(def.shift, true);
    assertEqual(def.key, 'k');
    assertEqual(def.code, 'KeyK');
  });

  test('Shortcut matching & recording work under Korean IME (e.code priority)', () => {
    const combo = shortcut.parseShortcut('Shift+K');
    const koreanImeEvent = {
      ctrlKey: false,
      altKey: false,
      shiftKey: true,
      metaKey: false,
      code: 'KeyK',
      key: 'ㅏ'
    };
    assert(shortcut.matchesShortcut(koreanImeEvent, combo), 'Should match Shift+K even when e.key is "ㅏ"');

    const formatted = shortcut.formatShortcutFromEvent({
      ctrlKey: true,
      altKey: true,
      shiftKey: false,
      metaKey: false,
      code: 'KeyK',
      key: 'ㅏ'
    });
    assertEqual(formatted, 'Ctrl+Alt+K');
  });

  // 5. DOM Integration Tests
  function clearFixture() {
    fixtureEl.innerHTML = '';
    domFinder.resetCycleState();
  }

  test('DOM <select> avoids North Korea, skips disabled option, and fires input/change', async () => {
    clearFixture();
    fixtureEl.innerHTML = `
      <select id="s1" name="country">
        <option value="">Select</option>
        <option value="KP">Korea, Democratic People's Republic of (+850)</option>
        <option value="KR_DIS" disabled>South Korea</option>
        <option value="KR">Republic of Korea (+82)</option>
        <option value="US">United States</option>
      </select>
    `;
    const sel = document.getElementById('s1');
    let inputCount = 0;
    let changeCount = 0;
    sel.addEventListener('input', () => inputCount++);
    sel.addEventListener('change', () => changeCount++);

    const res = await domFinder.findAndSelectKorea(defaultMatcher);
    assert(res.found, 'Should find South Korea option');
    assertEqual(sel.value, 'KR');
    assertEqual(inputCount, 1);
    assertEqual(changeCount, 1);
  });

  test('DOM <select> matches ISO code value="KR" and ignores numeric "82" in non-phone select', async () => {
    clearFixture();
    const opts = [
      'AU', 'BR', 'CA', 'CN', 'DE', 'ES', 'FR', 'GB',
      'IN', 'IT', 'JP', 'KP', 'KR', 'NL', 'SG', 'US'
    ]
      .map((c) => `<option value="${c}">${c}</option>`)
      .join('');

    fixtureEl.innerHTML = `
      <select id="ageSelect" name="age"><option value="82">82</option><option value="83">83</option></select>
      <select id="isoSelect" autocomplete="country">${opts}</select>
    `;

    const ageSelect = document.getElementById('ageSelect');
    const isoSelect = document.getElementById('isoSelect');
    const res = await domFinder.findAndSelectKorea(defaultMatcher);
    assert(res.found, 'Should select ISO KR');
    assertEqual(isoSelect.value, 'KR');
    assertEqual(ageSelect.value, '82');
  });

  test('DOM <select autocomplete="tel-country-code"> selects +82 instead of +850', async () => {
    clearFixture();
    fixtureEl.innerHTML = `
      <select id="dial" autocomplete="tel-country-code">
        <option value="+1">+1</option>
        <option value="+850">+850</option>
        <option value="+82">+82</option>
      </select>
    `;
    const dial = document.getElementById('dial');
    const res = await domFinder.findAndSelectKorea(defaultMatcher);
    assert(res.found);
    assertEqual(dial.value, '+82');
  });

  test('DOM <input list> + <datalist> selects multilingual variant and fires events', async () => {
    clearFixture();
    fixtureEl.innerHTML = `
      <input id="dlInput" list="dlCountries" name="country" />
      <datalist id="dlCountries">
        <option value="Canada"></option>
        <option value="Südkorea"></option>
        <option value="Japan"></option>
      </datalist>
    `;
    const input = document.getElementById('dlInput');
    let changed = false;
    input.addEventListener('change', () => {
      changed = true;
    });
    const res = await domFinder.findAndSelectKorea(defaultMatcher);
    assert(res.found);
    assertEqual(input.value, 'Südkorea');
    assert(changed, 'Should fire change event on datalist input');
  });

  test('ARIA Combobox avoids unrelated comboboxes and awaits async listbox options', async () => {
    clearFixture();
    fixtureEl.innerHTML = `
      <button id="decoyCombo" type="button" role="combobox" aria-haspopup="listbox">Theme: Light</button>
      <button id="countryCombo" type="button" role="combobox" aria-haspopup="listbox" aria-label="Country">Select Country</button>
      <div id="comboMount"></div>
    `;
    let decoyClicks = 0;
    let selectedVal = '';

    document.getElementById('decoyCombo').addEventListener('click', () => {
      decoyClicks++;
    });

    const countryCombo = document.getElementById('countryCombo');
    countryCombo.addEventListener('click', () => {
      setTimeout(() => {
        const mount = document.getElementById('comboMount');
        mount.innerHTML = `
          <div role="listbox">
            <div class="wrapper"><div role="option" data-value="KP">North Korea</div></div>
            <div class="wrapper"><div role="option" data-value="KR">South Korea (대한민국)</div></div>
          </div>
        `;
        mount.querySelectorAll('[role="option"]').forEach((opt) => {
          opt.addEventListener('click', () => {
            selectedVal = opt.getAttribute('data-value');
          });
        });
      }, 60);
    });

    const res = await domFinder.findAndSelectKorea(defaultMatcher);
    assert(res.found, 'Should resolve async ARIA combobox');
    assertEqual(decoyClicks, 0, 'Unrelated combobox must NOT be clicked');
    assertEqual(selectedVal, 'KR');
  });

  test('Standalone listbox ignores outer wrapper div and selects leaf option', async () => {
    clearFixture();
    let clickedId = '';
    fixtureEl.innerHTML = `
      <div role="listbox">
        <div role="option" id="outerWrapper">
          <div role="option" id="kpOpt">Korea, Democratic People's Republic of</div>
          <div role="option" id="krOpt">Corée du Sud</div>
        </div>
      </div>
    `;
    document.getElementById('outerWrapper').addEventListener('click', () => {
      if (!clickedId) clickedId = 'outerWrapper';
    });
    document.getElementById('krOpt').addEventListener('click', (e) => {
      e.stopPropagation();
      clickedId = 'krOpt';
    });

    const res = await domFinder.findAndSelectKorea(defaultMatcher);
    assert(res.found);
    assertEqual(clickedId, 'krOpt');
  });

  test('Shadow DOM <select> is discovered and selected', async () => {
    clearFixture();
    const host = document.createElement('div');
    fixtureEl.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <select name="country">
        <option value="">Choose</option>
        <option value="KP">North Korea</option>
        <option value="KR">대한민국</option>
      </select>
    `;
    const shadowSelect = shadow.querySelector('select');
    const res = await domFinder.findAndSelectKorea(defaultMatcher);
    assert(res.found);
    assertEqual(shadowSelect.value, 'KR');
  });

  test('Multiple country fields cycle on repeated invocations within 5s', async () => {
    clearFixture();
    fixtureEl.innerHTML = `
      <select id="ship" name="shipping_country">
        <option value="">Shipping</option>
        <option value="KR">South Korea</option>
      </select>
      <select id="bill" name="billing_country">
        <option value="">Billing</option>
        <option value="KR">South Korea</option>
      </select>
    `;
    const r1 = await domFinder.findAndSelectKorea(defaultMatcher);
    const r2 = await domFinder.findAndSelectKorea(defaultMatcher);
    const r3 = await domFinder.findAndSelectKorea(defaultMatcher);

    assertEqual(r1.totalFields, 2);
    assertEqual(r1.cycleIndex, 0);
    assertEqual(r2.cycleIndex, 1);
    assertEqual(r3.cycleIndex, 0);
    assertEqual(document.getElementById('ship').value, 'KR');
    assertEqual(document.getElementById('bill').value, 'KR');
  });

  test('Text input fallback populates country field when no select/combobox exists', async () => {
    clearFixture();
    fixtureEl.innerHTML = `
      <input id="txtCountry" type="text" autocomplete="country-name" />
    `;
    const input = document.getElementById('txtCountry');
    const res = await domFinder.findAndSelectKorea(defaultMatcher);
    assert(res.found);
    assertEqual(res.fieldType, 'text');
    assert(input.value === 'South Korea' || input.value === '대한민국');
  });

  test('Shadow DOM toast host renders isolated notification', () => {
    toast.showToast({ message: '🇰🇷 대한민국 선택됨', variant: 'success', duration: 1500 });
    const host = document.getElementById('korea-finder-toast-host');
    assert(host && host.shadowRoot, 'Toast host with ShadowRoot should exist');
    const msg = host.shadowRoot.querySelector('.kf-msg');
    assertEqual(msg.textContent, '🇰🇷 대한민국 선택됨');
  });

  // 6. Additional unit & regression coverage
  test('Storage sanitizeSettings, host normalization, and host exclusion toggle', () => {
    const clean = storage.sanitizeSettings({
      enabled: false,
      customShortcut: '  ',
      disabledHosts: ['WWW.Example.com', 'example.com'],
      customVariants: ['  ROK ', 'ROK', '']
    });
    assertEqual(clean.enabled, false);
    assertEqual(clean.customShortcut, 'Shift+K');
    assertEqual(clean.disabledHosts.length, 1);
    assertEqual(clean.disabledHosts[0], 'example.com');
    assertEqual(clean.customVariants.length, 1);
    assert(storage.isHostDisabled(clean, 'www.example.com'));
    assert(!storage.isHostDisabled(clean, 'github.com'));
  });

  test('Shortcut splitShortcutTokens and F-key matching', () => {
    const tokens = shortcut.splitShortcutTokens('shift + ctrl + k');
    assertEqual(tokens.join('+'), 'Ctrl+Shift+K');
    const fCombo = shortcut.parseShortcut('F8');
    assert(shortcut.matchesShortcut({ ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, code: 'F8', key: 'F8' }, fCombo));
  });

  test('Flag emoji and parenthesized variants score accurately', () => {
    assert(matcher.scoreOption({ text: '🇰🇷 South Korea (+82)' }, defaultMatcher) >= 1000);
    assert(matcher.scoreOption({ text: '대한민국 (KR)' }, defaultMatcher) >= 900);
    assertEqual(matcher.scoreOption({ text: '🇰🇵 North Korea (+850)' }, defaultMatcher), 0);
  });

  test('Field context scoring detects country, phone, and language fields', () => {
    clearFixture();
    fixtureEl.innerHTML = `
      <label for="cInput">배송지 국가</label>
      <input id="cInput" type="text" />
      <select id="lSelect" name="site_language"><option value="ko">한국어</option></select>
    `;
    const cCtx = matcher.scoreFieldContext(document.getElementById('cInput'));
    const lCtx = matcher.scoreFieldContext(document.getElementById('lSelect'));
    assert(cCtx.countryScore >= 30, 'Should detect Korean label "배송지 국가"');
    assert(lCtx.languageScore >= 35, 'Should detect language field name');
  });

  test('Multilingual North Korea variants in Arabic, Greek, and Thai are excluded', () => {
    const moreNorth = ['كوريا الشمالية', 'Βόρεια Κορέα', 'เกาหลีเหนือ', 'Triều Tiên'];
    for (const s of moreNorth) {
      assertEqual(matcher.scoreOption({ text: s }, defaultMatcher), 0, `Should block ${s}`);
    }
  });

  test('DOM <select> selects Korean "한국어" when includeLanguage is true', async () => {
    clearFixture();
    fixtureEl.innerHTML = `
      <select id="langSel" name="locale">
        <option value="en">English</option>
        <option value="ja">日本語</option>
        <option value="ko">한국어</option>
      </select>
    `;
    const res = await domFinder.findAndSelectKorea(langMatcher);
    assert(res.found);
    assertEqual(document.getElementById('langSel').value, 'ko');
  });

  test('DOM <select> with no matching options returns found=false', async () => {
    clearFixture();
    fixtureEl.innerHTML = `
      <select id="fruit" name="fruit">
        <option value="apple">Apple</option>
        <option value="banana">Banana</option>
      </select>
    `;
    const res = await domFinder.findAndSelectKorea(defaultMatcher);
    assertEqual(res.found, false);
  });

  // 7. v0.4.0 New Features: Timezone, Currency, Typeahead, intl-tel-input, Preferred Target, Storage Backup
  test('Timezone matching prioritizes Asia/Seoul over Tokyo and blocks Pyongyang', async () => {
    clearFixture();
    fixtureEl.innerHTML = `
      <select id="tzSelect" name="timezone">
        <option value="">Select Timezone</option>
        <option value="America/New_York">America/New_York (GMT-05:00)</option>
        <option value="Asia/Pyongyang">Asia/Pyongyang (GMT+09:00)</option>
        <option value="Asia/Tokyo">Asia/Tokyo (GMT+09:00)</option>
        <option value="Asia/Seoul">Asia/Seoul (GMT+09:00)</option>
      </select>
    `;
    const tzSelect = document.getElementById('tzSelect');
    const res = await domFinder.findAndSelectKorea(defaultMatcher);
    assert(res.found, 'Should detect timezone field by context and select Asia/Seoul');
    assertEqual(tzSelect.value, 'Asia/Seoul');

    // Tokyo alone with GMT+09:00 must not be chosen when Seoul is absent
    const tzMatcher = matcher.createMatcher(baseVariants, { includeTimezone: true });
    assertEqual(matcher.scoreOption({ text: 'Asia/Tokyo (GMT+09:00)', value: 'Asia/Tokyo' }, tzMatcher), 0);
    assertEqual(matcher.scoreOption({ text: 'Asia/Pyongyang (GMT+09:00)', value: 'Asia/Pyongyang' }, tzMatcher), 0);
    assert(matcher.scoreOption({ text: 'UTC+09:00', value: 'UTC+9' }, tzMatcher) >= 800);
  });

  test('Currency matching selects KRW and blocks KPW while avoiding false positives', async () => {
    clearFixture();
    fixtureEl.innerHTML = `
      <select id="currSelect" name="currency">
        <option value="">Currency</option>
        <option value="USD">USD ($) - US Dollar</option>
        <option value="KPW">KPW (₩) - North Korean Won</option>
        <option value="KRW">KRW (₩) - South Korean Won</option>
      </select>
    `;
    const res = await domFinder.findAndSelectKorea(defaultMatcher);
    assert(res.found, 'Should detect currency field by context and select KRW');
    assertEqual(document.getElementById('currSelect').value, 'KRW');

    // Without includeCurrency or currency field context, "대한민국 원 (KRW)" should not match country selector
    assertEqual(matcher.scoreOption({ text: '대한민국 원 (KRW)', value: 'KRW' }, defaultMatcher), 0);
    const currMatcher = matcher.createMatcher(baseVariants, { includeCurrency: true });
    assert(matcher.scoreOption({ text: '대한민국 원 (KRW)', value: 'KRW' }, currMatcher) >= 970);
    assertEqual(matcher.scoreOption({ text: 'North Korean Won (KPW)', value: 'KPW' }, currMatcher), 0);
  });

  test('Typeahead / virtualized ARIA combobox filters via search input and selects South Korea', async () => {
    clearFixture();
    let chosenCode = '';
    fixtureEl.innerHTML = `
      <button id="vTrigger" type="button" role="combobox" aria-label="Country" aria-haspopup="listbox" aria-controls="vListbox">Choose</button>
      <div id="vListbox" role="listbox" hidden>
        <input id="vSearch" type="search" />
        <ul id="vList">
          <li role="option" data-value="AU">Australia</li>
          <li role="option" data-value="BR">Brazil</li>
        </ul>
      </div>
    `;
    const trigger = document.getElementById('vTrigger');
    const listbox = document.getElementById('vListbox');
    const searchInput = document.getElementById('vSearch');
    const listEl = document.getElementById('vList');

    trigger.addEventListener('click', () => {
      listbox.removeAttribute('hidden');
    });
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase();
      if (q.includes('korea') || q.includes('대한민국')) {
        listEl.innerHTML = `
          <li role="option" data-value="KP">North Korea</li>
          <li role="option" data-value="KR" id="vKrOption">South Korea (대한민국)</li>
        `;
        document.getElementById('vKrOption').addEventListener('click', () => {
          chosenCode = 'KR';
          listbox.setAttribute('hidden', '');
        });
      }
    });

    const res = await domFinder.findAndSelectKorea(defaultMatcher);
    assert(res.found, 'Typeahead combobox should type search query and select KR');
    assertEqual(chosenCode, 'KR');
  });

  test('intl-tel-input widget (.iti) selects KR (+82) and ignores KP (+850)', async () => {
    clearFixture();
    let clickedCountry = '';
    fixtureEl.innerHTML = `
      <div class="iti">
        <button id="itiFlag" type="button" class="iti__selected-flag" aria-expanded="false">+1</button>
        <ul id="itiList" class="iti__country-list" hidden>
          <li class="iti__country" data-dial-code="850" data-country-code="kp"><span>North Korea</span><span>+850</span></li>
          <li id="itiKr" class="iti__country" data-dial-code="82" data-country-code="kr"><span>South Korea</span><span>+82</span></li>
        </ul>
      </div>
    `;
    document.getElementById('itiFlag').addEventListener('click', () => {
      document.getElementById('itiList').removeAttribute('hidden');
    });
    document.getElementById('itiKr').addEventListener('click', () => {
      clickedCountry = 'kr';
    });

    const res = await domFinder.findAndSelectKorea(defaultMatcher);
    assert(res.found, 'Should discover and select intl-tel-input KR item');
    assertEqual(clickedCountry, 'kr');
  });

  test('Context menu preferredTarget prioritizes right-clicked field and unified cycling covers select + combobox', async () => {
    clearFixture();
    let comboPicked = false;
    fixtureEl.innerHTML = `
      <select id="firstCountry" name="country">
        <option value="">Select</option>
        <option value="KR">South Korea</option>
      </select>
      <select id="secondCountry" name="billing_country">
        <option value="">Select</option>
        <option value="KR">South Korea</option>
      </select>
      <button id="thirdCombo" type="button" role="combobox" aria-label="Nationality" aria-controls="thirdList">Select</button>
      <ul id="thirdList" role="listbox" hidden>
        <li id="thirdKr" role="option" data-value="KR">대한민국</li>
      </ul>
    `;
    document.getElementById('thirdCombo').addEventListener('click', () => {
      document.getElementById('thirdList').removeAttribute('hidden');
    });
    document.getElementById('thirdKr').addEventListener('click', () => {
      comboPicked = true;
      document.getElementById('thirdList').setAttribute('hidden', '');
    });

    const secondEl = document.getElementById('secondCountry');
    const prefRes = await domFinder.findAndSelectKorea(defaultMatcher, { preferredTarget: secondEl });
    assert(prefRes.found);
    assertEqual(secondEl.value, 'KR');
    assertEqual(document.getElementById('firstCountry').value, '');

    domFinder.resetCycleState();
    const r1 = await domFinder.findAndSelectKorea(defaultMatcher);
    const r2 = await domFinder.findAndSelectKorea(defaultMatcher);
    const r3 = await domFinder.findAndSelectKorea(defaultMatcher);
    assertEqual(r1.totalFields, 3);
    assertEqual(r2.totalFields, 3);
    assertEqual(r3.totalFields, 3);
    assert(comboPicked, 'Unified cycling should reach the ARIA combobox on the 3rd invocation');
  });

  test('Storage autoSelectHosts mutual exclusivity and JSON export/import roundtrip', async () => {
    const clean = storage.sanitizeSettings({
      includeTimezone: true,
      includeCurrency: true,
      disabledHosts: ['blocked.com'],
      autoSelectHosts: ['WWW.Amazon.com', 'blocked.com', 'amazon.com']
    });
    assertEqual(clean.includeTimezone, true);
    assertEqual(clean.includeCurrency, true);
    assertEqual(clean.autoSelectHosts.length, 1);
    assertEqual(clean.autoSelectHosts[0], 'amazon.com');
    assert(storage.isHostAutoSelect(clean, 'www.amazon.com'));
    assert(!storage.isHostAutoSelect(clean, 'blocked.com'));

    const json = storage.exportSettingsJson(clean);
    const imported = await storage.importSettingsJson(json);
    assertEqual(imported.includeTimezone, true);
    assertEqual(imported.includeCurrency, true);
    assertEqual(imported.autoSelectHosts[0], 'amazon.com');

    let threw = false;
    try {
      await storage.importSettingsJson('{"foo":"bar"}');
    } catch (_err) {
      threw = true;
    }
    assert(threw, 'Invalid settings payload must throw an error');
  });

  // Execute all tests
  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    const li = document.createElement('li');
    try {
      await t.fn();
      passed++;
      li.className = 'pass';
      li.textContent = `PASS: ${t.name}`;
    } catch (err) {
      failed++;
      li.className = 'fail';
      li.textContent = `FAIL: ${t.name} -> ${err.message}`;
      console.error('[Test FAIL]', t.name, err);
    }
    resultsEl.appendChild(li);
  }

  clearFixture();
  summaryEl.className = failed === 0 ? 'pass' : 'fail';
  summaryEl.textContent = `총 ${tests.length}개 테스트 중 ${passed}개 통과, ${failed}개 실패`;
  globalThis.__koreaFinderTestReport = { total: tests.length, passed, failed };
})();

(function registerMatcher(root) {
  'use strict';

  const ns = (root.KoreaFinder = root.KoreaFinder || {});

  const EXCLUDED_VALUES = new Set([
    'kp',
    'prk',
    '408',
    '+850',
    '850',
    'north korea',
    'dprk',
    'kp-kr',
    'korea-kp',
    'kpw',
    'asia/pyongyang',
    'pyongyang'
  ]);

  const EXCLUDED_PATTERNS = [
    /\bnorth\b[\s,/-]*\bkorea\b|\bkorea\b[\s,/-]*\bnorth\b|\bn\.?\s*korea\b/i,
    /\bdemocratic\s+people|\bdprk\b|\bprk\b/i,
    /\+\s*850\b/,
    /북한|북조선|조선민주주의인민공화국|北朝鮮|北韓|朝鲜民主主义人民共和国/,
    /\bcoree\s+du\s+nord\b|\bcorea\s+del\s+norte\b|\bcorea\s+del\s+nord\b|\bnordkorea\b|\bcoreia\s+do\s+norte\b|\bnoord[\s-]*korea\b|\bkorea\s+polnocna\b|\bkuzey\s+kore\b/i,
    /северная\s+корея|кндр|كوريا\s+الشمالية|βορεια\s+κορεα|เกาหลีเหนือ|trieu\s+tien/i,
    /\bpyongyang\b|\bkpw\b|\bnorth\s+korean\s+won\b|조선\s*원|북한\s*원|평양/i
  ];

  const LANGUAGE_NORM_EXACT = new Set([
    '한국어',
    '대한민국어',
    'korean',
    'korean south korea',
    '한국어 대한민국',
    'ko',
    'ko kr',
    'kor kr'
  ]);

  const LANGUAGE_VALUES = new Set(['ko', 'ko-kr', 'ko_kr', 'kor-kr']);

  const MULTILINGUAL_SOUTH_PATTERNS = [
    /韓国|韓國|大韓民國|南韓|韩国|大韩民国/,
    /\bcoree\s+du\s+sud\b|\brepublique\s+de\s+coree\b/i,
    /\bcorea\s+del\s+sur\b|\brepublica\s+de\s+corea\b/i,
    /\bcorea\s+del\s+sud\b/i,
    /\bsudkorea\b|\bsud\s+korea\b|\brepublik\s+korea\b/i,
    /\bcoreia\s+do\s+sul\b|\brepublica\s+da\s+coreia\b/i,
    /\bcoreea\s+de\s+sud\b|\brepublica\s+coreea\b/i,
    /\bzuid\s+korea\b|\bkorea\s+poludniowa\b|\bguney\s+kore\b|\bhan\s+quoc\b/i,
    /южная\s+корея|республика\s+корея/i,
    /كوريا\s+الجنوبية|جمهورية\s+كوريا/,
    /κορεα\s+νοτια|νοτια\s+κορεα/i,
    /เกาหลีใต้/
  ];

  const ISO_COUNTRY_VALUES = new Set(['kr', 'kor', '410']);

  function normalizeText(str) {
    if (str === undefined || str === null) return '';
    return String(str)
      .normalize('NFKC')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .normalize('NFC')
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}+]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isExcludedKorea(rawText, normText, rawValue, countryCode, dialCode) {
    const valLower = String(rawValue || '').trim().toLowerCase();
    const ccLower = String(countryCode || '').trim().toLowerCase();
    const dcLower = String(dialCode || '').trim().toLowerCase();

    if (
      (valLower && EXCLUDED_VALUES.has(valLower)) ||
      (ccLower && EXCLUDED_VALUES.has(ccLower)) ||
      (dcLower && EXCLUDED_VALUES.has(dcLower))
    ) {
      return true;
    }

    const textToCheck = `${rawText || ''} ${normText || ''}`;
    for (const pattern of EXCLUDED_PATTERNS) {
      if (pattern.test(textToCheck)) {
        return true;
      }
    }
    return false;
  }

  function isLanguageEntry(normText, valLower, fieldContext) {
    if (LANGUAGE_NORM_EXACT.has(normText)) return true;
    if (/^(?:한국어|대한민국어|korean)\b/i.test(normText)) {
      return true;
    }
    if (
      LANGUAGE_VALUES.has(valLower) &&
      (!normText ||
        normText === 'ko' ||
        normText === 'ko kr' ||
        (fieldContext && fieldContext.languageScore >= 25))
    ) {
      return true;
    }
    return false;
  }

  function getAssociatedLabelText(el) {
    if (!el || typeof el.closest !== 'function') return '';
    const chunks = [];

    const doc = el.ownerDocument;
    if (el.id && doc) {
      try {
        const escapedId =
          typeof CSS !== 'undefined' && CSS.escape
            ? CSS.escape(el.id)
            : el.id.replace(/([^\w-])/g, '\\$1');
        const label = doc.querySelector(`label[for="${escapedId}"]`);
        if (label && label.textContent) chunks.push(label.textContent);
      } catch (_e) {
        // Ignore invalid selector edge cases
      }
    }

    const parentLabel = el.closest('label');
    if (parentLabel && parentLabel.textContent) {
      chunks.push(parentLabel.textContent);
    }

    const labelledBy = el.getAttribute && el.getAttribute('aria-labelledby');
    if (labelledBy && doc) {
      for (const refId of labelledBy.trim().split(/\s+/)) {
        const refEl = doc.getElementById(refId);
        if (refEl && refEl.textContent) chunks.push(refEl.textContent);
      }
    }

    return chunks.join(' ');
  }

  function scoreFieldContext(el) {
    if (!el || typeof el.getAttribute !== 'function') {
      return {
        countryScore: 0,
        phoneScore: 0,
        languageScore: 0,
        timezoneScore: 0,
        currencyScore: 0,
        optionCount: 0,
        isCountryLikely: false,
        isTimezoneLikely: false,
        isCurrencyLikely: false,
        isRelevantLikely: false
      };
    }

    let countryScore = 0;
    let phoneScore = 0;
    let languageScore = 0;
    let timezoneScore = 0;
    let currencyScore = 0;

    const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
    if (/\b(country|country-name)\b/.test(autocomplete)) countryScore += 50;
    if (/\btel-country-code\b/.test(autocomplete)) {
      phoneScore += 50;
      countryScore += 30;
    }

    const classStr = typeof el.className === 'string' ? el.className : '';
    if (/\biti__(?:selected-flag|selected-country)\b/.test(classStr) || (el.closest && el.closest('.iti'))) {
      phoneScore += 45;
      countryScore += 30;
    }

    const attrsText = [
      el.getAttribute('name'),
      el.getAttribute('id'),
      el.getAttribute('placeholder'),
      el.getAttribute('aria-label'),
      el.getAttribute('title'),
      el.getAttribute('data-testid'),
      el.getAttribute('data-name'),
      classStr,
      getAssociatedLabelText(el)
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (
      /country|nation|nationality|billing.?country|shipping.?country|국가|나라|국적|거주지|배송지/i.test(
        attrsText
      )
    ) {
      countryScore += 30;
    } else if (/region|territory|지역/i.test(attrsText)) {
      countryScore += 15;
    }

    if (/phone|dial|calling|tel|area.?code|국가.?번호|국제.?전화/i.test(attrsText)) {
      phoneScore += 30;
    }

    if (/lang|language|locale|언어/i.test(attrsText)) {
      languageScore += 35;
    }

    if (/timezone|time[\s_-]*zone|\btz\b|시간대|표준시/i.test(attrsText)) {
      timezoneScore += 35;
    } else if (/\b(?:utc|gmt)\b/i.test(attrsText)) {
      timezoneScore += 20;
    }

    if (/currency|\bcurr\b|billing[\s_-]*currency|price[\s_-]*currency|통화|화폐|결제\s*통화/i.test(attrsText)) {
      currencyScore += 35;
    }

    const optionCount =
      el.tagName === 'SELECT' && el.options ? el.options.length : 0;
    if (optionCount >= 20) {
      countryScore += 20;
    }

    const isCountryLikely = countryScore >= 15 || phoneScore >= 15;
    const isTimezoneLikely = timezoneScore >= 15;
    const isCurrencyLikely = currencyScore >= 15;

    return {
      countryScore,
      phoneScore,
      languageScore,
      timezoneScore,
      currencyScore,
      optionCount,
      isCountryLikely,
      isTimezoneLikely,
      isCurrencyLikely,
      isRelevantLikely: isCountryLikely || isTimezoneLikely || isCurrencyLikely
    };
  }

  function createMatcher(variantsList, options = {}) {
    const exactSet = new Set();
    const list = Array.isArray(variantsList) ? variantsList : [];
    for (const v of list) {
      const n = normalizeText(v);
      if (n) exactSet.add(n);
    }

    const customSet = new Set();
    const customList = Array.isArray(options.customVariants)
      ? options.customVariants
      : [];
    for (const cv of customList) {
      const n = normalizeText(cv);
      if (n) {
        customSet.add(n);
        exactSet.add(n);
      }
    }

    return {
      exactSet,
      customSet,
      includeLanguage: Boolean(options.includeLanguage),
      includeTimezone: Boolean(options.includeTimezone),
      includeCurrency: Boolean(options.includeCurrency)
    };
  }

  function scoreOption(entry, matcher) {
    if (!entry || !matcher) return 0;

    const rawText = String(entry.text || '').trim();
    const rawValue = String(entry.value || entry.dataValue || '').trim();
    const countryCode = String(entry.countryCode || '').trim();
    const dialCode = String(entry.dialCode || '').trim();

    if (!rawText && !rawValue && !countryCode && !dialCode) return 0;

    // Ignore oversized container blocks such as outer dropdown wrappers
    if (rawText.length > 100) return 0;

    const valLower = rawValue.toLowerCase();
    const ccLower = countryCode.toLowerCase();
    const dcLower = dialCode.toLowerCase();
    const normText = normalizeText(rawText);

    if (isExcludedKorea(rawText, normText, rawValue, countryCode, dialCode)) {
      return 0;
    }

    const fieldContext = entry.fieldContext || null;

    if (isLanguageEntry(normText, valLower, fieldContext)) {
      const allowLang =
        matcher.includeLanguage ||
        (fieldContext && fieldContext.languageScore >= 25);
      if (!allowLang) return 0;
      if (matcher.customSet.has(normText)) return 1100;
      return 900;
    }

    if (normText && matcher.customSet.has(normText)) {
      return 1100;
    }

    const hasFlag = rawText.includes('🇰🇷');
    const flagBonus = hasFlag ? 60 : 0;

    // Currency matching (KRW / South Korean Won / ₩)
    const isCurrencyVal = valLower === 'krw';
    const isCurrencyText =
      /\bkrw\b|\bsouth\s+korean\s+won\b|\bkorean\s+won\b|대한민국\s*원|한국\s*원|원화|\(\s*₩\s*\)|₩\s*krw|krw\s*[-–—·/]\s*₩/i.test(
        rawText
      ) || rawText === '₩';

    if (isCurrencyVal || isCurrencyText) {
      const allowCurrency =
        matcher.includeCurrency ||
        (fieldContext && fieldContext.currencyScore >= 25);
      if (!allowCurrency) return 0;
      return 970 + flagBonus + (isCurrencyVal ? 20 : 0);
    }

    // Timezone matching (Asia/Seoul / Seoul / KST / GMT+09:00)
    const isSeoulTz =
      valLower === 'asia/seoul' ||
      /\basia\/seoul\b|\bseoul\b|\bkst\b|\bkorea\s+standard\s+time\b|한국\s*표준시|서울/i.test(
        rawText
      );
    const hasUtcPlus9 =
      /(?:gmt|utc)\s*[+＋]\s*0?9(?::?00)?\b/i.test(rawText) ||
      /^(?:utc|gmt)?\+?0?9(?::00)?$/i.test(valLower);

    if (isSeoulTz || hasUtcPlus9) {
      const allowTimezone =
        matcher.includeTimezone ||
        (fieldContext && fieldContext.timezoneScore >= 25);
      if (isSeoulTz) {
        if (!allowTimezone) return 0;
        return 990 + flagBonus + (valLower === 'asia/seoul' ? 20 : 0);
      }
      if (hasUtcPlus9) {
        if (!allowTimezone) return 0;
        const hasOtherCity =
          /\b(tokyo|osaka|sapporo|yakutsk|palau|dili|jayapura|chita)\b|도쿄|오사카/i.test(
            rawText
          );
        if (hasOtherCity) return 0;
        return 820 + flagBonus;
      }
    }

    const optionCount =
      entry.optionCount || (fieldContext ? fieldContext.optionCount : 0);
    const isCountryCtx =
      Boolean(fieldContext && fieldContext.isCountryLikely) || optionCount >= 15;
    const isPhoneCtx = Boolean(fieldContext && fieldContext.phoneScore >= 15);

    const hasIntlKrCode = ccLower === 'kr' || ccLower === 'kor';
    const hasIntlDial82 = dcLower === '82' || dcLower === '+82';

    const hasPlus82 =
      /(?:^|[^\d+])\+\s*82(?:\b|\s|\)|$)/.test(rawText) ||
      valLower === '+82' ||
      (valLower === '82' && isPhoneCtx) ||
      hasIntlDial82;

    const isIsoCountryVal =
      ISO_COUNTRY_VALUES.has(valLower) || ISO_COUNTRY_VALUES.has(ccLower);

    if (normText && matcher.exactSet.has(normText)) {
      if (normText === 'korea') {
        return 850 + flagBonus + (hasPlus82 || isIsoCountryVal ? 80 : 0);
      }
      return 1000 + flagBonus + (hasPlus82 || isIsoCountryVal ? 40 : 0);
    }

    if (
      /\bsouth\s+korea\b|\brepublic\s+of\s+korea\b|\bkorea\s+republic\s+of\b|\bkorea\s+south\b/.test(
        normText
      )
    ) {
      return 920 + flagBonus + (hasPlus82 || isIsoCountryVal ? 60 : 0);
    }

    if (/대한민국|대한\s*민국|한국/.test(rawText) && !/한국어/.test(rawText)) {
      return 910 + flagBonus + (hasPlus82 || isIsoCountryVal ? 60 : 0);
    }

    for (const pat of MULTILINGUAL_SOUTH_PATTERNS) {
      if (pat.test(normText) || pat.test(rawText)) {
        return 880 + flagBonus + (hasPlus82 || isIsoCountryVal ? 60 : 0);
      }
    }

    if (hasPlus82) {
      if (
        /\b(korea|kr|kor|rok)\b/.test(normText) ||
        /한국|대한민국/.test(rawText) ||
        hasFlag ||
        hasIntlKrCode
      ) {
        return 960;
      }
      if (isPhoneCtx) return 900;
      return 760;
    }

    if (isIsoCountryVal) {
      if (isCountryCtx || hasIntlKrCode) return 940 + flagBonus;
      if (normText === 'kr' || normText === 'kor') return 800 + flagBonus;
    }

    if (/\bkorea\b/.test(normText)) {
      let score = 500;
      if (/\bsouth\b/.test(normText)) score += 150;
      if (/\brepublic\b/.test(normText)) score += 100;
      return score + flagBonus;
    }

    if (hasFlag) {
      return 700;
    }

    return 0;
  }

  ns.matcher = Object.freeze({
    normalizeText,
    isExcludedKorea,
    scoreFieldContext,
    createMatcher,
    scoreOption
  });
})(globalThis);

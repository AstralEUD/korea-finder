# Korea Finder ([Chrome Extension](https://chromewebstore.google.com/detail/korea-finder/depmielabcicjmakklidjpiidpmplafc?hl=ko))

회원가입이나 결제 폼에서 `South Korea`, `Republic of Korea`, `Korea, Republic of`, `대한민국`, `Corée du Sud` 등 제각각인 대한민국 표기를 매번 스크롤하며 찾지 마세요.
**Korea Finder**는 단축키 `Shift+K`(또는 우클릭 메뉴·팝업 버튼) 한 번으로 각종 국가·전화번호·시간대·통화 선택 UI에서 대한민국을 정확하게 찾아 자동 선택해주는 경량 브라우저 확장 프로그램입니다.

## 주요 기능 (v0.4.0)

- **고정밀 다국어 매칭 & 북한 오선택 방지**: 영어, 한국어, 한자/일본어(`韓国`), 중국어(`南韓`, `韩国`), 유럽 악센트(`Corée du Sud`, `Südkorea`), 키릴(`Южная Корея`), 아랍어(`كوريا الجنوبية`), ISO 코드(`KR`, `KOR`, `410`), 국제전화 코드(`+82`)를 지원하며 `North Korea`, `DPRK`, `Democratic People's Republic of Korea`, `+850`, `KPW`, `Asia/Pyongyang` 등 북한 표기는 원천 차단합니다.
- **시간대(Timezone) & 통화(Currency) 자동 매칭**: 시간대 필드에서 `Asia/Seoul` / `KST` / `GMT+09:00`(`Asia/Tokyo` 제외)을, 결제 통화 필드에서 `KRW` / `₩` / `South Korean Won`을 자동 선택합니다.
- **실전 SPA & 커스텀 위젯 대응**:
  - 검색형(Typeahead)·가상 스크롤(Virtualized) ARIA `combobox` 자동 타이핑 필터링 지원
  - 포인터/마우스 이벤트 시퀀스(`pointerdown` → `mousedown` → `pointerup` → `mouseup` → `click`) 에뮬레이션
  - `intl-tel-input`(`.iti`, `data-country-code="kr"`, `data-dial-code="82"`) 위젯 지원
  - `<select>`, `<datalist>`, Shadow DOM, `iframe` 내부 폼, 우클릭 타겟 우선 선택 지원
- **한글 IME 완벽 대응 단축키 & 통합 다중 필드 순환**: 물리 키 코드(`e.code`) 기준 매칭으로 한글 입력 상태에서도 즉시 동작하며, 한 페이지 내 여러 국가·전화·콤보박스 필드를 5초 내 연속 실행으로 순환 선택합니다.
- **사이트별 자동 선택(Auto-Select), 제외 도메인 & 설정 백업**: 팝업·설정에서 접속 시 자동 선택 사이트 및 제외 사이트를 관리하고, 설정을 JSON 파일로 내보내기/가져오기 할 수 있습니다.
- **멀티 브라우저 패키징 & GitHub Actions CI/CD**: Chrome, Edge, Firefox(`.zip`/`.xpi`), Naver Whale용 경량 패키지를 자동 빌드 및 검증합니다.

## 폴더 구조

```text
korea-finder/
├── manifest.json
├── package.json
├── .github/workflows/ (ci.yml, release.yml)
├── scripts/ (package.mjs, package.ps1, run-tests.mjs)
├── data/koreaVariants.json
├── icons/ (icon-16/32/48/128.png)
├── src/
│   ├── background/serviceWorker.js
│   ├── content/ (domFinder.js, main.js, toast.js)
│   ├── options/ (options.html, options.js)
│   ├── popup/ (popup.html, popup.js)
│   ├── shared/ (constants.js, matcher.js, shortcut.js, storage.js)
│   └── styles/design-system.css
└── tests/ (index.html, test-suite.js)
```

## 설치 (개발용 로드)

1. 이 저장소를 클론 또는 다운로드합니다.
2. Chrome/Edge/Whale 주소창에서 `chrome://extensions`를 열고 우측 상단 **개발자 모드**를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다**를 클릭한 뒤 프로젝트 루트 폴더를 선택합니다.
4. 아무 웹페이지에서 `Shift+K` 또는 우클릭 메뉴로 동작을 확인합니다. (Options 페이지 하단 플레이그라운드에서도 즉시 테스트 가능)

## 테스트 및 멀티 브라우저 패키징

```bash
# 자동화 테스트 및 매니페스트 검증 (Node.js 18+)
npm test

# 모든 브라우저용 배포 패키지 생성 (chrome, edge, firefox .zip/.xpi, whale + SHA256SUMS.txt)
npm run package

# 특정 브라우저만 패키징
npm run package:chrome
npm run package:edge
npm run package:firefox
npm run package:whale
```

Windows PowerShell 환경에서는 Node.js 없이도 아래 스크립트로 패키징할 수 있습니다:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package.ps1 -Target all
```

### GitHub Actions 자동화

- **CI (`.github/workflows/ci.yml`)**: `main`/`master` 브랜치 push 및 PR마다 테스트 실행 후 `chrome`, `edge`, `firefox`, `whale` 패키지를 빌드·검증하고 아티팩트로 업로드합니다.
- **Release (`.github/workflows/release.yml`)**: `v*.*.*` 태그 push(또는 수동 실행) 시 테스트·패키징·SHA256 체크섬 검증 후 GitHub Release에 모든 브라우저 패키지를 자동 첨부합니다.

## GitHub
<https://github.com/AstralEUD/korea-finder>

## 라이선스

GPL 3.0

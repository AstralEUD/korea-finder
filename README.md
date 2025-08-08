# Korea Finder (Chrome Extension)

Shift+K (사용자 정의 가능) 로 어떤 사이트의 국가 선택(Select, Datalist, ARIA Combobox 등) UI 에서 한국을 자동으로 찾아 선택해주는 경량 크롬 확장.

## 기능
- 기본 페이지 단축키: `Shift + K` (Options 에서 변경 가능)
- Manifest fallback 명령: `Alt+Shift+K` (chrome://extensions > 단축키 에서 재설정 가능)
- 다양한 표기 탐지: South Korea, Republic of Korea, Korea (South), Korea, 대한민국, 한국, 韓国, etc. (확장된 다국어/변형 포함)
- `<select>`, `datalist`, ARIA combobox/listbox, 일반 country input placeholder 를 순차 탐색
- JSON 리스트(`data/koreaVariants.json`) 로 변형 가능 (사용자 커스터마이즈 예정 부분)
- Options 페이지에서 단축키 즉시 변경 및 variant 목록 미리보기
- GitHub 링크 제공

## 설치 (개발용 로드)
1. 이 리포를 클론 또는 다운로드
2. Chrome > 확장 프로그램 > 개발자 모드 ON
3. "압축해제된 확장 프로그램을 로드" 클릭 후 폴더 선택
4. 아무 페이지에서 기본 Shift+K 또는 지정한 커스텀 키를 눌러 테스트

## 구조
- `manifest.json`: MV3 설정, 명령, 권한, options 페이지
- `background.js`: 명령 수신 후 content script 에 메시지 전송
- `contentScript.js`: DOM 탐색, 매칭 점수 계산, 선택 수행, 동적 단축키 리스너
- `options.html / options.js`: GUI 로 사용자 정의 단축키 저장 (chrome.storage.sync)
- `data/koreaVariants.json`: 한글/영문/다국어 한국 표기 확장 목록
- `icons/`: 아이콘 (placeholder 교체 권장)

## 커스터마이징
`data/koreaVariants.json` 에 원하는 표현을 추가/삭제 후 확장 새로고침.

## 단축키 변경
- 확장 관리 페이지에서 Options 열기 → 원하는 조합 입력 (예: `Ctrl+Alt+K`) → 저장
- 입력 형식: (Ctrl|Alt|Shift|Meta)+Key (Key = A~Z 또는 F1~F12)
- 비워두면 기본(Shift+K) 사용

## 매칭 로직 개요
1. 현재 focus 된 `<select>` 우선
2. 모든 visible `<select>` 순회 → 최적 점수 옵션 선택
3. `datalist` 연결 input 탐색
4. `role=combobox` / listbox 패턴 탐색, option 클릭
5. fallback: placeholder 에 country/국가/나라 가 포함된 text input 채우기

점수 계산:
- 정규화된 문자열이 variant 와 완전 일치: 1000
- korea 포함: 100 + south(50) republic(40)
- 대한민국/한국 직접 포함: 900

## 향후 아이디어
- ISO 코드 필드 자동 채움
- 다중 즐겨찾기 국가 지원 및 순환
- Variant 관리 UI (편집 → 저장)
- Analytics (비공개 로컬) 로 어느 패턴이 가장 자주 쓰였는지

## GitHub
https://github.com/astral/korea-finder

## 라이선스
GPL v.3.0

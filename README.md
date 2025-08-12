# Korea Finder ([Chrome Extension](https://chromewebstore.google.com/detail/korea-finder/depmielabcicjmakklidjpiidpmplafc?hl=ko)) 

혹시 회원가입 시 대한민국, South Korea, Republic of Korea... 다양한 대한민국의 이름을 찾다가 지치지 않으셨나요?
이 프로그램은 단축키 Shift+K 로 어떤 사이트의 국가 선택 UI 에서 한국을 자동으로 찾아 선택해주는 크롬 익스텐션입니다.

## 기능
- 기본 페이지 단축키: `Shift + K` (Options 에서 변경 가능)
- Manifest fallback 명령: `Alt+Shift+K` (chrome://extensions > 단축키 에서 재설정 가능)
- 다양한 표기 탐지: South Korea, Republic of Korea, Korea (South), Korea, 대한민국, 한국, 韓国, etc. (확장된 다국어/변형 포함)
- `<select>`, `datalist`, ARIA combobox/listbox, 일반 country input placeholder 를 순차 탐색
- JSON 리스트(`data/koreaVariants.json`) 로 변형 가능 (사용자 커스터마이즈 예정 부분)
- Options 페이지에서 단축키 즉시 변경 및 variant 목록 미리보기

## 설치 (개발용 로드)
1. 이 리포를 클론 또는 다운로드
2. Chrome > 확장 프로그램 > 개발자 모드 ON
3. "압축해제된 확장 프로그램을 로드" 클릭 후 폴더 선택
4. 아무 페이지에서 기본 Shift+K 또는 지정한 커스텀 키를 눌러 테스트

**[링크](https://detailedmanual.net/%ED%81%AC%EB%A1%AC-%ED%99%95%EC%9E%A5-%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%A8-%EC%88%98%EB%8F%99-%EC%84%A4%EC%B9%98-%EB%B0%A9%EB%B2%95/) 를 참조하시면 도움이 됩니다!**

크롬 웹 스토어 등록은 진행중입니다.

## 커스터마이징
`data/koreaVariants.json` 에 원하는 표현을 추가/삭제 후 확장 새로고침.

## 단축키 변경
- 확장 관리 페이지에서 Options 열기 → 원하는 조합 입력 (예: `Ctrl+Alt+K`) → 저장
- 입력 형식: (Ctrl|Alt|Shift|Meta)+Key (Key = A~Z 또는 F1~F12)
- 비워두면 기본(Shift+K) 사용

## GitHub
https://github.com/astral/korea-finder

## 라이선스
GPL 3.0

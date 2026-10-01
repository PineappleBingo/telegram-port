# telegram-port

Node/TypeScript 프로젝트에 텔레그램 봇을 설치하는 Claude Code 플러그인입니다. 프로젝트의 문서·설정·코드를
읽고, 봇 초안을 사용자와 함께 확정한 뒤, 모든 버튼을 프로젝트 자신의 함수에 연결합니다.

- **기능별 메뉴와 명령.** 위험 등급을 엔진이 강제합니다: `read`는 바로 실행, `write`는 확인 버튼,
  `danger`는 확인 문구를 직접 입력해야 실행하고 기록을 남깁니다.
- **설정 편집기.** 허용 범위를 검사하고, 비밀값처럼 보이는 경로는 아예 막습니다.
- 앱이 한 줄로 보내는 **알림**과 **상태 화면**.
- **검증.** 핸들러가 빠지면 타입 오류가 나고, 연결 테스트가 모든 버튼을 눌러 봅니다.
- 토큰이 없어도 봇 전체를 HTML 한 장으로 보는 **미리 보기**.

## 설치

```
/plugin marketplace add PineappleBingo/telegram-port
/plugin install telegram-port@telegram-port
```

또는 `skills/telegram-port/` 폴더를 `~/.claude/skills/`에 복사해도 됩니다. 폴더 하나로 동작합니다.

## 사용

프로젝트 루트에서 `/telegram-port`를 실행하면:

1. 프로젝트를 읽어 메뉴·동작·설정·알림·상태 항목 초안을 만들고,
2. 초안(모든 위험 동작과 제외한 비밀값 포함)을 보여 주고 애매한 것만 묻고,
3. `src/telegram/` 아래에 엔진과 연결 코드, 연결 테스트를 설치하고,
4. 타입체크와 연결 테스트가 통과할 때까지 핸들러를 연결하고,
5. 미리 보기를 만들고 토큰 받는 법을 안내합니다.

프로젝트가 바뀐 뒤 다시 실행하면 차이를 보여 주고, 사람이 고친 부분은 그대로 두며, 엔진은 플러그인 쪽이
더 새 버전일 때만 교체합니다.

## 프로젝트에 추가되는 것

```
src/telegram/
├─ core/                     엔진 (고치지 마세요, 업그레이드 때 교체)
├─ telegram.manifest.json    메뉴·명령·설정·알림·상태 정의
├─ manifest.gen.ts           JSON에서 생성
├─ handlers.ts               동작 id → 프로젝트 함수
├─ configAdapter.ts          설정을 읽고 저장하는 곳
├─ messages.<lang>.ts        문구
└─ index.ts                  startBot() · sendAlert() · stopBot()
tests/telegram.wiring.test.ts
```

## 예시

- `examples/small-app`: 사이트 감시 앱. 코인과 무관합니다.
- `examples/tracer-like`: 명령 그룹, 많은 설정, 알림이 있는 Solana-Tracer형 앱.

## 개발

```bash
npm install
npm run typecheck
npm test
```

## 라이선스

MIT

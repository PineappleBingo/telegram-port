# telegram-port 설계 — 어떤 Node/TS 프로젝트에든 텔레그램 봇을 이식하는 플러그인

- **날짜:** 2026-10-01
- **상태:** 설계 승인 대기 (섹션 1–4는 대화에서 승인됨)
- **원본 패턴:** Solana-Tracer `src/telegram`(grammY, 약 3,600줄) — 명령·설정 등록부, 설정 화면, 입력 대기, 소유자 전용, 시작 실패 격리

## 1. 목표

프로젝트 문서와 코드를 읽어 그 프로젝트에 맞는 텔레그램 봇을 설치한다. 기능별 메뉴·명령, 설정 편집기, 알림, 상태 화면을 만들고, **모든 버튼이 실제 기능에 연결**되게 한다.
코인 프로젝트 전용이 아니라 템플릿으로서 여러 프로젝트에 적용한다.

### 성공 기준

1. 처음 보는 Node/TS 프로젝트에서 `/telegram-port` 한 번으로, typecheck와 "모든 버튼 눌러 보기" 시뮬레이터를 통과하는 봇이 설치된다.
2. 매니페스트의 모든 동작에 핸들러가 있다는 것을 **타입체크가 강제**한다 — 연결 안 된 버튼은 컴파일되지 않는다.
3. 위험한 기능은 엔진이 강제하는 확인 단계 없이 실행되지 않는다.
4. 비밀값은 설정 편집기에 나타나지 않는다.
5. 스킬을 다시 실행해도 사람이 고친 연결 코드가 지워지지 않는다.
6. 서로 성격이 다른 예시 두 개(Solana-Tracer형, 코인과 무관한 작은 앱)에서 위 1–5가 성립한다.

### 결정 사항 (사용자 확인)

| 항목 | 결정 |
|---|---|
| 대상 스택 | Node/TypeScript + grammY (1판). 다른 언어는 나중에 |
| 구성 방식 | 자동 추출로 초안 → 사용자가 확인·수정 (애매한 곳만 질문) |
| 설치 형태 | 범용 엔진(`core/`)을 프로젝트에 복사 + 프로젝트별 층 생성 |
| 실행 방식 | 봇이 앱과 같은 프로세스에서 프로젝트 함수를 직접 호출 |
| 1판 범위 | 기능 메뉴·명령, 설정 편집기, 알림, 상태·대시보드 화면 |
| 문구 | `messages.<lang>.ts`로 분리, 설치 때 언어 하나 (기본: 프로젝트 문서 언어) |
| 출시 | 공개 GitHub 저장소, Claude Code 플러그인 + 마켓플레이스. 스킬 폴더만 복사해도 동작 |
| 아키텍처 | **C안** — 선언형 매니페스트를 엔진이 실행 중에 읽고, 에이전트는 연결 코드만 작성 |
| 추가 3가지 | 위험 등급과 확인 단계 · 토큰 없는 미리 보기와 모든 버튼 눌러 보기 · 순서 대신 고정 id |

### 범위 밖 (1판)

Python 등 다른 언어, 역할 구분(관리자/보기 전용), 텔레그램 미니앱, 웹훅 모드(1판은 폴링), 그룹 채팅, 다중 소유자.

## 2. 저장소 구조

```
telegram-port/
├─ .claude-plugin/
│  ├─ plugin.json
│  └─ marketplace.json
├─ skills/telegram-port/
│  ├─ SKILL.md                 진입점: 단계 순서와 규칙
│  └─ references/              단계별 상세 지침 (필요할 때만 읽음)
│     ├─ extract.md            프로젝트 → 매니페스트 초안
│     ├─ manifest.md           매니페스트 형식
│     ├─ wiring.md             handlers.ts · configAdapter.ts 작성법
│     └─ safety.md             위험 등급 · 비밀값 규칙
├─ core/                       대상 프로젝트에 복사되는 엔진 (TS, grammY, zod)
│  ├─ VERSION
│  ├─ manifest.ts              타입 + zod 검증 + 타입 유도(ActionId 등)
│  ├─ callback.ts              버튼 데이터 인코딩 (고정 id, 64바이트, 해시)
│  ├─ bot.ts                   시작 · 소유자 검사 · 실패 격리 · 텔레그램 제한 대응
│  ├─ guard.ts                 위험 등급 강제 · 실행 기록 훅
│  ├─ menus.ts                 메뉴·동작 렌더링, 입력 대기
│  ├─ settings.ts              설정 편집기 (렌더러 포함)
│  ├─ alerts.ts                알림 보내기 · 일시정지/재개
│  ├─ status.ts                상태 화면
│  └─ testing/simulate.ts      모든 버튼 눌러 보기 시뮬레이터
├─ templates/                  handlers.ts · configAdapter.ts · messages.<lang>.ts · index.ts · wiring 테스트 뼈대
├─ tools/preview/              토큰 없는 메뉴 트리 미리 보기 (HTML 한 장)
├─ examples/
│  ├─ tracer-like/             Solana-Tracer형 (명령 그룹, 많은 설정, 알림)
│  └─ small-app/               코인과 무관한 작은 Node 앱
├─ tests/                      엔진 단위 테스트 + 예시 통합 테스트
├─ README.md / README.ko.md
└─ LICENSE
```

### 대상 프로젝트에 설치되는 모습

```
src/telegram/
├─ core/                     복사본 · 손대지 않음 · VERSION으로 업그레이드
├─ telegram.manifest.json    메뉴·명령·설정·알림·상태 정의 (데이터)
├─ handlers.ts               동작 id → 프로젝트 함수 (에이전트 작성, 사람이 고쳐도 됨)
├─ configAdapter.ts          설정 읽기·쓰기·즉시 적용
├─ messages.<lang>.ts        문구
└─ index.ts                  앱 시작 코드가 부르는 진입점 한 줄
tests/telegram.wiring.test.ts
.telegram-port/              스킬 실행 기록 (추출 근거, 단계 상태)
```

Solana-Tracer의 코드는 1판에서 바꾸지 않는다. 엔진은 거기서 **뽑아내기만** 한다. Solana-Tracer를 이 엔진으로 옮기는 일은 별도 결정이다.

## 3. 매니페스트 형식

`src/telegram/telegram.manifest.json` 하나가 봇 화면 전체를 정의한다. 엔진이 실행 중에 읽고 zod로 검증하며, 틀리면 봇을 시작하지 않는다.

```jsonc
{
  "version": 1,
  "manifestRev": 3,
  "language": "ko",
  "owner": { "env": "TELEGRAM_CHAT_ID" },
  "menus": [
    { "id": "main", "title": "main.title", "items": [
      { "action": "status.show" }, { "menu": "calls" }, { "menu": "settings" }
    ]},
    { "id": "calls", "title": "calls.title", "items": [
      { "action": "calls.list" }, { "action": "calls.mode", "args": ["off", "record", "quick"] }
    ]}
  ],
  "actions": [
    { "id": "status.show",   "label": "status.btn", "risk": "read",   "command": "status" },
    { "id": "calls.list",    "label": "calls.list", "risk": "read",   "command": "calls" },
    { "id": "calls.mode",    "label": "calls.mode", "risk": "write",  "arg": { "kind": "enum" } },
    { "id": "wallet.remove", "label": "wallet.rm",  "risk": "danger", "command": "remove",
      "arg": { "kind": "text", "prompt": "wallet.rm.ask" }, "confirmPhrase": "REMOVE" }
  ],
  "settings": {
    "categories": [{ "id": "ca", "title": "settings.calls" }],
    "fields": [
      { "id": "radar.miss", "path": "calls.radar.sampleRate.miss", "category": "ca",
        "kind": "float", "ratio": true, "min": 0, "max": 1, "apply": "live" }
    ],
    "excluded": ["apiKeys.*", "*.token", "*.secret"]
  },
  "alerts": [{ "id": "call.verdict", "template": "alert.callVerdict", "mutable": true }],
  "status": { "fields": ["calls.today", "radar.read", "budget.used"] }
}
```

### 규칙

- **문구는 키만 적는다.** 실제 문장은 `messages.<lang>.ts`에 있다. 매니페스트의 모든 문구 키가 문구 파일에 있어야 한다(검증).
- **id가 버튼 데이터의 정체다.** 버튼 데이터는 `a:<id>[:인자]`(동작), `m:<id>`(메뉴), `s:<id>[:값]`(설정)이다. 64바이트를 넘으면 엔진이 짧은 해시로 바꾸고 매핑을 유지한다. 순서는 의미가 없으므로 메뉴를 재배열해도 열린 버튼이 다른 기능을 가리키지 않는다.
- **`risk`는 필수다.** `read` 바로 실행 · `write` 확인 버튼 한 번 · `danger` `confirmPhrase` 입력 + 실행 기록. 빠지면 검증 실패.
- **인자 종류:** `enum`(버튼 선택), `text`·`number`(입력 대기 5분), 없음.
- **설정 `path`는 프로젝트 설정 객체의 경로다.** 읽기·쓰기는 `configAdapter.ts`가 한다. `excluded` 패턴(기본값에 `*token*`, `*secret*`, `*key*`, `*password*` 포함)에 걸리는 경로를 `fields`에 넣으면 검증 실패.
- **`status.fields`와 알림 `template`은 이름만 정한다.** 값을 채우는 함수는 `handlers.ts`에 있다.
- **`manifestRev`**: 스킬이 매니페스트를 바꿀 때마다 1씩 올린다. 다른 rev의 버튼을 누르면 "메뉴가 바뀌었습니다" 안내.

### 연결 계약

엔진은 매니페스트에서 `ActionId`, `StatusField`, `AlertId`, `SettingId` 타입을 유도한다(매니페스트를 `as const`로 가져오는 TS 모듈 `manifest.gen.ts`를 스킬이 함께 생성).

```ts
export const handlers: Handlers<typeof manifest> = {
  'status.show': async (ctx) => ctx.status(),
  'calls.list':  async (ctx) => ctx.reply(await listCalls()),
  'calls.mode':  async (ctx, mode) => setMode(mode),
  'wallet.remove': async (ctx, addr) => removeWallet(addr),
};
```

`Handlers<M>`는 `Record<ActionId<M>, Handler>`라서 동작이 하나라도 빠지면 타입체크가 실패한다. 재실행으로 동작이 늘면 타입 오류 위치를 에이전트가 채운다.

## 4. 스킬 실행 흐름

`/telegram-port`를 대상 프로젝트 루트에서 실행한다. 단계마다 결과를 `.telegram-port/`에 남겨 중단 후 이어 할 수 있다.

0. **사전 점검** — `package.json`·`tsconfig`가 없으면 "1판은 Node/TS만" 안내 후 중단. `src/telegram/core/VERSION`이 있으면 재실행 모드(6).
1. **추출** — README·docs, 설정 스키마(zod·JSON 스키마·config 예시), 내보낸 함수·CLI 명령, 기존 봇 명령, 이벤트·로그 지점(알림 후보), 상태 수치 후보를 읽는다. 기능 묶음 → 메뉴, 함수 → 동작(등급은 이름·문서 단서로 추정: delete·remove·send·trade·deploy·drop → `danger`, set·update·toggle → `write`), 설정 경로 → 필드(비밀값 패턴은 자동 제외). 항목마다 근거(파일:행)를 기록.
2. **초안 확인** — 메뉴 트리 요약 + `danger` 동작, 제외한 비밀값, 애매한 항목만 질문(한 번에 최대 4개, 선택지형). 승인되면 매니페스트 확정.
3. **설치** — `core/` 복사(VERSION), 매니페스트·`manifest.gen.ts`·문구·`configAdapter.ts`·`handlers.ts`·`index.ts`·연결 테스트 생성. 앱 시작 코드에 진입점 한 줄(위치는 diff로 보여 주고 승인). `grammy`·`zod` 의존성 추가, `.env.example`에 `TELEGRAM_BOT_TOKEN`·`TELEGRAM_CHAT_ID`.
4. **연결과 검증** — `handlers.ts`를 채운다(타입 오류 = 미연결 목록). 프로젝트 typecheck·테스트 + 시뮬레이터. 모두 통과해야 다음 단계.
5. **미리 보기와 마무리** — 토큰 없는 메뉴 트리 미리 보기(HTML), BotFather·토큰·첫 실행 안내, 결과 요약(연결된 동작 수, 위험 동작 목록, 제외한 설정, 남은 TODO).
6. **재실행 모드** — 다시 추출해 기존 매니페스트와의 차이(추가·삭제·변경)를 보여 주고 승인받는다. `core/`는 플러그인 버전이 더 새로우면 교체(변경점 안내). `handlers.ts`·`configAdapter.ts`는 사람이 고친 부분을 보존: 새 동작 핸들러만 추가, 사라진 동작은 주석으로 표시, 덮어쓰지 않음. `manifestRev` +1.

### 규칙

- 프로젝트 코드를 쓰는 것은 3·4단계, 생성 파일과 진입점 한 줄뿐이다.
- 비밀값을 설정에 넣거나 `danger`를 낮추는 일은 사용자의 명시적 승인 없이는 하지 않는다.

## 5. 엔진 동작

### 시작과 실패 격리

- `startTelegram({ manifest, handlers, config, log, onAudit? })`은 시작 실패(토큰 오류·네트워크)를 잡아 로그만 남기고 앱은 계속 돈다.
- 토큰이 없으면 봇을 끄고 경고 한 줄.
- 매니페스트 검증 실패 시 봇만 시작하지 않고 무엇이 틀렸는지 로그.

### 요청 처리

- **소유자 검사:** `TELEGRAM_CHAT_ID`가 아닌 사람의 메시지·버튼은 무응답, 기록만.
- **핸들러 오류:** 사용자에겐 "실패했습니다 (오류 코드)", 상세는 로그. 스택·비밀값은 메시지에 넣지 않는다.
- **텔레그램 제한:** 4,096자 초과 메시지 분할, 429는 `retry_after` 대기 후 재시도, "message is not modified" 무시.
- **입력 대기:** 5분 만료, 새 명령이 오면 이전 대기 취소.
- **사라진 버튼:** 매니페스트에 없는 id나 다른 `manifestRev`의 버튼 → "메뉴가 바뀌었습니다, /start로 새로 여세요".
- **알림:** 일시정지 중엔 보내지 않는다. 보내기 실패가 앱 작업을 실패시키지 않는다(fire-and-forget + 로그).

### 위험 등급 강제 (`guard.ts`)

엔진이 핸들러를 부르기 전에 등급을 확인한다. `write`는 확인 버튼 뒤에만, `danger`는 `confirmPhrase` 정확히 입력 뒤에만 실행하고 실행 기록(누가·언제·무엇을·인자)을 `onAudit`으로 넘긴다. 핸들러 코드로는 우회할 수 없다.

### 설정 편집기

값 변경 → 범위 검사 → 확인 → `configAdapter.set`. `apply: "restart"`는 "재시작해야 적용" 표시. 비밀값 경로는 매니페스트 검증에서 이미 막힌다.

## 6. 테스트 전략

| 층 | 무엇을 | 어디서 |
|---|---|---|
| 엔진 단위 | 매니페스트 검증, 버튼 데이터 인코딩(64바이트·해시·rev), 등급별 확인 단계, 메시지 분할, 입력 대기 만료, 사라진 버튼 안내, 소유자 검사 | 플러그인 `tests/` |
| 시뮬레이터 | 가짜 업데이트로 모든 메뉴·버튼·명령을 눌러 응답·오류·길이 검사 (`danger`는 확인 화면까지만) | `core/testing/simulate.ts` — 대상 프로젝트에서도 실행 |
| 연결 테스트 | 모든 동작에 핸들러(타입 + 실행 중), 설정 경로가 실제 설정에 존재, 비밀값 없음, 문구 키 존재 | 설치 시 생성되는 `tests/telegram.wiring.test.ts` |
| 예시 통합 | `examples/tracer-like`, `examples/small-app`에서 시뮬레이터 전체 통과 | 플러그인 CI |
| 스킬 평가 | 작은 예시 앱에서 `/telegram-port`를 처음부터 실행해 typecheck·시뮬레이터 통과 | 출시 전 수동 (+ 가능하면 `claude plugin eval`) |

## 7. 위험과 대응

| 위험 | 대응 |
|---|---|
| 추출이 기능을 잘못 묶거나 빠뜨림 | 근거(파일:행)를 붙여 확인 단계에서 보여 주고, 사용자가 초안을 고친다 |
| 위험 기능이 낮은 등급으로 분류됨 | 이름·문서 단서로 보수적으로(높게) 추정, `danger` 목록을 확인 단계에서 반드시 보여 줌, 낮추려면 명시 승인 |
| 재실행이 사람의 수정을 덮어씀 | 연결 파일은 덮어쓰지 않고 추가·주석만, 변경 전 diff 승인 |
| grammY·텔레그램 API 변경 | `core/VERSION`으로 엔진만 교체, 시뮬레이터가 회귀를 잡음 |
| 범용성 부족 (Solana-Tracer에만 맞음) | 코인과 무관한 `examples/small-app`을 출시 조건으로 둠 |

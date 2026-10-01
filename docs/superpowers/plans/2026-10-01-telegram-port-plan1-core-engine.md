# telegram-port 계획 1 — 엔진(core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- **계획 버전:** v1 · **작성일:** 2026-10-01
- **이 계획이 만드는 것:** `core/` 엔진 v0.1.0 (대상 프로젝트에 복사될 범용 텔레그램 엔진)과 그 테스트
- **계획 2(다음):** 스킬(SKILL.md·references)·템플릿·미리 보기·예시 2개·플러그인 출시 — 이 계획이 끝난 뒤 작성

**Goal:** 매니페스트(JSON 데이터)를 읽어 메뉴·명령·위험 등급 확인·설정 편집기·상태·알림을 처리하는 grammY 기반 범용 엔진을, 텔레그램 없이 테스트 가능한 형태로 만든다.

**Architecture:** 핵심은 텔레그램과 무관한 `Engine.handle(Incoming) → Outgoing[]`이다. 메뉴·동작·설정·확인 흐름은 모두 여기서 일어나고, grammY는 `bot.ts`의 얇은 어댑터(메시지 전달·재시도·실패 격리)만 맡는다. 그래서 단위 테스트와 "모든 버튼 눌러 보기" 시뮬레이터가 같은 `handle`을 그대로 부른다. 버튼 데이터는 순서가 아닌 고정 id + `manifestRev`로 인코딩한다.

**Tech Stack:** TypeScript 5.9 (strict, NodeNext ESM), Node ≥20, grammY ^1.36, zod ^3.24, vitest ^3.

**Spec:** `docs/superpowers/specs/2026-10-01-telegram-port-design.md` (§3 매니페스트, §5 엔진 동작, §6 테스트)

## Global Constraints

- 모든 npm 명령 앞에: `export PATH="/c/Users/pinea/AppData/Roaming/fnm/node-versions/v22.23.2/installation:$PATH"`
- `core/` 안의 파일은 `core/` 밖을 import하지 않는다 — 대상 프로젝트에 폴더째 복사되기 때문. 외부 의존성은 `grammy`, `zod`, `node:crypto`만.
- ESM: 상대 import는 `.js` 확장자(`./text.js`).
- 버튼 데이터는 `<manifestRev>|<kind>:<id>[:<arg>]`, kind ∈ `a`(동작) `m`(메뉴) `s`(설정) `c`(확인) `x`(취소). 64바이트를 넘으면 `<rev>|h:<16자 해시>`.
- 위험 등급: `read` 바로 실행 · `write` 확인 버튼 · `danger` `confirmPhrase`를 정확히(앞뒤 공백만 무시, 대소문자 구분) 입력 + `onAudit` 기록. 핸들러로 우회 불가.
- 입력 대기 5분(`INPUT_TTL_MS = 300_000`), 새 `/명령`은 대기를 취소.
- 소유자(`ownerChatId`)가 아닌 채팅은 무응답(기록만).
- 사용자 메시지에 오류 내용·스택을 넣지 않는다. `core.failed`에는 오류 코드만.
- 기본 비밀값 패턴(설정 편집 금지): `*token*`, `*secret*`, `*password*`, `*key*`, `*mnemonic*`, `*seed*`, `*passphrase*`, `*credential*`, `*pass`, `*pwd*` (대소문자 무시; 최종 리뷰에서 설계서의 `*key*`로 복원·확대) + 매니페스트 `settings.excluded`.
- 예약 메뉴 id: `settings`(매니페스트에 `settings`가 있을 때), `status`(매니페스트에 `status`가 있을 때). 직접 정의 금지.
- 텔레그램 메시지 4,096자 초과는 줄바꿈 기준으로 나눠 보낸다. 429는 `retry_after`초 대기 후 최대 3회. "message is not modified"는 무시.
- 코드 주석은 영어로 "왜"만. 커밋 메시지는 명령형 한 줄 + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01WNMUpPWUbcqbQUoyESaLV8`.

## Review Focus

1. **다른 `manifestRev`의 버튼이나, 재시작 뒤의 해시 버튼** — 오류가 아니라 "메뉴가 바뀌었습니다" 안내와 메인 메뉴 버튼이 나와야 한다 → Task 3 `treats another rev and a forgotten hash as stale`, Task 7 `answers a stale button with the stale notice`.
2. **소유자가 아닌 사람이 버튼 데이터를 흉내 내 보냄** — 아무 핸들러도 실행되지 않고 응답도 없어야 한다 → Task 7 `ignores everyone but the owner, buttons included`.
3. **핸들러가 비밀값이 든 오류를 던짐** — 사용자 메시지에는 오류 코드만, 비밀 문자열은 없어야 한다 → Task 7 `shows only an error code when a handler throws`.
4. **위험 확인 문구를 틀리게·소문자로 입력하거나 `c:` 확인 버튼을 위조** — 실행되지 않아야 한다 → Task 7 `runs a danger action only on the exact phrase` · `will not run a danger action from a confirm button`.
5. **입력 대기 중 `/명령`을 보내거나 5분이 지남** — 그 텍스트가 인자로 쓰이지 않아야 한다 → Task 7 `drops a pending input on a new command` · Task 4 `expires after the TTL`.

---

## 파일 구조

| 파일 | 책임 | Task |
|---|---|---|
| `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore` | 저장소 뼈대 | 1 |
| `core/text.ts` | 문구 조회(`makeT`), 메시지 분할, 오류 코드 | 1 |
| `core/messages.core.ts` | 엔진 기본 문구(ko·en) | 1 |
| `core/manifest.ts` | zod 스키마, 교차 검증, 타입 유도 | 2 |
| `core/callback.ts` | 버튼 데이터 인코딩·디코딩 | 3 |
| `core/pending.ts` | 입력 대기(TTL) | 4 |
| `core/guard.ts` | 위험 등급 판정, 확인 문구 비교 | 4 |
| `core/settings.ts` | 설정 편집기 화면·검증·저장 | 5 |
| `core/status.ts` | 상태 화면 | 6 |
| `core/alerts.ts` | 알림 보내기·일시정지 | 6 |
| `core/engine.ts` | `handle()` — 소유자 검사·메뉴·명령·동작·확인·인자·설정·상태 라우팅 | 7 |
| `core/bot.ts` | grammY 어댑터: 전달·분할·재시도·실패 격리·`startTelegram` | 8 |
| `core/testing/simulate.ts` | 모든 버튼 눌러 보기 | 9 |
| `core/index.ts`, `core/VERSION` | 공개 API, 버전 | 10 |
| `tests/*.test.ts`, `tests/bindings.types.ts` | 단위·타입 테스트 | 각 Task |

---

### Task 1: 저장소 뼈대 · 문구 · 메시지 분할

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `core/text.ts`, `core/messages.core.ts`
- Test: `tests/text.test.ts`

**Interfaces:**
- Produces:
  - `type Messages = Readonly<Record<string, string>>`
  - `type Translate = ((key: string, vars?: Record<string, string | number>) => string) & { has(key: string): boolean }`
  - `makeT(project: Messages, core: Messages): Translate`
  - `TELEGRAM_TEXT_LIMIT = 4096`, `splitMessage(text: string, limit?: number): string[]`
  - `errorCode(now?: () => number): string`
  - `CORE_MESSAGES: Readonly<Record<'ko' | 'en', Messages>>`

- [ ] **Step 1: 뼈대 파일**

`package.json`:

```json
{
  "name": "telegram-port",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Port a Telegram bot into any Node/TypeScript project: menus, settings, alerts and status wired to the project's own functions.",
  "license": "MIT",
  "engines": { "node": ">=20" },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "grammy": "^1.36.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["core/**/*.ts", "tests/**/*.ts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['tests/**/*.test.ts'] } });
```

`.gitignore`:

```
node_modules/
dist/
.superpowers/
```

Run: `npm install` → Expected: 오류 없이 `node_modules` 생성.

- [ ] **Step 2: 실패하는 테스트** — `tests/text.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CORE_MESSAGES } from '../core/messages.core.js';
import { errorCode, makeT, splitMessage } from '../core/text.js';

describe('makeT', () => {
  const t = makeT({ 'hello': '안녕 {name}', 'core.done': '끝' }, { 'core.done': '완료', 'core.back': '뒤로' });

  it('fills variables and keeps unknown placeholders', () => {
    expect(t('hello', { name: '진호' })).toBe('안녕 진호');
    expect(t('hello')).toBe('안녕 {name}');
  });

  it('prefers the project text, falls back to core, then to the key', () => {
    expect(t('core.done')).toBe('끝');
    expect(t('core.back')).toBe('뒤로');
    expect(t('nope')).toBe('nope');
  });

  it('says whether a key exists', () => {
    expect(t.has('core.back')).toBe(true);
    expect(t.has('nope')).toBe(false);
  });
});

describe('splitMessage', () => {
  it('keeps short text whole', () => {
    expect(splitMessage('abc')).toEqual(['abc']);
  });

  it('cuts at the last newline before the limit, and hard-cuts a line with none', () => {
    expect(splitMessage('aaaa\nbbbb\ncc', 10)).toEqual(['aaaa\nbbbb', 'cc']);
    expect(splitMessage('x'.repeat(25), 10)).toEqual(['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)]);
  });
});

describe('errorCode', () => {
  it('is short, upper-case and varies', () => {
    const a = errorCode(() => 1_000);
    expect(a).toMatch(/^[0-9A-Z]{6}$/);
    expect(errorCode(() => 2_000_000)).not.toBe(a);
  });
});

describe('CORE_MESSAGES', () => {
  it('has the same keys in every language', () => {
    expect(Object.keys(CORE_MESSAGES.en).sort()).toEqual(Object.keys(CORE_MESSAGES.ko).sort());
  });
});
```

- [ ] **Step 3: 실패 확인** — Run: `npx vitest run tests/text.test.ts` → Expected: FAIL (`Cannot find module '../core/messages.core.js'`).

- [ ] **Step 4: 구현** — `core/text.ts`:

```ts
/** Texts by key. Project texts win over the engine's own (core.*) texts. */
export type Messages = Readonly<Record<string, string>>;

export type Translate = ((key: string, vars?: Record<string, string | number>) => string) & {
  has(key: string): boolean;
};

export function makeT(project: Messages, core: Messages): Translate {
  const lookup = (key: string): string | undefined => project[key] ?? core[key];
  const t = ((key: string, vars?: Record<string, string | number>) => {
    // A missing key shows the key itself: visible in chat, and the manifest check catches it before that.
    const template = lookup(key) ?? key;
    return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
      vars && name in vars ? String(vars[name]) : whole,
    );
  }) as Translate;
  t.has = (key: string) => lookup(key) !== undefined;
  return t;
}

export const TELEGRAM_TEXT_LIMIT = 4096;

/** Telegram refuses longer texts; cut at line breaks so tables and lists stay readable. */
export function splitMessage(text: string, limit = TELEGRAM_TEXT_LIMIT): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const cut = rest.lastIndexOf('\n', limit);
    if (cut > 0) {
      parts.push(rest.slice(0, cut));
      rest = rest.slice(cut + 1);
    } else {
      parts.push(rest.slice(0, limit));
      rest = rest.slice(limit);
    }
  }
  parts.push(rest);
  return parts;
}

/** Short code shown to the user instead of the error itself; the log carries the details under it. */
export function errorCode(now: () => number = Date.now): string {
  const time = now().toString(36).slice(-4);
  const noise = Math.floor(Math.random() * 36 * 36).toString(36).padStart(2, '0');
  return `${time}${noise}`.toUpperCase().padStart(6, '0');
}
```

`core/messages.core.ts`:

```ts
import type { Messages } from './text.js';

/** The engine's own texts. A project may override any of them in its messages file. */
export const CORE_MESSAGES: Readonly<Record<'ko' | 'en', Messages>> = {
  ko: {
    'core.done': '완료했습니다.',
    'core.failed': '실패했습니다 (오류 {code}).',
    'core.stale': '메뉴가 바뀌었습니다. 아래 버튼이나 /start 로 새로 여세요.',
    'core.back': '« 뒤로',
    'core.cancel': '취소',
    'core.cancelled': '취소했습니다.',
    'core.confirm.ask': '{action} — 실행할까요?',
    'core.confirm.yes': '실행',
    'core.danger.ask': '⚠️ 위험한 작업입니다: {action}\n실행하려면 {phrase} 를 그대로 입력하세요.',
    'core.danger.wrong': '입력이 맞지 않아 실행하지 않았습니다.',
    'core.choose': '{action} — 고르세요.',
    'core.input.ask': '값을 입력하세요.',
    'core.input.expired': '입력 시간이 지났습니다. 다시 시작하세요.',
    'core.input.number': '숫자를 입력하세요.',
    'core.settings.title': '⚙️ 설정',
    'core.settings.enter': '새 값을 입력하세요 ({range}). 지금: {value}',
    'core.settings.confirm': '{field}: {from} → {to}\n바꿀까요?',
    'core.settings.saved': '저장했습니다: {field} = {value}',
    'core.settings.restart': '저장했습니다: {field} = {value}\n재시작해야 적용됩니다.',
    'core.settings.invalid': '허용 범위가 아닙니다: {range}',
    'core.settings.on': '켜짐',
    'core.settings.off': '꺼짐',
    'core.settings.enterBtn': '✏️ 값 입력',
    'core.status.title': '📊 상태',
    'core.alerts.paused': '알림을 멈췄습니다. /resume 으로 다시 켭니다.',
    'core.alerts.resumed': '알림을 다시 켰습니다.',
    'core.cmd.start': '메인 메뉴',
    'core.cmd.pause': '알림 멈추기',
    'core.cmd.resume': '알림 다시 켜기',
  },
  en: {
    'core.done': 'Done.',
    'core.failed': 'Failed (error {code}).',
    'core.stale': 'The menu has changed. Use the button below or /start.',
    'core.back': '« Back',
    'core.cancel': 'Cancel',
    'core.cancelled': 'Cancelled.',
    'core.confirm.ask': '{action} — run it?',
    'core.confirm.yes': 'Run',
    'core.danger.ask': '⚠️ Dangerous action: {action}\nType {phrase} exactly to run it.',
    'core.danger.wrong': 'That did not match, so nothing ran.',
    'core.choose': '{action} — pick one.',
    'core.input.ask': 'Enter a value.',
    'core.input.expired': 'That input timed out. Start again.',
    'core.input.number': 'Enter a number.',
    'core.settings.title': '⚙️ Settings',
    'core.settings.enter': 'Enter a new value ({range}). Now: {value}',
    'core.settings.confirm': '{field}: {from} → {to}\nChange it?',
    'core.settings.saved': 'Saved: {field} = {value}',
    'core.settings.restart': 'Saved: {field} = {value}\nTakes effect after a restart.',
    'core.settings.invalid': 'Out of range: {range}',
    'core.settings.on': 'on',
    'core.settings.off': 'off',
    'core.settings.enterBtn': '✏️ Enter value',
    'core.status.title': '📊 Status',
    'core.alerts.paused': 'Alerts paused. /resume turns them back on.',
    'core.alerts.resumed': 'Alerts back on.',
    'core.cmd.start': 'Main menu',
    'core.cmd.pause': 'Pause alerts',
    'core.cmd.resume': 'Resume alerts',
  },
};
```

- [ ] **Step 5: 통과 확인** — Run: `npx vitest run tests/text.test.ts && npm run typecheck` → Expected: PASS (7 tests), 타입 오류 0.

- [ ] **Step 6: 커밋**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore core/text.ts core/messages.core.ts tests/text.test.ts
git commit -m "Scaffold the engine with texts and message splitting"
```

---

### Task 2: 매니페스트 — 스키마·교차 검증·타입 유도

**Files:**
- Create: `core/manifest.ts`
- Test: `tests/manifest.test.ts`, `tests/fixtures.ts`

**Interfaces:**
- Consumes: `Messages` (Task 1)
- Produces:
  - `ManifestSchema` (zod), `type Manifest = z.infer<typeof ManifestSchema>`
  - `type ActionSpec = Manifest['actions'][number]`, `type MenuSpec`, `type SettingField`, `type SettingsSpec = NonNullable<Manifest['settings']>`
  - `class ManifestError extends Error { problems: string[] }`
  - `validateManifest(raw: unknown, messages: Messages): Manifest`
  - `DEFAULT_SECRET_PATTERNS: readonly string[]`, `RESERVED_MENUS = ['settings', 'status']`
  - `interface ManifestLike`, `type ActionId<M>`, `type StatusField<M>`, `type AlertId<M>`
  - `tests/fixtures.ts`: `sampleManifest` (as const), `sampleMessages`

- [ ] **Step 1: 테스트 픽스처** — `tests/fixtures.ts` (이후 Task들이 공유):

```ts
import type { Messages } from '../core/text.js';

export const sampleManifest = {
  version: 1,
  manifestRev: 3,
  language: 'ko',
  owner: { env: 'TELEGRAM_CHAT_ID' },
  menus: [
    { id: 'main', title: 'main.title', items: [{ action: 'status.show' }, { menu: 'jobs' }, { menu: 'settings' }, { menu: 'status' }] },
    {
      id: 'jobs',
      title: 'jobs.title',
      items: [
        { action: 'jobs.list' },
        { action: 'jobs.mode', args: ['off', 'fast'] },
        { action: 'jobs.add' },
        { action: 'jobs.purge' },
      ],
    },
  ],
  actions: [
    { id: 'status.show', label: 'status.btn', risk: 'read', command: 'now' },
    { id: 'jobs.list', label: 'jobs.list', risk: 'read', command: 'jobs' },
    { id: 'jobs.mode', label: 'jobs.mode', risk: 'write', arg: { kind: 'enum' } },
    { id: 'jobs.add', label: 'jobs.add', risk: 'write', command: 'add', arg: { kind: 'number', prompt: 'jobs.add.ask' } },
    { id: 'jobs.purge', label: 'jobs.purge', risk: 'danger', command: 'purge', confirmPhrase: 'PURGE' },
  ],
  settings: {
    categories: [{ id: 'gen', title: 'set.gen' }],
    fields: [
      { id: 'jobs.enabled', path: 'jobs.enabled', category: 'gen', label: 'set.enabled', kind: 'boolean', apply: 'live' },
      { id: 'jobs.level', path: 'jobs.level', category: 'gen', label: 'set.level', kind: 'enum', options: ['low', 'high'], apply: 'live' },
      { id: 'jobs.share', path: 'jobs.share', category: 'gen', label: 'set.share', kind: 'float', ratio: true, min: 0, max: 1, apply: 'restart' },
      { id: 'jobs.limit', path: 'jobs.limit', category: 'gen', label: 'set.limit', kind: 'int', min: 1, max: 50, apply: 'live' },
    ],
    excluded: [],
  },
  alerts: [{ id: 'job.done', template: 'alert.jobDone', mutable: true }, { id: 'job.crash', template: 'alert.jobCrash', mutable: false }],
  status: { fields: ['jobs.today', 'jobs.queue'] },
} as const;

export const sampleMessages: Messages = {
  'main.title': '메인',
  'jobs.title': '작업',
  'status.btn': '지금 상태',
  'jobs.list': '작업 목록',
  'jobs.mode': '모드',
  'jobs.add': '작업 추가',
  'jobs.add.ask': '몇 개를 추가할까요?',
  'jobs.purge': '전체 삭제',
  'set.gen': '일반',
  'set.enabled': '작업 켜기',
  'set.level': '수준',
  'set.share': '비율',
  'set.limit': '한도',
  'alert.jobDone': '작업 {name} 완료',
  'alert.jobCrash': '작업 {name} 중단',
  'status.jobs.today': '오늘 작업',
  'status.jobs.queue': '대기열',
};
```

- [ ] **Step 2: 실패하는 테스트** — `tests/manifest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CORE_MESSAGES } from '../core/messages.core.js';
import { ManifestError, validateManifest } from '../core/manifest.js';
import { sampleManifest, sampleMessages } from './fixtures.js';

const msgs = { ...CORE_MESSAGES.ko, ...sampleMessages };
const clone = () => JSON.parse(JSON.stringify(sampleManifest));
const problemsOf = (raw: unknown, m = msgs): string[] => {
  try {
    validateManifest(raw, m);
    return [];
  } catch (err) {
    if (err instanceof ManifestError) return err.problems;
    throw err;
  }
};

describe('validateManifest', () => {
  it('accepts the sample and fills defaults', () => {
    const m = validateManifest(clone(), msgs);
    expect(m.actions).toHaveLength(5);
    expect(m.alerts[0]?.mutable).toBe(true);
  });

  it('rejects a shape error with its path', () => {
    const raw = clone();
    raw.actions[0].risk = 'maybe';
    expect(problemsOf(raw).join()).toContain('actions.0.risk');
  });

  it('requires a main menu, known references and no reserved menu ids', () => {
    const raw = clone();
    raw.menus[0].id = 'home';
    raw.menus[1].items.push({ action: 'ghost' }, { menu: 'nowhere' });
    raw.menus.push({ id: 'settings', title: 'main.title', items: [] });
    const p = problemsOf(raw).join('\n');
    expect(p).toContain('a menu with id "main" is required');
    expect(p).toContain('unknown action ghost');
    expect(p).toContain('unknown menu nowhere');
    expect(p).toContain('reserved menu id: settings');
  });

  it('flags duplicate ids and commands', () => {
    const raw = clone();
    raw.actions[1].id = 'status.show';
    raw.actions[3].command = 'purge';
    const p = problemsOf(raw).join('\n');
    expect(p).toContain('duplicate action id: status.show');
    expect(p).toContain('duplicate command: purge');
  });

  it('needs a confirm phrase on danger, args on enum items and none elsewhere', () => {
    const raw = clone();
    delete raw.actions[4].confirmPhrase;
    raw.menus[1].items[1] = { action: 'jobs.mode' };
    raw.menus[1].items[0] = { action: 'jobs.list', args: ['x'] };
    const p = problemsOf(raw).join('\n');
    expect(p).toContain('danger action jobs.purge needs confirmPhrase');
    expect(p).toContain('enum action jobs.mode needs args');
    expect(p).toContain('args given for non-enum action jobs.list');
  });

  it('rejects an action that no menu shows and no command reaches', () => {
    const raw = clone();
    raw.actions.push({ id: 'lost', label: 'jobs.list', risk: 'read' });
    expect(problemsOf(raw).join()).toContain('action lost is on no menu and has no command');
  });

  it('refuses secret-looking setting paths, including project patterns', () => {
    const raw = clone();
    raw.settings.fields.push({ id: 'k', path: 'apiKeys.helius', category: 'gen', label: 'set.limit', kind: 'int', apply: 'live' });
    raw.settings.fields.push({ id: 'w', path: 'wallet.seed', category: 'gen', label: 'set.limit', kind: 'int', apply: 'live' });
    raw.settings.excluded = ['*.seed'];
    const p = problemsOf(raw).join('\n');
    expect(p).toContain('setting k: path apiKeys.helius looks secret');
    expect(p).toContain('setting w: path wallet.seed looks secret');
  });

  it('checks setting categories and enum options', () => {
    const raw = clone();
    raw.settings.fields[0].category = 'nope';
    delete raw.settings.fields[1].options;
    const p = problemsOf(raw).join('\n');
    expect(p).toContain('setting jobs.enabled: unknown category nope');
    expect(p).toContain('setting jobs.level: enum needs options');
  });

  it('lists every text key the messages file lacks', () => {
    const { ['status.jobs.queue']: _q, ['jobs.add.ask']: _a, ...partial } = sampleMessages;
    const p = problemsOf(clone(), { ...CORE_MESSAGES.ko, ...partial }).join('\n');
    expect(p).toContain('missing text: status.jobs.queue');
    expect(p).toContain('missing text: jobs.add.ask');
  });
});
```

- [ ] **Step 3: 실패 확인** — Run: `npx vitest run tests/manifest.test.ts` → Expected: FAIL (`Cannot find module '../core/manifest.js'`).

- [ ] **Step 4: 구현** — `core/manifest.ts`:

```ts
import { z } from 'zod';
import type { Messages } from './text.js';

const Id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/).max(48);
const TextKey = z.string().min(1);

const ArgSchema = z.object({ kind: z.enum(['enum', 'text', 'number']), prompt: TextKey.optional() });

const ActionSchema = z.object({
  id: Id,
  label: TextKey,
  risk: z.enum(['read', 'write', 'danger']),
  command: z.string().regex(/^[a-z0-9_]{1,32}$/).optional(),
  arg: ArgSchema.optional(),
  confirmPhrase: z.string().min(1).optional(),
});

const MenuItemSchema = z.union([
  z.object({ action: Id, args: z.array(z.string().min(1)).optional() }).strict(),
  z.object({ menu: Id }).strict(),
]);

const MenuSchema = z.object({ id: Id, title: TextKey, items: z.array(MenuItemSchema) });

const FieldSchema = z.object({
  id: Id,
  path: z.string().min(1),
  category: Id,
  label: TextKey,
  kind: z.enum(['boolean', 'enum', 'int', 'float']),
  options: z.array(z.string().min(1)).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  ratio: z.boolean().optional(),
  apply: z.enum(['live', 'restart']),
});

const SettingsSchema = z.object({
  categories: z.array(z.object({ id: Id, title: TextKey })),
  fields: z.array(FieldSchema),
  excluded: z.array(z.string()).default([]),
});

export const ManifestSchema = z.object({
  version: z.literal(1),
  manifestRev: z.number().int().min(0),
  language: z.string().min(2),
  owner: z.object({ env: z.string().min(1) }),
  menus: z.array(MenuSchema).min(1),
  actions: z.array(ActionSchema),
  settings: SettingsSchema.optional(),
  alerts: z.array(z.object({ id: Id, template: TextKey, mutable: z.boolean().default(true) })).default([]),
  status: z.object({ title: TextKey.optional(), fields: z.array(Id).min(1) }).optional(),
});

export type Manifest = z.infer<typeof ManifestSchema>;
export type ActionSpec = Manifest['actions'][number];
export type MenuSpec = Manifest['menus'][number];
export type SettingsSpec = NonNullable<Manifest['settings']>;
export type SettingField = SettingsSpec['fields'][number];

/** Paths that must never become chat-editable, whatever a manifest says. */
export const DEFAULT_SECRET_PATTERNS: readonly string[] = [
  '*token*', '*secret*', '*password*', '*apikey*', '*api_key*', 'apikeys.*', '*privatekey*',
];
/** Menus the engine draws itself; a manifest only links to them. */
export const RESERVED_MENUS = ['settings', 'status'] as const;

export class ManifestError extends Error {
  constructor(readonly problems: string[]) {
    super(`invalid telegram manifest:\n- ${problems.join('\n- ')}`);
    this.name = 'ManifestError';
  }
}

const globToRegex = (glob: string): RegExp =>
  new RegExp(`^${glob.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 'i');

/** Shape check, then everything the shape cannot say: references, duplicates, secrets, missing texts. */
export function validateManifest(raw: unknown, messages: Messages): Manifest {
  const parsed = ManifestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ManifestError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  const m = parsed.data;
  const problems: string[] = [];
  const dup = (what: string, ids: readonly string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) problems.push(`duplicate ${what}: ${id}`);
      seen.add(id);
    }
  };
  dup('menu id', m.menus.map((x) => x.id));
  dup('action id', m.actions.map((x) => x.id));
  dup('command', m.actions.flatMap((a) => (a.command ? [a.command] : [])));
  dup('alert id', m.alerts.map((x) => x.id));
  dup('setting id', m.settings?.fields.map((x) => x.id) ?? []);
  dup('category id', m.settings?.categories.map((x) => x.id) ?? []);

  for (const menu of m.menus) {
    if ((RESERVED_MENUS as readonly string[]).includes(menu.id)) problems.push(`reserved menu id: ${menu.id}`);
  }
  if (!m.menus.some((x) => x.id === 'main')) problems.push('a menu with id "main" is required');

  const menuIds = new Set(m.menus.map((x) => x.id));
  if (m.settings) menuIds.add('settings');
  if (m.status) menuIds.add('status');
  const actions = new Map(m.actions.map((a) => [a.id, a]));
  const onMenu = new Set<string>();
  for (const menu of m.menus) {
    for (const item of menu.items) {
      if ('menu' in item) {
        if (!menuIds.has(item.menu)) problems.push(`menu ${menu.id}: unknown menu ${item.menu}`);
        continue;
      }
      const a = actions.get(item.action);
      if (!a) {
        problems.push(`menu ${menu.id}: unknown action ${item.action}`);
        continue;
      }
      onMenu.add(a.id);
      if (a.arg?.kind === 'enum' && !item.args?.length) problems.push(`menu ${menu.id}: enum action ${a.id} needs args`);
      if (item.args && a.arg?.kind !== 'enum') problems.push(`menu ${menu.id}: args given for non-enum action ${a.id}`);
    }
  }
  for (const a of m.actions) {
    if (!onMenu.has(a.id) && !a.command) problems.push(`action ${a.id} is on no menu and has no command`);
    if (a.risk === 'danger' && !a.confirmPhrase) problems.push(`danger action ${a.id} needs confirmPhrase`);
  }

  if (m.settings) {
    const cats = new Set(m.settings.categories.map((c) => c.id));
    const secret = [...DEFAULT_SECRET_PATTERNS, ...m.settings.excluded].map(globToRegex);
    for (const f of m.settings.fields) {
      if (!cats.has(f.category)) problems.push(`setting ${f.id}: unknown category ${f.category}`);
      if (f.kind === 'enum' && !f.options?.length) problems.push(`setting ${f.id}: enum needs options`);
      if (secret.some((r) => r.test(f.path))) {
        problems.push(`setting ${f.id}: path ${f.path} looks secret and cannot be edited from chat`);
      }
    }
  }

  const keys = [
    ...m.menus.map((x) => x.title),
    ...m.actions.flatMap((a) => [a.label, ...(a.arg?.prompt ? [a.arg.prompt] : [])]),
    ...(m.settings?.categories.map((c) => c.title) ?? []),
    ...(m.settings?.fields.map((f) => f.label) ?? []),
    ...m.alerts.map((a) => a.template),
    ...(m.status ? [...(m.status.title ? [m.status.title] : []), ...m.status.fields.map((f) => `status.${f}`)] : []),
  ];
  for (const key of new Set(keys)) {
    if (!(key in messages)) problems.push(`missing text: ${key}`);
  }

  if (problems.length > 0) throw new ManifestError(problems);
  return m;
}

/** The part of a manifest (imported `as const`) the binding types read. */
export interface ManifestLike {
  readonly actions: readonly { readonly id: string }[];
  readonly status?: { readonly fields: readonly string[] };
  readonly alerts?: readonly { readonly id: string }[];
}
export type ActionId<M extends ManifestLike> = M['actions'][number]['id'];
export type StatusField<M extends ManifestLike> =
  NonNullable<M['status']> extends { readonly fields: readonly (infer F extends string)[] } ? F : never;
export type AlertId<M extends ManifestLike> =
  NonNullable<M['alerts']> extends readonly { readonly id: infer A extends string }[] ? A : never;
```

- [ ] **Step 5: 통과 확인** — Run: `npx vitest run tests/manifest.test.ts && npm run typecheck` → Expected: PASS (9 tests), 타입 오류 0.

- [ ] **Step 6: 커밋**

```bash
git add core/manifest.ts tests/manifest.test.ts tests/fixtures.ts
git commit -m "Validate the manifest and derive binding types from it"
```

---

### Task 3: 버튼 데이터 인코딩

**Files:**
- Create: `core/callback.ts`
- Test: `tests/callback.test.ts`

**Interfaces:**
- Produces:
  - `type CallbackKind = 'a' | 'm' | 's' | 'c' | 'x'`
  - `interface Decoded { kind: CallbackKind; id: string; arg?: string }`
  - `type DecodeResult = { ok: true; value: Decoded } | { ok: false; reason: 'stale' | 'unknown' }`
  - `MAX_CALLBACK_BYTES = 64`
  - `class CallbackCodec { constructor(rev: number); encode(kind, id, arg?): string; decode(data: string): DecodeResult }`

- [ ] **Step 1: 실패하는 테스트** — `tests/callback.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CallbackCodec, MAX_CALLBACK_BYTES } from '../core/callback.js';

describe('CallbackCodec', () => {
  it('round-trips a stable id, with and without an argument containing colons', () => {
    const c = new CallbackCodec(3);
    expect(c.encode('a', 'jobs.list')).toBe('3|a:jobs.list');
    expect(c.decode(c.encode('a', 'jobs.list'))).toEqual({ ok: true, value: { kind: 'a', id: 'jobs.list', arg: undefined } });
    expect(c.decode(c.encode('s', 'v.jobs.level', 'a:b'))).toEqual({ ok: true, value: { kind: 's', id: 'v.jobs.level', arg: 'a:b' } });
  });

  it('hashes data past 64 bytes and still decodes it', () => {
    const c = new CallbackCodec(1);
    const data = c.encode('a', 'wallet.remove', 'x'.repeat(80));
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(MAX_CALLBACK_BYTES);
    expect(data.startsWith('1|h:')).toBe(true);
    expect(c.decode(data)).toEqual({ ok: true, value: { kind: 'a', id: 'wallet.remove', arg: 'x'.repeat(80) } });
  });

  it('treats another rev and a forgotten hash as stale', () => {
    const old = new CallbackCodec(2);
    const fresh = new CallbackCodec(3);
    expect(fresh.decode(old.encode('a', 'jobs.list'))).toEqual({ ok: false, reason: 'stale' });
    const hashed = old.encode('a', 'id', 'y'.repeat(80));
    expect(new CallbackCodec(2).decode(hashed)).toEqual({ ok: false, reason: 'stale' });
  });

  it('calls anything else unknown', () => {
    const c = new CallbackCodec(1);
    expect(c.decode('hello')).toEqual({ ok: false, reason: 'unknown' });
    expect(c.decode('1|q:id')).toEqual({ ok: false, reason: 'unknown' });
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/callback.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: 구현** — `core/callback.ts`:

```ts
import { createHash } from 'node:crypto';

/** a = action, m = menu, s = settings, c = confirm a write action, x = cancel. */
export type CallbackKind = 'a' | 'm' | 's' | 'c' | 'x';
export interface Decoded {
  kind: CallbackKind;
  id: string;
  arg?: string;
}
export type DecodeResult = { ok: true; value: Decoded } | { ok: false; reason: 'stale' | 'unknown' };

/** Telegram's limit on callback_data. */
export const MAX_CALLBACK_BYTES = 64;

/**
 * Buttons carry the item's id, never its position, so reordering a menu cannot
 * make an open button run a different action. The manifest revision rides along:
 * a button from an older menu is answered as stale instead of guessed at.
 */
export class CallbackCodec {
  // Hashes live in memory: after a restart an old hashed button reads as stale, which is the honest answer.
  private readonly hashed = new Map<string, Decoded>();

  constructor(private readonly rev: number) {}

  encode(kind: CallbackKind, id: string, arg?: string): string {
    const raw = `${this.rev}|${kind}:${id}${arg === undefined ? '' : `:${arg}`}`;
    if (Buffer.byteLength(raw, 'utf8') <= MAX_CALLBACK_BYTES) return raw;
    const hash = createHash('sha1').update(raw).digest('base64url').slice(0, 16);
    this.hashed.set(hash, { kind, id, arg });
    return `${this.rev}|h:${hash}`;
  }

  decode(data: string): DecodeResult {
    const bar = data.indexOf('|');
    if (bar < 0) return { ok: false, reason: 'unknown' };
    if (Number(data.slice(0, bar)) !== this.rev) return { ok: false, reason: 'stale' };
    const body = data.slice(bar + 1);
    if (body.startsWith('h:')) {
      const known = this.hashed.get(body.slice(2));
      return known ? { ok: true, value: known } : { ok: false, reason: 'stale' };
    }
    const m = /^([amscx]):([^:]+)(?::([\s\S]*))?$/.exec(body);
    if (!m) return { ok: false, reason: 'unknown' };
    return { ok: true, value: { kind: m[1] as CallbackKind, id: m[2] as string, arg: m[3] } };
  }
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/callback.test.ts && npm run typecheck` → Expected: PASS (4 tests).

- [ ] **Step 5: 커밋**

```bash
git add core/callback.ts tests/callback.test.ts
git commit -m "Encode buttons by stable id and manifest revision"
```

---

### Task 4: 입력 대기 · 위험 등급

**Files:**
- Create: `core/pending.ts`, `core/guard.ts`
- Test: `tests/pending.test.ts`, `tests/guard.test.ts`

**Interfaces:**
- Consumes: `ActionSpec` (Task 2)
- Produces:
  - `type Pending = { kind: 'arg'; actionId: string } | { kind: 'danger'; actionId: string; arg?: string } | { kind: 'setting'; fieldId: string }`
  - `INPUT_TTL_MS = 300_000`
  - `class PendingInputs { constructor(ttlMs?: number, now?: () => number); set(chatId: number, p: Pending): void; cancel(chatId: number): void; take(chatId: number): { pending: Pending } | { expired: true } | null }`
  - `guardDecision(action: ActionSpec): 'run' | 'confirm' | 'danger'`
  - `phraseMatches(expected: string, typed: string): boolean`

- [ ] **Step 1: 실패하는 테스트**

`tests/pending.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { INPUT_TTL_MS, PendingInputs } from '../core/pending.js';

describe('PendingInputs', () => {
  it('hands a pending input out once', () => {
    const p = new PendingInputs();
    p.set(1, { kind: 'arg', actionId: 'a' });
    expect(p.take(1)).toEqual({ pending: { kind: 'arg', actionId: 'a' } });
    expect(p.take(1)).toBeNull();
  });

  it('expires after the TTL', () => {
    let t = 0;
    const p = new PendingInputs(INPUT_TTL_MS, () => t);
    p.set(1, { kind: 'setting', fieldId: 'f' });
    t = INPUT_TTL_MS + 1;
    expect(p.take(1)).toEqual({ expired: true });
  });

  it('keeps chats apart and cancels', () => {
    const p = new PendingInputs();
    p.set(1, { kind: 'arg', actionId: 'a' });
    p.set(2, { kind: 'arg', actionId: 'b' });
    p.cancel(1);
    expect(p.take(1)).toBeNull();
    expect(p.take(2)).toEqual({ pending: { kind: 'arg', actionId: 'b' } });
  });
});
```

`tests/guard.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { guardDecision, phraseMatches } from '../core/guard.js';

describe('guardDecision', () => {
  it('runs read, confirms write, gates danger', () => {
    expect(guardDecision({ id: 'a', label: 'l', risk: 'read' })).toBe('run');
    expect(guardDecision({ id: 'a', label: 'l', risk: 'write' })).toBe('confirm');
    expect(guardDecision({ id: 'a', label: 'l', risk: 'danger', confirmPhrase: 'X' })).toBe('danger');
  });
});

describe('phraseMatches', () => {
  it('ignores surrounding spaces only', () => {
    expect(phraseMatches('PURGE', '  PURGE ')).toBe(true);
    expect(phraseMatches('PURGE', 'purge')).toBe(false);
    expect(phraseMatches('PURGE', 'PURGE!')).toBe(false);
    expect(phraseMatches('PURGE', 'PUR GE')).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/pending.test.ts tests/guard.test.ts` → Expected: FAIL (modules not found).

- [ ] **Step 3: 구현**

`core/pending.ts`:

```ts
/** What the next plain-text message from a chat will be taken as. */
export type Pending =
  | { kind: 'arg'; actionId: string }
  | { kind: 'danger'; actionId: string; arg?: string }
  | { kind: 'setting'; fieldId: string };

/** Long enough to look a value up; short enough that a stale wait cannot swallow a later message. */
export const INPUT_TTL_MS = 5 * 60_000;

export class PendingInputs {
  private readonly byChat = new Map<number, { pending: Pending; at: number }>();

  constructor(
    private readonly ttlMs = INPUT_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  set(chatId: number, pending: Pending): void {
    this.byChat.set(chatId, { pending, at: this.now() });
  }

  cancel(chatId: number): void {
    this.byChat.delete(chatId);
  }

  /** One-shot: the wait is gone after this, answered or expired. */
  take(chatId: number): { pending: Pending } | { expired: true } | null {
    const entry = this.byChat.get(chatId);
    if (!entry) return null;
    this.byChat.delete(chatId);
    return this.now() - entry.at > this.ttlMs ? { expired: true } : { pending: entry.pending };
  }
}
```

`core/guard.ts`:

```ts
import type { ActionSpec } from './manifest.js';

/**
 * The engine asks this before any handler runs, so a handler cannot skip it:
 * read runs at once, write needs a confirm tap, danger needs the typed phrase.
 */
export function guardDecision(action: ActionSpec): 'run' | 'confirm' | 'danger' {
  if (action.risk === 'danger') return 'danger';
  if (action.risk === 'write') return 'confirm';
  return 'run';
}

/** Exact match after trimming: a near miss ("purge", "PURGE!") is not consent. */
export function phraseMatches(expected: string, typed: string): boolean {
  return typed.trim() === expected;
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/pending.test.ts tests/guard.test.ts && npm run typecheck` → Expected: PASS (5 tests).

- [ ] **Step 5: 커밋**

```bash
git add core/pending.ts core/guard.ts tests/pending.test.ts tests/guard.test.ts
git commit -m "Add pending inputs with a TTL and the risk guard"
```

---

### Task 5: 설정 편집기

**Files:**
- Create: `core/settings.ts`
- Test: `tests/settings.test.ts`

**Interfaces:**
- Consumes: `SettingsSpec`, `SettingField` (Task 2), `CallbackCodec` (Task 3), `PendingInputs` (Task 4), `Translate`, `errorCode` (Task 1)
- Produces:
  - `interface Button { text: string; data: string }`, `interface Outgoing { text: string; buttons?: Button[][] }` — **여기서 정의하고** Task 7 엔진이 재수출
  - `interface ConfigAdapter { get(path: string): unknown; set(path: string, value: unknown): Promise<void> | void }`
  - `class SettingsUi { constructor(spec: SettingsSpec, config: ConfigAdapter, t: Translate, codec: CallbackCodec, pending: PendingInputs, onError: (err: unknown) => string); home(): Outgoing; onCallback(chatId: number, id: string, arg: string | undefined): Promise<Outgoing[]>; onInput(chatId: number, fieldId: string, text: string): Promise<Outgoing[]> }`
  - 설정 버튼 id 형식(`s` 종류): `home`, `c.<categoryId>`, `f.<fieldId>`(편집기), `v.<fieldId>`+값(확인 화면), `y.<fieldId>`+값(저장), `i.<fieldId>`(입력 대기)

- [ ] **Step 1: 실패하는 테스트** — `tests/settings.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { CallbackCodec } from '../core/callback.js';
import { validateManifest } from '../core/manifest.js';
import { CORE_MESSAGES } from '../core/messages.core.js';
import { PendingInputs } from '../core/pending.js';
import { SettingsUi, type ConfigAdapter, type Outgoing } from '../core/settings.js';
import { makeT } from '../core/text.js';
import { sampleManifest, sampleMessages } from './fixtures.js';

function setup(values: Record<string, unknown> = { 'jobs.enabled': true, 'jobs.level': 'low', 'jobs.share': 0.1, 'jobs.limit': 5 }) {
  const m = validateManifest(JSON.parse(JSON.stringify(sampleManifest)), { ...CORE_MESSAGES.ko, ...sampleMessages });
  const t = makeT(sampleMessages, CORE_MESSAGES.ko);
  const codec = new CallbackCodec(m.manifestRev);
  const pending = new PendingInputs();
  const store = { ...values };
  const config: ConfigAdapter = { get: (p) => store[p], set: vi.fn((p: string, v: unknown) => void (store[p] = v)) };
  const ui = new SettingsUi(m.settings!, config, t, codec, pending, () => 'FAILED');
  const press = async (out: Outgoing, text: string) => {
    const b = out.buttons!.flat().find((x) => x.text.includes(text));
    if (!b) throw new Error(`no button "${text}" in ${JSON.stringify(out.buttons)}`);
    const d = codec.decode(b.data);
    if (!d.ok) throw new Error('bad data');
    return (await ui.onCallback(1, d.value.id, d.value.arg))[0]!;
  };
  return { ui, store, config, pending, press, codec };
}

describe('SettingsUi', () => {
  it('walks home → category → field and shows current values', async () => {
    const { ui, press } = setup();
    const home = ui.home();
    const cat = await press(home, '일반');
    const texts = cat.buttons!.flat().map((b) => b.text);
    expect(texts).toContain('작업 켜기: 켜짐');
    expect(texts).toContain('비율: 10%');
    expect(texts).toContain('한도: 5');
  });

  it('sets an enum through a confirm step and says when a restart is needed', async () => {
    const { ui, press, store } = setup();
    const cat = await press(ui.home(), '일반');
    const editor = await press(cat, '수준');
    const confirm = await press(editor, 'high');
    expect(confirm.text).toContain('low → high');
    expect(store['jobs.level']).toBe('low');
    const saved = await press(confirm, '실행');
    expect(saved.text).toContain('저장했습니다: 수준 = high');
    expect(store['jobs.level']).toBe('high');
  });

  it('takes a ratio as a percentage and refuses out-of-range numbers, waiting again', async () => {
    const { ui, press, store, pending } = setup();
    const editor = await press(await press(ui.home(), '일반'), '비율');
    const ask = await press(editor, '값 입력');
    expect(ask.text).toContain('0–100%');
    const bad = (await ui.onInput(1, 'jobs.share', '140'))[0]!;
    expect(bad.text).toContain('허용 범위가 아닙니다');
    expect(pending.take(1)).toEqual({ pending: { kind: 'setting', fieldId: 'jobs.share' } });
    const confirm = (await ui.onInput(1, 'jobs.share', '35%'))[0]!;
    expect(confirm.text).toContain('10% → 35%');
    const saved = await press(confirm, '실행');
    expect(saved.text).toContain('재시작해야 적용됩니다');
    expect(store['jobs.share']).toBe(0.35);
  });

  it('refuses a non-integer for an int field', async () => {
    const { ui } = setup();
    expect((await ui.onInput(1, 'jobs.limit', '2.5'))[0]!.text).toContain('1–50');
  });

  it('reports a failed save without throwing', async () => {
    const { ui, press, config } = setup();
    vi.mocked(config.set).mockImplementation(() => {
      throw new Error('disk full');
    });
    const confirm = await press(await press(await press(ui.home(), '일반'), '작업 켜기'), '꺼짐');
    expect((await press(confirm, '실행')).text).toBe('FAILED');
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/settings.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: 구현** — `core/settings.ts`:

```ts
import type { CallbackCodec } from './callback.js';
import type { SettingField, SettingsSpec } from './manifest.js';
import type { PendingInputs } from './pending.js';
import type { Translate } from './text.js';

export interface Button {
  text: string;
  data: string;
}
export interface Outgoing {
  text: string;
  buttons?: Button[][];
}

/** How the engine reads and writes the project's own config; the project decides where it lives. */
export interface ConfigAdapter {
  get(path: string): unknown;
  set(path: string, value: unknown): Promise<void> | void;
}

type Parsed = { ok: true; value: unknown } | { ok: false };

export class SettingsUi {
  private readonly fields: Map<string, SettingField>;

  constructor(
    private readonly spec: SettingsSpec,
    private readonly config: ConfigAdapter,
    private readonly t: Translate,
    private readonly codec: CallbackCodec,
    private readonly pending: PendingInputs,
    private readonly onError: (err: unknown) => string,
  ) {
    this.fields = new Map(spec.fields.map((f) => [f.id, f]));
  }

  home(): Outgoing {
    return {
      text: this.t('core.settings.title'),
      buttons: [
        ...this.spec.categories.map((c) => [{ text: this.t(c.title), data: this.codec.encode('s', `c.${c.id}`) }]),
        [{ text: this.t('core.back'), data: this.codec.encode('m', 'main') }],
      ],
    };
  }

  async onCallback(chatId: number, id: string, arg: string | undefined): Promise<Outgoing[]> {
    const dot = id.indexOf('.');
    const op = dot < 0 ? id : id.slice(0, dot);
    const target = dot < 0 ? '' : id.slice(dot + 1);
    if (op === 'c') return [this.category(target)];
    const field = this.fields.get(target);
    if (op === 'home' || !field) return [this.home()];
    if (op === 'f') return [this.editor(field)];
    if (op === 'i') {
      this.pending.set(chatId, { kind: 'setting', fieldId: field.id });
      return [{ text: this.t('core.settings.enter', { range: this.range(field), value: this.current(field) }), buttons: [this.cancelRow()] }];
    }
    const parsed = this.parse(field, arg ?? '', false);
    if (!parsed.ok) return [this.editor(field)];
    if (op === 'v') return [this.confirm(field, parsed.value)];
    if (op === 'y') return [await this.save(field, parsed.value)];
    return [this.home()];
  }

  async onInput(chatId: number, fieldId: string, text: string): Promise<Outgoing[]> {
    const field = this.fields.get(fieldId);
    if (!field) return [this.home()];
    const parsed = this.parse(field, text.trim().replace(/%$/, '').trim(), true);
    if (!parsed.ok) {
      // Ask again rather than drop the user back at the menu after one typo.
      this.pending.set(chatId, { kind: 'setting', fieldId });
      return [{ text: this.t('core.settings.invalid', { range: this.range(field) }), buttons: [this.cancelRow()] }];
    }
    return [this.confirm(field, parsed.value)];
  }

  private category(catId: string): Outgoing {
    const cat = this.spec.categories.find((c) => c.id === catId);
    if (!cat) return this.home();
    return {
      text: this.t(cat.title),
      buttons: [
        ...this.spec.fields
          .filter((f) => f.category === catId)
          .map((f) => [{ text: `${this.t(f.label)}: ${this.current(f)}`, data: this.codec.encode('s', `f.${f.id}`) }]),
        [{ text: this.t('core.back'), data: this.codec.encode('s', 'home') }],
      ],
    };
  }

  private editor(f: SettingField): Outgoing {
    const pick = (value: string, text: string) => ({ text, data: this.codec.encode('s', `v.${f.id}`, value) });
    let rows: Button[][];
    if (f.kind === 'boolean') {
      rows = [[pick('true', this.t('core.settings.on')), pick('false', this.t('core.settings.off'))]];
    } else if (f.kind === 'enum') {
      rows = (f.options ?? []).map((o) => [pick(o, this.t.has(`${f.label}.${o}`) ? this.t(`${f.label}.${o}`) : o)]);
    } else {
      rows = [[{ text: this.t('core.settings.enterBtn'), data: this.codec.encode('s', `i.${f.id}`) }]];
    }
    rows.push([{ text: this.t('core.back'), data: this.codec.encode('s', `c.${f.category}`) }]);
    return { text: `${this.t(f.label)}: ${this.current(f)}`, buttons: rows };
  }

  private confirm(f: SettingField, value: unknown): Outgoing {
    return {
      text: this.t('core.settings.confirm', { field: this.t(f.label), from: this.current(f), to: this.format(f, value) }),
      buttons: [
        [{ text: this.t('core.confirm.yes'), data: this.codec.encode('s', `y.${f.id}`, String(value)) }],
        this.cancelRow(),
      ],
    };
  }

  private async save(f: SettingField, value: unknown): Promise<Outgoing> {
    const back = [[{ text: this.t('core.back'), data: this.codec.encode('s', `c.${f.category}`) }]];
    try {
      await this.config.set(f.path, value);
    } catch (err) {
      return { text: this.onError(err), buttons: back };
    }
    const key = f.apply === 'restart' ? 'core.settings.restart' : 'core.settings.saved';
    return { text: this.t(key, { field: this.t(f.label), value: this.format(f, value) }), buttons: back };
  }

  /** `fromInput`: a ratio typed by a person is a percentage; one from a button is already a fraction. */
  private parse(f: SettingField, raw: string, fromInput: boolean): Parsed {
    if (f.kind === 'boolean') return raw === 'true' || raw === 'false' ? { ok: true, value: raw === 'true' } : { ok: false };
    if (f.kind === 'enum') return f.options?.includes(raw) ? { ok: true, value: raw } : { ok: false };
    if (raw === '') return { ok: false };
    let n = Number(raw);
    if (!Number.isFinite(n)) return { ok: false };
    if (f.kind === 'int' && !Number.isInteger(n)) return { ok: false };
    if (f.ratio && fromInput) n = Math.round(n * 1e6) / 1e8;
    const min = f.min ?? (f.ratio ? 0 : -Infinity);
    const max = f.max ?? (f.ratio ? 1 : Infinity);
    return n >= min && n <= max ? { ok: true, value: n } : { ok: false };
  }

  private current(f: SettingField): string {
    return this.format(f, this.config.get(f.path));
  }

  private format(f: SettingField, v: unknown): string {
    if (v === undefined || v === null) return '—';
    if (f.kind === 'boolean') return this.t(v ? 'core.settings.on' : 'core.settings.off');
    if (f.ratio && typeof v === 'number') return `${Math.round(v * 1000) / 10}%`;
    return String(v);
  }

  private range(f: SettingField): string {
    if (f.ratio) return `${Math.round((f.min ?? 0) * 100)}–${Math.round((f.max ?? 1) * 100)}%`;
    return `${f.min ?? '−∞'}–${f.max ?? '∞'}`;
  }

  private cancelRow(): Button[] {
    return [{ text: this.t('core.cancel'), data: this.codec.encode('x', 'cancel') }];
  }
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/settings.test.ts && npm run typecheck` → Expected: PASS (5 tests).

- [ ] **Step 5: 커밋**

```bash
git add core/settings.ts tests/settings.test.ts
git commit -m "Edit settings from chat with range checks and a confirm step"
```

---

### Task 6: 상태 화면 · 알림

**Files:**
- Create: `core/status.ts`, `core/alerts.ts`
- Test: `tests/status.test.ts`, `tests/alerts.test.ts`

**Interfaces:**
- Consumes: `Manifest` (Task 2), `Translate` (Task 1)
- Produces:
  - `type StatusFn = () => Promise<string | number | null> | string | number | null`
  - `renderStatus(title: string, fields: readonly string[], fns: Readonly<Record<string, StatusFn>>, t: Translate, onError: (field: string, err: unknown) => void): Promise<string>`
  - `interface EngineLog { warn(obj: object, msg: string): void; error(obj: object, msg: string): void }` — **여기서 정의**, Task 7·8이 재사용
  - `class Alerts { constructor(o: { manifest: Manifest; t: Translate; send: (text: string) => Promise<void>; log?: EngineLog }); pause(): void; resume(): void; readonly paused: boolean; send(id: string, vars?: Record<string, string | number>): Promise<boolean> }`

- [ ] **Step 1: 실패하는 테스트**

`tests/status.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { renderStatus } from '../core/status.js';
import { makeT } from '../core/text.js';

const t = makeT({ 'status.a': '가', 'status.b': '나', 'status.c': '다' }, {});

describe('renderStatus', () => {
  it('lists every field, showing — for null and for a field that throws', async () => {
    const onError = vi.fn();
    const text = await renderStatus('📊', ['a', 'b', 'c'], { a: () => 3, b: async () => null, c: () => { throw new Error('boom'); } }, t, onError);
    expect(text).toBe('📊\n가: 3\n나: —\n다: —');
    expect(onError).toHaveBeenCalledWith('c', expect.any(Error));
  });
});
```

`tests/alerts.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { Alerts } from '../core/alerts.js';
import { validateManifest } from '../core/manifest.js';
import { CORE_MESSAGES } from '../core/messages.core.js';
import { makeT } from '../core/text.js';
import { sampleManifest, sampleMessages } from './fixtures.js';

function setup(send = vi.fn(async (_text: string) => undefined)) {
  const manifest = validateManifest(JSON.parse(JSON.stringify(sampleManifest)), { ...CORE_MESSAGES.ko, ...sampleMessages });
  const log = { warn: vi.fn(), error: vi.fn() };
  return { alerts: new Alerts({ manifest, t: makeT(sampleMessages, CORE_MESSAGES.ko), send, log }), send, log };
}

describe('Alerts', () => {
  it('fills the template and sends', async () => {
    const { alerts, send } = setup();
    expect(await alerts.send('job.done', { name: 'A' })).toBe(true);
    expect(send).toHaveBeenCalledWith('작업 A 완료');
  });

  it('holds mutable alerts while paused but always sends the unmutable ones', async () => {
    const { alerts, send } = setup();
    alerts.pause();
    expect(await alerts.send('job.done', { name: 'A' })).toBe(false);
    expect(await alerts.send('job.crash', { name: 'B' })).toBe(true);
    alerts.resume();
    expect(await alerts.send('job.done', { name: 'C' })).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('never throws: an unknown id or a failed send is logged and reported false', async () => {
    const { alerts, log } = setup(vi.fn(async () => { throw new Error('network'); }));
    expect(await alerts.send('nope')).toBe(false);
    expect(await alerts.send('job.done', { name: 'A' })).toBe(false);
    expect(log.warn).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/status.test.ts tests/alerts.test.ts` → Expected: FAIL (modules not found).

- [ ] **Step 3: 구현**

`core/status.ts`:

```ts
import type { Translate } from './text.js';

/** One status value, read when the screen opens. */
export type StatusFn = () => Promise<string | number | null> | string | number | null;

/** A field that fails shows "—": one broken counter must not hide the rest of the screen. */
export async function renderStatus(
  title: string,
  fields: readonly string[],
  fns: Readonly<Record<string, StatusFn>>,
  t: Translate,
  onError: (field: string, err: unknown) => void,
): Promise<string> {
  const lines = await Promise.all(
    fields.map(async (field) => {
      try {
        const fn = fns[field];
        const value = fn ? await fn() : null;
        return `${t(`status.${field}`)}: ${value ?? '—'}`;
      } catch (err) {
        onError(field, err);
        return `${t(`status.${field}`)}: —`;
      }
    }),
  );
  return [title, ...lines].join('\n');
}
```

`core/alerts.ts`:

```ts
import type { Manifest } from './manifest.js';
import type { Translate } from './text.js';

export interface EngineLog {
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

/**
 * Alerts are fire-and-forget for the app: a send that fails is logged, never
 * thrown, so a Telegram outage cannot fail the work that raised the alert.
 */
export class Alerts {
  private isPaused = false;

  constructor(
    private readonly o: { manifest: Manifest; t: Translate; send: (text: string) => Promise<void>; log?: EngineLog },
  ) {}

  get paused(): boolean {
    return this.isPaused;
  }

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
  }

  async send(id: string, vars: Record<string, string | number> = {}): Promise<boolean> {
    const spec = this.o.manifest.alerts.find((a) => a.id === id);
    if (!spec) {
      this.o.log?.warn({ id }, 'unknown telegram alert');
      return false;
    }
    // `mutable: false` marks alerts that must get through even while paused (failures, stops).
    if (this.isPaused && spec.mutable) return false;
    try {
      await this.o.send(this.o.t(spec.template, vars));
      return true;
    } catch (err) {
      this.o.log?.warn({ id, err: String(err) }, 'telegram alert not sent');
      return false;
    }
  }
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/status.test.ts tests/alerts.test.ts && npm run typecheck` → Expected: PASS (4 tests).

- [ ] **Step 5: 커밋**

```bash
git add core/status.ts core/alerts.ts tests/status.test.ts tests/alerts.test.ts
git commit -m "Render the status screen and send alerts without ever throwing"
```

---

### Task 7: 엔진 — `handle()`

**Files:**
- Create: `core/engine.ts`
- Test: `tests/engine.test.ts`, `tests/bindings.types.ts`

**Interfaces:**
- Consumes: Task 1–6 전부 (`makeT`, `errorCode`, `CORE_MESSAGES`, `validateManifest`, `ManifestError`, `ManifestLike`/`ActionId`/`StatusField`, `CallbackCodec`, `PendingInputs`, `guardDecision`, `phraseMatches`, `SettingsUi`, `ConfigAdapter`, `Button`, `Outgoing`, `renderStatus`, `StatusFn`, `EngineLog`)
- Produces:
  - `interface Incoming { chatId: number; text?: string; callback?: string }`
  - `type ActionResult = string | void`, `type ActionHandler = (arg: string | undefined, ctx: { chatId: number }) => Promise<ActionResult> | ActionResult`
  - `interface AuditEvent { at: number; chatId: number; actionId: string; arg?: string; outcome: 'ok' | 'failed' }`
  - `interface Bindings<M extends ManifestLike> { actions: { [K in ActionId<M>]: ActionHandler }; status?: { [K in StatusField<M>]: StatusFn } }`
  - `interface EngineOptions { manifest: unknown; actions: Readonly<Record<string, ActionHandler>>; status?: Readonly<Record<string, StatusFn>>; messages: Messages; ownerChatId: number; config?: ConfigAdapter; onAudit?: (e: AuditEvent) => void; onPause?: (paused: boolean) => void; log?: EngineLog; now?: () => number; inputTtlMs?: number }`
  - `interface Engine { readonly manifest: Manifest; readonly t: Translate; handle(input: Incoming): Promise<Outgoing[]>; decode(data: string): DecodeResult; commands(): Array<{ command: string; description: string }> }`
  - `createEngine(o: EngineOptions): Engine` — 매니페스트·핸들러·상태 함수·설정 어댑터가 맞지 않으면 `ManifestError`
  - 재수출: `Button`, `Outgoing`, `ConfigAdapter`, `StatusFn`, `EngineLog`

- [ ] **Step 1: 실패하는 테스트** — `tests/engine.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createEngine, type ActionHandler, type Engine, type Outgoing } from '../core/engine.js';
import { ManifestError } from '../core/manifest.js';
import { sampleManifest, sampleMessages } from './fixtures.js';

const OWNER = 42;
const raw = () => JSON.parse(JSON.stringify(sampleManifest));

function setup(over: Partial<Record<string, ActionHandler>> = {}) {
  const calls: Array<[string, string | undefined]> = [];
  const handler = (id: string): ActionHandler => async (arg) => {
    calls.push([id, arg]);
    return `${id} ok`;
  };
  const actions: Record<string, ActionHandler> = {
    'status.show': handler('status.show'),
    'jobs.list': handler('jobs.list'),
    'jobs.mode': handler('jobs.mode'),
    'jobs.add': handler('jobs.add'),
    'jobs.purge': handler('jobs.purge'),
    ...over,
  };
  const store: Record<string, unknown> = { 'jobs.enabled': true, 'jobs.level': 'low', 'jobs.share': 0.1, 'jobs.limit': 5 };
  const log = { warn: vi.fn(), error: vi.fn() };
  const onAudit = vi.fn();
  const onPause = vi.fn();
  let now = 0;
  const engine = createEngine({
    manifest: raw(),
    actions,
    status: { 'jobs.today': () => 7, 'jobs.queue': () => 2 },
    messages: sampleMessages,
    ownerChatId: OWNER,
    config: { get: (p) => store[p], set: (p, v) => void (store[p] = v) },
    onAudit,
    onPause,
    log,
    now: () => now,
  });
  const say = (text: string) => engine.handle({ chatId: OWNER, text });
  const tap = (data: string) => engine.handle({ chatId: OWNER, callback: data });
  const button = (out: Outgoing | undefined, label: string) => {
    const b = out?.buttons?.flat().find((x) => x.text.includes(label));
    if (!b) throw new Error(`no "${label}" in ${JSON.stringify(out)}`);
    return b.data;
  };
  return { engine, calls, store, log, onAudit, onPause, say, tap, button, advance: (ms: number) => (now += ms) };
}

const open = async (s: ReturnType<typeof setup>, menuLabel: string) => (await s.tap(s.button((await s.say('/start'))[0], menuLabel)))[0];

describe('createEngine', () => {
  it('refuses a missing handler, a missing status function, or settings without a config adapter', () => {
    const base = { manifest: raw(), messages: sampleMessages, ownerChatId: 1, status: { 'jobs.today': () => 1, 'jobs.queue': () => 1 }, config: { get: () => 1, set: () => undefined } };
    const all = { 'status.show': () => 'x', 'jobs.list': () => 'x', 'jobs.mode': () => 'x', 'jobs.add': () => 'x', 'jobs.purge': () => 'x' };
    const { ['jobs.purge']: _p, ...missing } = all;
    expect(() => createEngine({ ...base, actions: missing })).toThrow(/no handler for action jobs.purge/);
    expect(() => createEngine({ ...base, actions: all, status: { 'jobs.today': () => 1 } })).toThrow(/no status function for jobs.queue/);
    const { config: _c, ...noConfig } = base;
    expect(() => createEngine({ ...noConfig, actions: all })).toThrow(ManifestError);
  });
});

describe('Engine.handle', () => {
  it('ignores everyone but the owner, buttons included', async () => {
    const s = setup();
    const data = s.button((await s.say('/start'))[0], '지금 상태');
    expect(await s.engine.handle({ chatId: 7, text: '/start' })).toEqual([]);
    expect(await s.engine.handle({ chatId: 7, callback: data })).toEqual([]);
    expect(s.calls).toEqual([]);
    expect(s.log.warn).toHaveBeenCalled();
  });

  it('opens the main menu with its items and reserved menus', async () => {
    const s = setup();
    const main = (await s.say('/start'))[0]!;
    expect(main.text).toBe('메인');
    expect(main.buttons!.flat().map((b) => b.text)).toEqual(['지금 상태', '작업', '⚙️ 설정', '📊 상태']);
  });

  it('runs a read action at once, by button and by command, and shows its reply', async () => {
    const s = setup();
    const out = await s.tap(s.button((await s.say('/start'))[0], '지금 상태'));
    expect(out[0]!.text).toBe('status.show ok');
    expect((await s.say('/jobs'))[0]!.text).toBe('jobs.list ok');
    expect(s.calls).toEqual([['status.show', undefined], ['jobs.list', undefined]]);
  });

  it('confirms a write action before running it, and cancel runs nothing', async () => {
    const s = setup();
    const jobs = await open(s, '작업');
    const ask = (await s.tap(s.button(jobs, '모드 · fast')))[0]!;
    expect(ask.text).toContain('모드 (fast) — 실행할까요?');
    expect(s.calls).toEqual([]);
    await s.tap(s.button(ask, '취소'));
    expect(s.calls).toEqual([]);
    const again = (await s.tap(s.button(jobs, '모드 · fast')))[0]!;
    await s.tap(s.button(again, '실행'));
    expect(s.calls).toEqual([['jobs.mode', 'fast']]);
  });

  it('runs a danger action only on the exact phrase, and audits it', async () => {
    const s = setup();
    const ask = (await s.say('/purge'))[0]!;
    expect(ask.text).toContain('PURGE');
    expect((await s.say('purge'))[0]!.text).toContain('실행하지 않았습니다');
    expect(s.calls).toEqual([]);
    await s.say('/purge');
    await s.say(' PURGE ');
    expect(s.calls).toEqual([['jobs.purge', undefined]]);
    expect(s.onAudit).toHaveBeenCalledWith(expect.objectContaining({ actionId: 'jobs.purge', outcome: 'ok', chatId: OWNER }));
  });

  it('will not run a danger action from a confirm button', async () => {
    const s = setup();
    const forged = s.engine.decode('3|c:jobs.purge');
    expect(forged.ok).toBe(true);
    const out = await s.tap('3|c:jobs.purge');
    expect(out[0]!.text).toContain('메뉴가 바뀌었습니다');
    expect(s.calls).toEqual([]);
  });

  it('asks for a number argument, re-asks on junk, then confirms the write', async () => {
    const s = setup();
    expect((await s.say('/add'))[0]!.text).toBe('몇 개를 추가할까요?');
    expect((await s.say('many'))[0]!.text).toBe('숫자를 입력하세요.');
    const ask = (await s.say('3'))[0]!;
    expect(ask.text).toContain('작업 추가 (3) — 실행할까요?');
    await s.tap(s.button(ask, '실행'));
    expect(s.calls).toEqual([['jobs.add', '3']]);
  });

  it('takes a command argument inline', async () => {
    const s = setup();
    const ask = (await s.say('/add 4'))[0]!;
    await s.tap(s.button(ask, '실행'));
    expect(s.calls).toEqual([['jobs.add', '4']]);
  });

  it('drops a pending input on a new command, and on timeout', async () => {
    const s = setup();
    await s.say('/add');
    expect((await s.say('/jobs'))[0]!.text).toBe('jobs.list ok');
    expect((await s.say('5'))[0]!.text).toBe('메인');
    await s.say('/add');
    s.advance(5 * 60_000 + 1);
    expect((await s.say('5'))[0]!.text).toContain('입력 시간이 지났습니다');
    expect(s.calls).toEqual([['jobs.list', undefined]]);
  });

  it('shows only an error code when a handler throws', async () => {
    const s = setup({ 'jobs.list': async () => { throw new Error('token=abc123 leaked'); } });
    const out = (await s.say('/jobs'))[0]!;
    expect(out.text).toMatch(/^실패했습니다 \(오류 [0-9A-Z]{6}\)\.$/);
    expect(out.text).not.toContain('abc123');
    expect(s.log.error).toHaveBeenCalledWith(expect.objectContaining({ actionId: 'jobs.list' }), expect.any(String));
  });

  it('answers a stale button with the stale notice and a way back', async () => {
    const s = setup();
    const out = (await s.tap('2|a:jobs.list'))[0]!;
    expect(out.text).toContain('메뉴가 바뀌었습니다');
    expect(out.buttons!.flat()[0]!.data).toBe('3|m:main');
    expect(s.calls).toEqual([]);
  });

  it('shows the status screen and routes settings', async () => {
    const s = setup();
    expect((await open(s, '📊 상태'))!.text).toBe('📊 상태\n오늘 작업: 7\n대기열: 2');
    expect((await s.say('/status'))[0]!.text).toContain('오늘 작업: 7');
    const settings = await open(s, '⚙️ 설정');
    expect(settings!.text).toBe('⚙️ 설정');
  });

  it('pauses and resumes alerts by command', async () => {
    const s = setup();
    expect((await s.say('/pause'))[0]!.text).toContain('알림을 멈췄습니다');
    expect((await s.say('/resume'))[0]!.text).toContain('다시 켰습니다');
    expect(s.onPause.mock.calls).toEqual([[true], [false]]);
  });

  it('lists the bot commands with their labels', () => {
    const s = setup();
    expect(s.engine.commands()).toEqual([
      { command: 'start', description: '메인 메뉴' },
      { command: 'now', description: '지금 상태' },
      { command: 'jobs', description: '작업 목록' },
      { command: 'add', description: '작업 추가' },
      { command: 'purge', description: '전체 삭제' },
      { command: 'settings', description: '⚙️ 설정' },
      { command: 'status', description: '📊 상태' },
      { command: 'pause', description: '알림 멈추기' },
      { command: 'resume', description: '알림 다시 켜기' },
    ]);
  });
});
```

`tests/bindings.types.ts` (vitest가 아니라 `npm run typecheck`가 검사):

```ts
import type { Bindings } from '../core/engine.js';
import { sampleManifest } from './fixtures.js';

const ok = () => 'ok';

export const complete: Bindings<typeof sampleManifest> = {
  actions: { 'status.show': ok, 'jobs.list': ok, 'jobs.mode': ok, 'jobs.add': ok, 'jobs.purge': ok },
  status: { 'jobs.today': () => 1, 'jobs.queue': () => 2 },
};

export const missingAction: Bindings<typeof sampleManifest> = {
  // @ts-expect-error -- jobs.purge has no handler: a button with nothing behind it must not compile
  actions: { 'status.show': ok, 'jobs.list': ok, 'jobs.mode': ok, 'jobs.add': ok },
};

export const unknownAction: Bindings<typeof sampleManifest> = {
  actions: {
    'status.show': ok, 'jobs.list': ok, 'jobs.mode': ok, 'jobs.add': ok, 'jobs.purge': ok,
    // @ts-expect-error -- an action the manifest does not have
    'ghost': ok,
  },
};
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/engine.test.ts` → Expected: FAIL (module not found). Run: `npm run typecheck` → Expected: FAIL (`Cannot find module '../core/engine.js'`).

- [ ] **Step 3: 구현** — `core/engine.ts`:

```ts
import { CallbackCodec, type DecodeResult } from './callback.js';
import { guardDecision, phraseMatches } from './guard.js';
import {
  ManifestError, validateManifest, type ActionId, type ActionSpec, type Manifest, type ManifestLike, type StatusField,
} from './manifest.js';
import { CORE_MESSAGES } from './messages.core.js';
import { PendingInputs } from './pending.js';
import { SettingsUi, type Button, type ConfigAdapter, type Outgoing } from './settings.js';
import { renderStatus, type StatusFn } from './status.js';
import type { EngineLog } from './alerts.js';
import { errorCode, makeT, type Messages, type Translate } from './text.js';

export type { Button, ConfigAdapter, EngineLog, Outgoing, StatusFn };

export interface Incoming {
  chatId: number;
  text?: string;
  callback?: string;
}
export type ActionResult = string | void;
export type ActionHandler = (arg: string | undefined, ctx: { chatId: number }) => Promise<ActionResult> | ActionResult;
export interface AuditEvent {
  at: number;
  chatId: number;
  actionId: string;
  arg?: string;
  outcome: 'ok' | 'failed';
}

/** What a project writes: one handler per action and one function per status field, checked by the compiler. */
export interface Bindings<M extends ManifestLike> {
  actions: { [K in ActionId<M>]: ActionHandler };
  status?: { [K in StatusField<M>]: StatusFn };
}

export interface EngineOptions {
  manifest: unknown;
  actions: Readonly<Record<string, ActionHandler>>;
  status?: Readonly<Record<string, StatusFn>>;
  messages: Messages;
  ownerChatId: number;
  config?: ConfigAdapter;
  onAudit?: (e: AuditEvent) => void;
  onPause?: (paused: boolean) => void;
  log?: EngineLog;
  now?: () => number;
  inputTtlMs?: number;
}

export interface Engine {
  readonly manifest: Manifest;
  readonly t: Translate;
  handle(input: Incoming): Promise<Outgoing[]>;
  decode(data: string): DecodeResult;
  commands(): Array<{ command: string; description: string }>;
}

const silent: EngineLog = { warn: () => undefined, error: () => undefined };

export function createEngine(o: EngineOptions): Engine {
  const language = (o.manifest as { language?: unknown } | null)?.language === 'ko' ? 'ko' : 'en';
  const core = CORE_MESSAGES[language];
  const m = validateManifest(o.manifest, { ...core, ...o.messages });
  const problems = [
    ...m.actions.filter((a) => typeof o.actions[a.id] !== 'function').map((a) => `no handler for action ${a.id}`),
    ...(m.status?.fields ?? []).filter((f) => typeof o.status?.[f] !== 'function').map((f) => `no status function for ${f}`),
    ...(m.settings && !o.config ? ['settings need a config adapter'] : []),
  ];
  if (problems.length) throw new ManifestError(problems);

  const t = makeT(o.messages, core);
  const log = o.log ?? silent;
  const now = o.now ?? Date.now;
  const codec = new CallbackCodec(m.manifestRev);
  const pending = new PendingInputs(o.inputTtlMs, now);
  const actions = new Map(m.actions.map((a) => [a.id, a]));
  const menus = new Map(m.menus.map((x) => [x.id, x]));
  const byCommand = new Map(m.actions.flatMap((a) => (a.command ? [[a.command, a] as const] : [])));
  // Enum values an action may take: only those its menu items offer.
  const allowedArgs = new Map<string, Set<string>>();
  for (const menu of m.menus) {
    for (const item of menu.items) {
      if ('action' in item && item.args) {
        const set = allowedArgs.get(item.action) ?? new Set<string>();
        for (const a of item.args) set.add(a);
        allowedArgs.set(item.action, set);
      }
    }
  }

  const failure = (err: unknown, context: object): string => {
    const code = errorCode(now);
    log.error({ code, err: String(err), ...context }, 'telegram action failed');
    return t('core.failed', { code });
  };
  const settings = m.settings && o.config
    ? new SettingsUi(m.settings, o.config, t, codec, pending, (err) => failure(err, { where: 'settings' }))
    : null;

  const backRow = (): Button[] => [{ text: t('core.back'), data: codec.encode('m', 'main') }];
  const cancelRow = (): Button[] => [{ text: t('core.cancel'), data: codec.encode('x', 'cancel') }];
  const stale = (): Outgoing[] => [{ text: t('core.stale'), buttons: [[{ text: t(menus.get('main')?.title ?? 'core.cmd.start'), data: codec.encode('m', 'main') }]] }];
  const statusTitle = () => t(m.status?.title ?? 'core.status.title');
  const menuLabel = (id: string) =>
    id === 'settings' ? t('core.settings.title') : id === 'status' ? statusTitle() : t(menus.get(id)?.title ?? id);
  const actionTitle = (a: ActionSpec, arg?: string) => (arg === undefined ? t(a.label) : `${t(a.label)} (${arg})`);
  const argLabel = (a: ActionSpec, arg: string) => (t.has(`${a.label}.${arg}`) ? t(`${a.label}.${arg}`) : `${t(a.label)} · ${arg}`);

  async function statusScreen(): Promise<Outgoing> {
    const text = await renderStatus(statusTitle(), m.status?.fields ?? [], o.status ?? {}, t, (field, err) =>
      log.warn({ field, err: String(err) }, 'telegram status field failed'),
    );
    return { text, buttons: [backRow()] };
  }

  async function renderMenu(id: string): Promise<Outgoing[]> {
    if (id === 'settings' && settings) return [settings.home()];
    if (id === 'status' && m.status) return [await statusScreen()];
    const menu = menus.get(id);
    if (!menu) return stale();
    const rows: Button[][] = menu.items.map((item) => {
      if ('menu' in item) return [{ text: menuLabel(item.menu), data: codec.encode('m', item.menu) }];
      const a = actions.get(item.action) as ActionSpec;
      if (item.args?.length) return item.args.map((arg) => ({ text: argLabel(a, arg), data: codec.encode('a', a.id, arg) }));
      return [{ text: t(a.label), data: codec.encode('a', a.id) }];
    });
    if (id !== 'main') rows.push(backRow());
    return [{ text: t(menu.title), buttons: rows }];
  }

  async function run(a: ActionSpec, arg: string | undefined, chatId: number): Promise<Outgoing[]> {
    const audit = (outcome: AuditEvent['outcome']) => {
      if (a.risk !== 'danger') return;
      try {
        o.onAudit?.({ at: now(), chatId, actionId: a.id, arg, outcome });
      } catch (err) {
        log.warn({ err: String(err) }, 'telegram audit hook failed');
      }
    };
    try {
      const reply = await (o.actions[a.id] as ActionHandler)(arg, { chatId });
      audit('ok');
      return [{ text: typeof reply === 'string' && reply.length > 0 ? reply : t('core.done'), buttons: [backRow()] }];
    } catch (err) {
      audit('failed');
      return [{ text: failure(err, { actionId: a.id }), buttons: [backRow()] }];
    }
  }

  async function start(a: ActionSpec, arg: string | undefined, chatId: number): Promise<Outgoing[]> {
    if (a.arg?.kind === 'enum') {
      const allowed = allowedArgs.get(a.id) ?? new Set<string>();
      if (arg === undefined || !allowed.has(arg)) {
        return [{
          text: t('core.choose', { action: t(a.label) }),
          buttons: [...[...allowed].map((v) => [{ text: argLabel(a, v), data: codec.encode('a', a.id, v) }]), backRow()],
        }];
      }
    } else if (a.arg && arg === undefined) {
      pending.set(chatId, { kind: 'arg', actionId: a.id });
      return [{ text: t(a.arg.prompt ?? 'core.input.ask'), buttons: [cancelRow()] }];
    }
    if (a.arg?.kind === 'number' && !Number.isFinite(Number(arg))) {
      pending.set(chatId, { kind: 'arg', actionId: a.id });
      return [{ text: t('core.input.number'), buttons: [cancelRow()] }];
    }
    const decision = guardDecision(a);
    if (decision === 'run') return run(a, arg, chatId);
    if (decision === 'confirm') {
      return [{
        text: t('core.confirm.ask', { action: actionTitle(a, arg) }),
        buttons: [[{ text: t('core.confirm.yes'), data: codec.encode('c', a.id, arg) }], cancelRow()],
      }];
    }
    pending.set(chatId, { kind: 'danger', actionId: a.id, arg });
    return [{ text: t('core.danger.ask', { action: actionTitle(a, arg), phrase: a.confirmPhrase ?? '' }), buttons: [cancelRow()] }];
  }

  async function onCallback(chatId: number, data: string): Promise<Outgoing[]> {
    const decoded = codec.decode(data);
    if (!decoded.ok) return stale();
    const { kind, id, arg } = decoded.value;
    if (kind !== 's') pending.cancel(chatId);
    if (kind === 'm') return renderMenu(id);
    if (kind === 'x') return [{ text: t('core.cancelled'), buttons: [backRow()] }];
    if (kind === 's') return settings ? settings.onCallback(chatId, id, arg) : stale();
    const a = actions.get(id);
    if (!a) return stale();
    // A confirm button only ever runs a write action: danger needs the typed phrase, whatever the button says.
    if (kind === 'c') return a.risk === 'write' ? run(a, arg, chatId) : stale();
    return start(a, arg, chatId);
  }

  async function onCommand(chatId: number, text: string): Promise<Outgoing[]> {
    const [head = '', ...rest] = text.slice(1).split(/\s+/);
    const command = (head.split('@')[0] ?? '').toLowerCase();
    const arg = rest.join(' ').trim() || undefined;
    const a = byCommand.get(command);
    if (a) return start(a, arg, chatId);
    if (command === 'settings' && settings) return [settings.home()];
    if (command === 'status' && m.status) return [await statusScreen()];
    if ((command === 'pause' || command === 'resume') && m.alerts.length > 0) {
      o.onPause?.(command === 'pause');
      return [{ text: t(command === 'pause' ? 'core.alerts.paused' : 'core.alerts.resumed') }];
    }
    return renderMenu('main');
  }

  async function onText(chatId: number, text: string): Promise<Outgoing[]> {
    const taken = pending.take(chatId);
    if (taken === null) return renderMenu('main');
    if ('expired' in taken) return [{ text: t('core.input.expired'), buttons: [backRow()] }];
    const p = taken.pending;
    if (p.kind === 'setting') return settings ? settings.onInput(chatId, p.fieldId, text) : stale();
    const a = actions.get(p.actionId);
    if (!a) return stale();
    if (p.kind === 'arg') return start(a, text, chatId);
    if (!phraseMatches(a.confirmPhrase ?? '', text)) return [{ text: t('core.danger.wrong'), buttons: [backRow()] }];
    return run(a, p.arg, chatId);
  }

  return {
    manifest: m,
    t,
    decode: (data) => codec.decode(data),
    async handle(input) {
      if (input.chatId !== o.ownerChatId) {
        log.warn({ chatId: input.chatId }, 'telegram: ignored a chat that is not the owner');
        return [];
      }
      if (input.callback !== undefined) return onCallback(input.chatId, input.callback);
      const text = (input.text ?? '').trim();
      if (text.startsWith('/')) {
        // A new command abandons whatever input was pending, so its text is never taken as an argument.
        pending.cancel(input.chatId);
        return onCommand(input.chatId, text);
      }
      return onText(input.chatId, text);
    },
    commands() {
      return [
        { command: 'start', description: t('core.cmd.start') },
        ...m.actions.flatMap((a) => (a.command ? [{ command: a.command, description: t(a.label) }] : [])),
        ...(settings && !byCommand.has('settings') ? [{ command: 'settings', description: t('core.settings.title') }] : []),
        ...(m.status && !byCommand.has('status') ? [{ command: 'status', description: statusTitle() }] : []),
        ...(m.alerts.length > 0
          ? [{ command: 'pause', description: t('core.cmd.pause') }, { command: 'resume', description: t('core.cmd.resume') }]
          : []),
      ];
    },
  };
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/engine.test.ts && npm run typecheck` → Expected: PASS (14 tests), 타입체크 통과(`bindings.types.ts`의 `@ts-expect-error` 두 줄이 실제로 오류를 잡아야 통과).

- [ ] **Step 5: 커밋**

```bash
git add core/engine.ts tests/engine.test.ts tests/bindings.types.ts
git commit -m "Route messages and buttons through the manifest with the risk guard in front"
```

---

### Task 8: grammY 어댑터 · `startTelegram`

**Files:**
- Create: `core/bot.ts`
- Test: `tests/bot.test.ts`

**Interfaces:**
- Consumes: `createEngine`, `EngineOptions`, `Engine`, `Outgoing`, `EngineLog` (Task 7), `Alerts` (Task 6), `splitMessage` (Task 1)
- Produces:
  - `interface TelegramApiLike { sendMessage(chatId: number, text: string, other?: MessageExtra): Promise<unknown>; editMessageText(chatId: number, messageId: number, text: string, other?: MessageExtra): Promise<unknown>; setMyCommands(commands: Array<{ command: string; description: string }>): Promise<unknown> }`
  - `retryAfterSeconds(err: unknown): number | null`, `isNotModified(err: unknown): boolean`
  - `deliver(api: TelegramApiLike, chatId: number, outs: Outgoing[], opts?: { editMessageId?: number; sleep?: (ms: number) => Promise<void> }): Promise<void>`
  - `interface BotLike`, `interface StartOptions extends Omit<EngineOptions, 'ownerChatId' | 'onPause'> { token: string | undefined; ownerChatId: number | string | undefined; createBot?: (token: string) => BotLike }`
  - `interface TelegramHandle { engine: Engine; alerts: Alerts; stop(): Promise<void> }`
  - `startTelegram(o: StartOptions): Promise<TelegramHandle | null>`

- [ ] **Step 1: 실패하는 테스트** — `tests/bot.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { deliver, isNotModified, retryAfterSeconds, startTelegram, type BotLike, type TelegramApiLike } from '../core/bot.js';
import { sampleManifest, sampleMessages } from './fixtures.js';

const api = (): TelegramApiLike & { sendMessage: ReturnType<typeof vi.fn>; editMessageText: ReturnType<typeof vi.fn> } => ({
  sendMessage: vi.fn(async () => ({})),
  editMessageText: vi.fn(async () => ({})),
  setMyCommands: vi.fn(async () => true),
});
const tgError = (code: number, description: string, retry_after?: number) =>
  Object.assign(new Error(description), { error_code: code, description, parameters: retry_after ? { retry_after } : {} });

describe('error helpers', () => {
  it('reads retry_after from a 429 and spots "not modified"', () => {
    expect(retryAfterSeconds(tgError(429, 'Too Many Requests', 3))).toBe(3);
    expect(retryAfterSeconds(tgError(400, 'Bad Request'))).toBeNull();
    expect(isNotModified(tgError(400, 'Bad Request: message is not modified'))).toBe(true);
  });
});

describe('deliver', () => {
  it('splits long text and puts the buttons on the last part', async () => {
    const a = api();
    await deliver(a, 1, [{ text: `${'a'.repeat(4000)}\n${'b'.repeat(200)}`, buttons: [[{ text: 'ok', data: '1|m:main' }]] }]);
    expect(a.sendMessage).toHaveBeenCalledTimes(2);
    expect(a.sendMessage.mock.calls[0]![2]).toBeUndefined();
    expect(a.sendMessage.mock.calls[1]![2]).toEqual({ reply_markup: { inline_keyboard: [[{ text: 'ok', callback_data: '1|m:main' }]] } });
  });

  it('edits the pressed message for the first reply, and ignores "not modified"', async () => {
    const a = api();
    a.editMessageText.mockRejectedValueOnce(tgError(400, 'Bad Request: message is not modified'));
    await deliver(a, 1, [{ text: 'menu' }, { text: 'more' }], { editMessageId: 9 });
    expect(a.editMessageText).toHaveBeenCalledWith(1, 9, 'menu', undefined);
    expect(a.sendMessage).toHaveBeenCalledWith(1, 'more', undefined);
  });

  it('waits out a 429 and gives up after three tries', async () => {
    const a = api();
    const sleep = vi.fn(async () => undefined);
    a.sendMessage.mockRejectedValueOnce(tgError(429, 'Too Many Requests', 2)).mockResolvedValueOnce({});
    await deliver(a, 1, [{ text: 'hi' }], { sleep });
    expect(sleep).toHaveBeenCalledWith(2000);
    a.sendMessage.mockRejectedValue(tgError(429, 'Too Many Requests', 1));
    await expect(deliver(a, 1, [{ text: 'hi' }], { sleep })).rejects.toThrow('Too Many Requests');
  });
});

describe('startTelegram', () => {
  const base = { manifest: JSON.parse(JSON.stringify(sampleManifest)), messages: sampleMessages, status: { 'jobs.today': () => 1, 'jobs.queue': () => 1 }, config: { get: () => 1, set: () => undefined } };
  const handlers = { 'status.show': () => 'x', 'jobs.list': () => 'x', 'jobs.mode': () => 'x', 'jobs.add': () => 'x', 'jobs.purge': () => 'x' };

  function fakeBot(start: () => Promise<void>) {
    const a = api();
    const on = vi.fn();
    const bot: BotLike = { api: a, on, start, stop: vi.fn(async () => undefined), catch: vi.fn() };
    return { bot, a, on };
  }

  it('stays off without a token or an owner, saying why', async () => {
    const log = { warn: vi.fn(), error: vi.fn() };
    expect(await startTelegram({ ...base, actions: handlers, token: undefined, ownerChatId: 1, log })).toBeNull();
    expect(await startTelegram({ ...base, actions: handlers, token: 't', ownerChatId: '', log })).toBeNull();
    expect(log.warn).toHaveBeenCalledTimes(2);
  });

  it('stays off on an invalid manifest without throwing', async () => {
    const log = { warn: vi.fn(), error: vi.fn() };
    const { ['jobs.purge']: _p, ...missing } = handlers;
    expect(await startTelegram({ ...base, actions: missing, token: 't', ownerChatId: 1, log })).toBeNull();
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ err: expect.stringContaining('jobs.purge') }), expect.any(String));
  });

  it('keeps the app running when the bot fails to start', async () => {
    const log = { warn: vi.fn(), error: vi.fn() };
    const { bot, a } = fakeBot(() => Promise.reject(new Error('401 Unauthorized')));
    const handle = await startTelegram({ ...base, actions: handlers, token: 'bad', ownerChatId: '1', log, createBot: () => bot });
    expect(handle).not.toBeNull();
    await new Promise((r) => setImmediate(r));
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ err: expect.stringContaining('401') }), 'telegram bot stopped');
    expect(a.setMyCommands).toHaveBeenCalled();
  });

  it('wires messages and buttons to the engine and sends alerts to the owner', async () => {
    const { bot, a, on } = fakeBot(() => new Promise(() => undefined));
    const handle = await startTelegram({ ...base, actions: handlers, token: 't', ownerChatId: 5, createBot: () => bot });
    const onText = on.mock.calls.find((c) => c[0] === 'message:text')![1];
    await onText({ chat: { id: 5 }, message: { text: '/start' } });
    expect(a.sendMessage.mock.calls[0]![1]).toBe('메인');
    expect(await handle!.alerts.send('job.done', { name: 'A' })).toBe(true);
    expect(a.sendMessage).toHaveBeenLastCalledWith(5, '작업 A 완료', undefined);
    const onCb = on.mock.calls.find((c) => c[0] === 'callback_query:data')![1];
    const answer = vi.fn(async () => true);
    await onCb({ chat: { id: 5 }, from: { id: 5 }, callbackQuery: { data: '3|m:jobs', message: { message_id: 11 } }, answerCallbackQuery: answer });
    expect(answer).toHaveBeenCalled();
    expect(a.editMessageText).toHaveBeenCalledWith(5, 11, '작업', expect.anything());
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/bot.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: 구현** — `core/bot.ts`:

```ts
import { Bot } from 'grammy';
import { Alerts, type EngineLog } from './alerts.js';
import { createEngine, type Engine, type EngineOptions, type Outgoing } from './engine.js';
import { splitMessage } from './text.js';

type MessageExtra = { reply_markup?: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } };

/** The slice of grammY's Api the engine uses — small enough to fake in tests. */
export interface TelegramApiLike {
  sendMessage(chatId: number, text: string, other?: MessageExtra): Promise<unknown>;
  editMessageText(chatId: number, messageId: number, text: string, other?: MessageExtra): Promise<unknown>;
  setMyCommands(commands: Array<{ command: string; description: string }>): Promise<unknown>;
}

interface TextCtx {
  chat: { id: number };
  message: { text: string };
}
interface CallbackCtx {
  chat?: { id: number };
  from: { id: number };
  callbackQuery: { data: string; message?: { message_id: number } };
  answerCallbackQuery(): Promise<unknown>;
}
export interface BotLike {
  api: TelegramApiLike;
  on(filter: 'message:text', handler: (ctx: TextCtx) => Promise<void>): void;
  on(filter: 'callback_query:data', handler: (ctx: CallbackCtx) => Promise<void>): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  catch(handler: (err: unknown) => void): void;
}

type TgErrorShape = { error_code?: number; description?: string; parameters?: { retry_after?: number } };
const asTgError = (err: unknown): TgErrorShape => (typeof err === 'object' && err !== null ? (err as TgErrorShape) : {});

export function retryAfterSeconds(err: unknown): number | null {
  const e = asTgError(err);
  return e.error_code === 429 ? (e.parameters?.retry_after ?? 1) : null;
}

export function isNotModified(err: unknown): boolean {
  return /message is not modified/i.test(asTgError(err).description ?? '');
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function withRetry(fn: () => Promise<unknown>, sleep: (ms: number) => Promise<void>): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await fn();
      return;
    } catch (err) {
      // Re-sending the same menu text is not an error worth surfacing.
      if (isNotModified(err)) return;
      const wait = retryAfterSeconds(err);
      if (wait === null || attempt >= 3) throw err;
      await sleep(wait * 1000);
    }
  }
}

const markup = (o: Outgoing): MessageExtra | undefined =>
  o.buttons?.length
    ? { reply_markup: { inline_keyboard: o.buttons.map((row) => row.map((b) => ({ text: b.text, callback_data: b.data }))) } }
    : undefined;

/** Long replies are split; the buttons ride on the last part. The first reply to a tap edits the tapped message. */
export async function deliver(
  api: TelegramApiLike,
  chatId: number,
  outs: Outgoing[],
  opts: { editMessageId?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  const sleep = opts.sleep ?? realSleep;
  for (const [i, out] of outs.entries()) {
    const parts = splitMessage(out.text);
    for (const [j, part] of parts.entries()) {
      const extra = j === parts.length - 1 ? markup(out) : undefined;
      if (i === 0 && parts.length === 1 && opts.editMessageId !== undefined) {
        const messageId = opts.editMessageId;
        await withRetry(() => api.editMessageText(chatId, messageId, part, extra), sleep);
      } else {
        await withRetry(() => api.sendMessage(chatId, part, extra), sleep);
      }
    }
  }
}

export interface StartOptions extends Omit<EngineOptions, 'ownerChatId' | 'onPause'> {
  token: string | undefined;
  ownerChatId: number | string | undefined;
  createBot?: (token: string) => BotLike;
}

export interface TelegramHandle {
  engine: Engine;
  alerts: Alerts;
  stop(): Promise<void>;
}

const consoleLog: EngineLog = {
  warn: (obj, msg) => console.warn(msg, obj),
  error: (obj, msg) => console.error(msg, obj),
};

/**
 * The bot is an extra on the app: a missing token, a bad manifest or a bot that
 * cannot connect leaves the app running and says why in the log.
 */
export async function startTelegram(o: StartOptions): Promise<TelegramHandle | null> {
  const log = o.log ?? consoleLog;
  if (!o.token) {
    log.warn({}, 'telegram off: no bot token');
    return null;
  }
  const owner = Number(o.ownerChatId);
  if (!Number.isFinite(owner) || owner === 0) {
    log.warn({}, 'telegram off: no owner chat id');
    return null;
  }

  let alerts: Alerts | undefined;
  let engine: Engine;
  try {
    engine = createEngine({ ...o, ownerChatId: owner, log, onPause: (paused) => (paused ? alerts?.pause() : alerts?.resume()) });
  } catch (err) {
    log.error({ err: String(err) }, 'telegram off: the manifest or its bindings are invalid');
    return null;
  }

  // grammY's Bot is a superset of BotLike; the cast is the adapter boundary.
  const bot = o.createBot ? o.createBot(o.token) : (new Bot(o.token) as unknown as BotLike);
  alerts = new Alerts({ manifest: engine.manifest, t: engine.t, log, send: (text) => deliver(bot.api, owner, [{ text }]) });

  bot.on('message:text', async (ctx) => {
    await deliver(bot.api, ctx.chat.id, await engine.handle({ chatId: ctx.chat.id, text: ctx.message.text }));
  });
  bot.on('callback_query:data', async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const chatId = ctx.chat?.id ?? ctx.from.id;
    const outs = await engine.handle({ chatId, callback: ctx.callbackQuery.data });
    await deliver(bot.api, chatId, outs, { editMessageId: ctx.callbackQuery.message?.message_id });
  });
  bot.catch((err) => log.error({ err: String(err) }, 'telegram update failed'));
  bot.api.setMyCommands(engine.commands()).catch((err: unknown) => log.warn({ err: String(err) }, 'telegram commands not registered'));
  bot.start().catch((err: unknown) => log.error({ err: String(err) }, 'telegram bot stopped'));

  return { engine, alerts, stop: () => bot.stop() };
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/bot.test.ts && npm run typecheck` → Expected: PASS (8 tests).

- [ ] **Step 5: 커밋**

```bash
git add core/bot.ts tests/bot.test.ts
git commit -m "Adapt grammY with retries and keep the app alive when the bot cannot start"
```

---

### Task 9: 모든 버튼 눌러 보기 시뮬레이터

**Files:**
- Create: `core/testing/simulate.ts`
- Test: `tests/simulate.test.ts`

**Interfaces:**
- Consumes: `Engine`, `Outgoing` (Task 7), `MAX_CALLBACK_BYTES` (Task 3)
- Produces:
  - `interface SimProblem { where: string; problem: string }`, `interface SimReport { pressed: number; problems: SimProblem[] }`
  - `simulate(engine: Engine, opts: { ownerChatId: number; maxPresses?: number }): Promise<SimReport>`

- [ ] **Step 1: 실패하는 테스트** — `tests/simulate.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createEngine, type ActionHandler } from '../core/engine.js';
import { simulate } from '../core/testing/simulate.js';
import { sampleManifest, sampleMessages } from './fixtures.js';

function engine(over: Record<string, ActionHandler> = {}) {
  const spy = vi.fn(async (_arg: string | undefined) => 'ok');
  const actions: Record<string, ActionHandler> = {
    'status.show': spy, 'jobs.list': spy, 'jobs.mode': spy, 'jobs.add': spy, 'jobs.purge': spy, ...over,
  };
  const e = createEngine({
    manifest: JSON.parse(JSON.stringify(sampleManifest)),
    actions,
    status: { 'jobs.today': () => 1, 'jobs.queue': () => 2 },
    messages: sampleMessages,
    ownerChatId: 1,
    config: { get: () => 0.5, set: vi.fn() },
  });
  return { e, spy };
}

describe('simulate', () => {
  it('presses every reachable button and runs only read actions', async () => {
    const { e, spy } = engine();
    const report = await simulate(e, { ownerChatId: 1 });
    expect(report.problems).toEqual([]);
    expect(report.pressed).toBeGreaterThan(10);
    // status.show and jobs.list are read; mode/add/purge stop at their confirm or prompt.
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('reports a handler that fails and one that answers with nothing', async () => {
    const { e } = engine({
      'jobs.list': async () => { throw new Error('db down'); },
      'status.show': async () => '   ',
    });
    const report = await simulate(e, { ownerChatId: 1 });
    expect(report.problems.map((p) => p.problem)).toEqual(expect.arrayContaining(['handler failed', 'empty reply']));
    expect(report.problems.find((p) => p.problem === 'handler failed')!.where).toContain('작업 목록');
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/simulate.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: 구현** — `core/testing/simulate.ts`:

```ts
import { MAX_CALLBACK_BYTES } from '../callback.js';
import type { Engine, Outgoing } from '../engine.js';

export interface SimProblem {
  where: string;
  problem: string;
}
export interface SimReport {
  pressed: number;
  problems: SimProblem[];
}

/**
 * Taps every reachable button once, starting from /start. Read actions run for
 * real; write and danger stop at their confirm screen or prompt, and settings
 * stop before saving — the walk must be safe to run against a live project.
 */
export async function simulate(engine: Engine, opts: { ownerChatId: number; maxPresses?: number }): Promise<SimReport> {
  const chatId = opts.ownerChatId;
  const max = opts.maxPresses ?? 500;
  const problems: SimProblem[] = [];
  const failed = new RegExp(`^${engine.t('core.failed', { code: '__CODE__' }).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('__CODE__', '[0-9A-Z]+')}$`);
  const staleText = engine.t('core.stale');
  const seen = new Set<string>();
  const queue: Array<{ where: string; out: Outgoing }> = [];
  let pressed = 0;

  const look = (where: string, outs: Outgoing[]) => {
    for (const out of outs) {
      if (out.text.trim() === '') problems.push({ where, problem: 'empty reply' });
      if (failed.test(out.text)) problems.push({ where, problem: 'handler failed' });
      if (out.text === staleText && where !== '/start') problems.push({ where, problem: 'button leads to a stale menu' });
      for (const b of out.buttons?.flat() ?? []) {
        if (Buffer.byteLength(b.data, 'utf8') > MAX_CALLBACK_BYTES) problems.push({ where: `${where} › ${b.text}`, problem: 'callback data over 64 bytes' });
      }
      queue.push({ where, out });
    }
  };

  look('/start', await engine.handle({ chatId, text: '/start' }));
  while (queue.length > 0 && pressed < max) {
    const { where, out } = queue.shift() as { where: string; out: Outgoing };
    for (const b of out.buttons?.flat() ?? []) {
      if (seen.has(b.data)) continue;
      seen.add(b.data);
      const decoded = engine.decode(b.data);
      // Never press what would change state: a write confirm or a settings save.
      if (decoded.ok && (decoded.value.kind === 'c' || (decoded.value.kind === 's' && decoded.value.id.startsWith('y.')))) continue;
      pressed += 1;
      look(`${where} › ${b.text}`, await engine.handle({ chatId, callback: b.data }));
    }
  }
  return { pressed, problems };
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/simulate.test.ts && npm run typecheck` → Expected: PASS (2 tests).

- [ ] **Step 5: 커밋**

```bash
git add core/testing/simulate.ts tests/simulate.test.ts
git commit -m "Tap every reachable button without running anything that changes state"
```

---

### Task 10: 공개 API · 버전 · 문서 · CI · 전체 검증

**Files:**
- Create: `core/index.ts`, `core/VERSION`, `README.md`, `.github/workflows/ci.yml`, `LICENSE`
- Test: `tests/index.test.ts`

**Interfaces:**
- Produces: `core/index.ts` — 대상 프로젝트가 쓰는 유일한 import 지점

- [ ] **Step 1: 실패하는 테스트** — `tests/index.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as core from '../core/index.js';

describe('core/index', () => {
  it('exposes the pieces a project uses', () => {
    for (const name of ['startTelegram', 'createEngine', 'validateManifest', 'ManifestError', 'simulate', 'deliver', 'CORE_MESSAGES', 'CORE_VERSION']) {
      expect(core).toHaveProperty(name);
    }
  });

  it('reports the version written in core/VERSION', () => {
    expect(core.CORE_VERSION).toBe(readFileSync(new URL('../core/VERSION', import.meta.url), 'utf8').trim());
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/index.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: 구현**

`core/VERSION`:

```
0.1.0
```

`core/index.ts`:

```ts
/** Engine version; the skill compares it with the plugin's before replacing a project's copy. Keep in step with ./VERSION. */
export const CORE_VERSION = '0.1.0';

export { startTelegram, deliver, type StartOptions, type TelegramHandle, type BotLike, type TelegramApiLike } from './bot.js';
export {
  createEngine,
  type ActionHandler, type ActionResult, type AuditEvent, type Bindings, type Button, type ConfigAdapter,
  type Engine, type EngineLog, type EngineOptions, type Incoming, type Outgoing, type StatusFn,
} from './engine.js';
export {
  validateManifest, ManifestError, ManifestSchema, DEFAULT_SECRET_PATTERNS,
  type Manifest, type ManifestLike, type ActionId, type StatusField, type AlertId,
} from './manifest.js';
export { Alerts } from './alerts.js';
export { CORE_MESSAGES } from './messages.core.js';
export { simulate, type SimReport, type SimProblem } from './testing/simulate.js';
export type { Messages } from './text.js';
```

`README.md` (계획 2에서 플러그인 사용법으로 확장):

````markdown
# telegram-port

Port a Telegram bot into any Node/TypeScript project. A manifest describes the menus, commands, settings, alerts and status screen; the engine in `core/` draws them and calls the project's own functions.

This repository is being built in two steps. Step 1 (this state) is the engine in `core/`. Step 2 adds the `/telegram-port` skill that writes the manifest and the wiring for a project.

## Engine at a glance

```ts
import { startTelegram, type Bindings } from './telegram/core/index.js';
import { manifest } from './telegram/manifest.gen.js';

const bindings: Bindings<typeof manifest> = {
  actions: { 'jobs.list': async () => listJobs() /* … one per action, or it will not compile */ },
  status: { 'jobs.today': () => countToday() },
};

await startTelegram({
  token: process.env.TELEGRAM_BOT_TOKEN,
  ownerChatId: process.env.TELEGRAM_CHAT_ID,
  manifest,
  messages,
  ...bindings,
  config: { get: (path) => readConfig(path), set: (path, value) => writeConfig(path, value) },
});
```

- Risk levels are enforced by the engine: `read` runs, `write` asks for a tap, `danger` asks for a typed phrase and is audited.
- Buttons are addressed by id and manifest revision, never by position.
- Settings whose path looks secret are refused.
- `simulate(engine)` taps every reachable button without changing state.

## Development

```bash
npm install
npm run typecheck
npm test
```
````

`LICENSE`: MIT 전문, `Copyright (c) 2026 PineappleBingo`.

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
```

- [ ] **Step 4: 전체 검증** — Run: `npm run typecheck && npm test` → Expected: 타입 오류 0, 전체 테스트 통과(Task 1–10 합계 약 59개).

- [ ] **Step 5: 커밋**

```bash
git add core/index.ts core/VERSION README.md LICENSE .github/workflows/ci.yml tests/index.test.ts
git commit -m "Expose the engine's public API and version, with CI"
```

- [ ] **Step 6: 원격 저장소** — **사용자 승인 후에만:** `gh repo create PineappleBingo/telegram-port --public --source . --push`. 승인 전에는 로컬에만 둔다.

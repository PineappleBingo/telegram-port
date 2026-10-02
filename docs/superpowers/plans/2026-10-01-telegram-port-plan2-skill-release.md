# telegram-port 계획 2 — 스킬·템플릿·도구·예시·출시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- **계획 버전:** v1 · **작성일:** 2026-10-01 · **전제:** 계획 1(엔진 core 0.1.0) main에 머지됨 (`8af4c5d`)
- **이 계획이 만드는 것:** `/telegram-port` 스킬, 템플릿, 설치·생성·미리 보기 CLI, 예시 2개, Claude Code 플러그인 패키징 (플러그인 0.1.0)

**Goal:** 처음 보는 Node/TS 프로젝트에서 `/telegram-port` 한 번으로, typecheck와 "모든 버튼 눌러 보기"를 통과하는 텔레그램 봇이 설치되게 한다.

**Architecture:** 에이전트(스킬)는 판단이 필요한 일만 한다 — 프로젝트를 읽어 매니페스트를 쓰고, 사용자에게 확인받고, 핸들러를 연결한다. 결정적인 일(엔진 복사·버전 비교, `manifest.gen.ts` 생성, 템플릿 배치, 미리 보기 HTML)은 의존성 없는 Node 스크립트 `tools/port.mjs`가 하고, 테스트로 고정한다. 엔진·템플릿·도구를 모두 `skills/telegram-port/` 아래에 두어 스킬 폴더만 복사해도 동작한다.

**Tech Stack:** TypeScript 5.9 strict, Node ≥20 (도구는 순수 ESM `.mjs`, 표준 라이브러리만), grammY ^1.36, zod ^3.24, vitest ^3

**Spec:** `docs/superpowers/specs/2026-10-01-telegram-port-design.md` (§2 저장소 구조, §4 스킬 실행 흐름, §6 테스트 전략)

## Global Constraints

- 모든 npm·node 명령 앞에: `export PATH="/c/Users/pinea/AppData/Roaming/fnm/node-versions/v22.23.2/installation:$PATH"`
- 스킬 폴더 `skills/telegram-port/`는 혼자서 동작해야 한다 — SKILL.md·references·core·templates·tools가 모두 그 안에 있고, 밖을 참조하지 않는다.
- `tools/`는 `.mjs`, Node 표준 라이브러리만. 대상 프로젝트에 아무것도 설치하지 않고 돌아야 한다.
- 설치 도구는 **이미 있는 프로젝트 파일을 덮어쓰지 않는다** (`handlers.ts`, `configAdapter.ts`, `index.ts`, `messages.<lang>.ts`, 연결 테스트). 예외 둘: `manifest.gen.ts`(파생물, 항상 재생성)와 `core/`(플러그인 VERSION이 더 높을 때만 교체, 프로젝트 쪽이 더 높으면 그대로).
- 대상 프로젝트 배치: `src/telegram/{core/, telegram.manifest.json, manifest.gen.ts, handlers.ts, configAdapter.ts, messages.<lang>.ts, index.ts}`, `tests/telegram.wiring.test.ts`, `.telegram-port/` (설계서 §2).
- 문구 파일은 JSON 모양을 유지한다(큰따옴표, 끝 쉼표 없음) — 미리 보기 도구가 읽는다.
- 위험 등급 추정은 보수적으로(높게): delete·remove·clear·purge·send·trade·deploy·drop·withdraw → `danger`, set·update·toggle·add·enable → `write` (설계서 §4).
- 비밀값을 설정에 넣거나 `danger`를 낮추는 일은 사용자의 명시적 승인 없이는 하지 않는다 (설계서 §4 규칙).
- 도구 출력·오류 메시지·코드 주석은 영어, 스킬 문서(SKILL.md·references)는 영어(공개 플러그인), README는 영어 + `README.ko.md`.
- 커밋 메시지는 명령형 한 줄 + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01WNMUpPWUbcqbQUoyESaLV8`.

## Review Focus

1. **사람이 고친 `handlers.ts`·문구 파일이 있는 프로젝트에서 설치를 다시 돌림** — 한 글자도 바뀌지 않고 "kept"로 보고돼야 한다 → Task 3 `keeps every file the project already has`.
2. **프로젝트의 `core/` VERSION이 플러그인보다 높음** — 내려 깔지 않아야 한다 → Task 3 `never downgrades a newer engine`.
3. **문구 파일이 더 이상 JSON 모양이 아님(끝 쉼표 등)** — 미리 보기가 죽지 않고 키로 표시하며 경고한다 → Task 4 `falls back to keys when the messages file cannot be read`.
4. **문구에 HTML이 섞임** — 미리 보기에서 이스케이프된다 → Task 4 `escapes text from the project`.
5. **package.json·tsconfig.json이 없는 폴더에서 실행** — 아무것도 쓰지 않고 이유와 함께 종료 코드 1 → Task 5 `refuses a folder that is not a Node/TS project`.

---

## 파일 구조

| 파일 | 책임 | Task |
|---|---|---|
| `skills/telegram-port/core/**` | 엔진 (루트 `core/`에서 이동) | 1 |
| `skills/telegram-port/tools/lib/gen.mjs` | `manifest.gen.ts`·문구 파일 생성, 문구 키 수집, 문구 파일 읽기 | 2 |
| `skills/telegram-port/tools/lib/install.mjs` | 엔진 복사·버전 비교, 템플릿 배치(덮어쓰기 금지) | 3 |
| `skills/telegram-port/templates/*` | `handlers.ts`·`configAdapter.ts`·`index.ts`·`telegram.wiring.test.ts` | 3 |
| `skills/telegram-port/tools/preview/preview.mjs` | 토큰 없는 메뉴 트리 HTML | 4 |
| `skills/telegram-port/tools/port.mjs` | CLI: `install` · `gen` · `preview` | 5 |
| `examples/small-app/**` | 코인과 무관한 사이트 감시 앱 + 설치된 봇 | 6 |
| `examples/tracer-like/**` | Solana-Tracer형 앱 + 설치된 봇 | 7 |
| `skills/telegram-port/SKILL.md`, `references/*.md` | 에이전트 지침 | 8 |
| `.claude-plugin/plugin.json`, `marketplace.json`, `README*.md` | 패키징·문서 | 9 |
| `tests/*.test.ts` | 도구·예시·스킬·패키징 테스트 | 각 Task |

---

### Task 1: 엔진을 스킬 폴더 안으로 옮기기

설계서 §2는 `core/`를 루트에 그렸지만 같은 설계서가 "스킬 폴더만 복사해도 동작"을 요구한다. 기능 요구가 이기므로 엔진을 `skills/telegram-port/core/`로 옮긴다 (사본을 두 벌 두지 않기 위해 이동).

**Files:**
- Move: `core/` → `skills/telegram-port/core/`
- Modify: `tests/*.test.ts`, `tests/bindings.types.ts`, `tsconfig.json`, `README.md`

**Interfaces:**
- Produces: 엔진 경로 `skills/telegram-port/core/index.js` (이후 모든 테스트가 이 경로로 import)

- [ ] **Step 1: 이동과 경로 수정**

```bash
mkdir -p skills/telegram-port
git mv core skills/telegram-port/core
sed -i "s#'\.\./core/#'../skills/telegram-port/core/#g" tests/*.ts
sed -i 's#"core/\*\*/\*\.ts"#"skills/telegram-port/core/**/*.ts"#' tsconfig.json
sed -i "s#engine in \`core/\`#engine in \`skills/telegram-port/core/\`#; s#is the engine in \`core/\`#is the engine in \`skills/telegram-port/core/\`#" README.md
grep -rn "'\.\./core/" tests || echo "no old paths"
```

Expected: `no old paths`

- [ ] **Step 2: 전체 검증** — Run: `npm run typecheck && npm test` → Expected: 타입 오류 0, 71개 테스트 통과(이동 전과 같음).

- [ ] **Step 3: 커밋**

```bash
git add -A skills tests tsconfig.json README.md
git commit -m "Move the engine into the skill folder so the folder works on its own"
```

---

### Task 2: 생성기 — `manifest.gen.ts`와 문구 파일

**Files:**
- Create: `skills/telegram-port/tools/lib/gen.mjs`
- Modify: `tsconfig.json` (`allowJs` — 테스트가 `.mjs`를 import)
- Test: `tests/gen.test.ts`

**Interfaces:**
- Produces:
  - `manifestModule(manifest: object): string` — `export const manifest = <JSON> as const;` 모듈 텍스트
  - `textKeys(manifest): string[]` — 매니페스트가 쓰는 문구 키 (중복 없이, 매니페스트 순서)
  - `messagesModule(manifest, existing?: Record<string,string>): string` — 첫 문구 파일 (키 → 기존 문구 또는 키 자신)
  - `parseMessages(source: string): Record<string,string> | null` — JSON 모양이 아니면 null

- [ ] **Step 1: tsconfig** — `compilerOptions`에 `"allowJs": true`를 추가한다 (`checkJs`는 켜지 않는다: `.mjs`의 타입은 추론만).

- [ ] **Step 2: 실패하는 테스트** — `tests/gen.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validateManifest } from '../skills/telegram-port/core/manifest.js';
import { CORE_MESSAGES } from '../skills/telegram-port/core/messages.core.js';
import { manifestModule, messagesModule, parseMessages, textKeys } from '../skills/telegram-port/tools/lib/gen.mjs';
import { sampleManifest } from './fixtures.js';

const m = () => JSON.parse(JSON.stringify(sampleManifest));

describe('manifestModule', () => {
  it('writes the manifest as a const module that round-trips', () => {
    const src = manifestModule(m());
    expect(src.startsWith('// Generated by telegram-port')).toBe(true);
    expect(src.trimEnd().endsWith('} as const;')).toBe(true);
    const body = src.slice(src.indexOf('{'), src.lastIndexOf('} as const') + 1);
    expect(JSON.parse(body)).toEqual(m());
  });
});

describe('messages', () => {
  it('collects exactly the keys the engine checks for', () => {
    const texts = parseMessages(messagesModule(m()));
    expect(texts).not.toBeNull();
    expect(() => validateManifest(m(), { ...CORE_MESSAGES.ko, ...texts })).not.toThrow();
    expect(Object.keys(texts!)).toEqual(textKeys(m()));
    expect(texts!['jobs.title']).toBe('jobs.title');
  });

  it('keeps texts that already exist', () => {
    const texts = parseMessages(messagesModule(m(), { 'jobs.title': '작업' }));
    expect(texts!['jobs.title']).toBe('작업');
  });

  it('reads nothing from a file that is no longer JSON-shaped', () => {
    expect(parseMessages("export const messages = { 'a': 'b', };")).toBeNull();
    expect(parseMessages('export const x = 1;')).toBeNull();
  });
});
```

- [ ] **Step 3: 실패 확인** — Run: `npx vitest run tests/gen.test.ts` → Expected: FAIL (`Cannot find module '../skills/telegram-port/tools/lib/gen.mjs'`).

- [ ] **Step 4: 구현** — `skills/telegram-port/tools/lib/gen.mjs`:

```js
/** The manifest as a TS module: `typeof manifest` then carries the literal ids the binding types need. */
export function manifestModule(manifest) {
  return [
    '// Generated by telegram-port from telegram.manifest.json. Do not edit:',
    '// change the JSON, then run `node <skill>/tools/port.mjs gen`.',
    `export const manifest = ${JSON.stringify(manifest, null, 2)} as const;`,
    '',
  ].join('\n');
}

/** Every text key a manifest uses, in manifest order. Must match the engine's validateManifest. */
export function textKeys(m) {
  const keys = [
    ...m.menus.map((x) => x.title),
    ...m.actions.flatMap((a) => [a.label, ...(a.arg?.prompt ? [a.arg.prompt] : [])]),
    ...(m.settings?.categories ?? []).map((c) => c.title),
    ...(m.settings?.fields ?? []).map((f) => f.label),
    ...(m.alerts ?? []).map((a) => a.template),
    ...(m.status ? [...(m.status.title ? [m.status.title] : []), ...m.status.fields.map((f) => `status.${f}`)] : []),
  ];
  return [...new Set(keys)];
}

/** A first messages file. A key shows itself until someone writes its text, so nothing is ever blank. */
export function messagesModule(m, existing = {}) {
  const texts = Object.fromEntries(textKeys(m).map((k) => [k, existing[k] ?? k]));
  return [
    "import type { Messages } from './core/index.js';",
    '',
    '// Keep this object JSON-shaped (double quotes, no trailing commas): the preview tool reads it.',
    `export const messages: Messages = ${JSON.stringify(texts, null, 2)};`,
    '',
  ].join('\n');
}

/** Reads a messages module back; null once a person has made it something JSON cannot parse. */
export function parseMessages(source) {
  const match = /=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(source.trim());
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: 통과 확인** — Run: `npx vitest run tests/gen.test.ts && npm run typecheck` → Expected: PASS (4 tests), 타입 오류 0.

- [ ] **Step 6: 커밋**

```bash
git add skills/telegram-port/tools/lib/gen.mjs tests/gen.test.ts tsconfig.json
git commit -m "Generate the manifest module and a first messages file"
```

---

### Task 3: 템플릿과 설치 — 덮어쓰지 않는 배치, 내려 깔지 않는 엔진

**Files:**
- Create: `skills/telegram-port/templates/handlers.ts`, `configAdapter.ts`, `index.ts`, `telegram.wiring.test.ts`
- Create: `skills/telegram-port/tools/lib/install.mjs`
- Test: `tests/install.test.ts`

**Interfaces:**
- Consumes: `manifestModule`, `messagesModule` (Task 2)
- Produces:
  - `compareVersions(a: string, b: string): -1 | 0 | 1`
  - `installCore(telegramDir: string, opts?: { force?: boolean; from?: string }): { core: 'installed' | 'upgraded' | 'current' | 'newer'; from: string | null; to: string }`
  - `installProject(opts: { root: string; dir?: string; tests?: string; forceCore?: boolean }): { core: ReturnType<installCore>; written: string[]; kept: string[]; generated: string }` — 경로는 `root` 기준 `/` 구분 상대 경로. 매니페스트가 없으면 throw.
  - 템플릿 치환자: `__LANG__`(매니페스트 `language`), `__TELEGRAM__`(테스트 폴더 → telegram 폴더 상대 경로)

- [ ] **Step 1: 템플릿 네 개**

`skills/telegram-port/templates/handlers.ts`:

```ts
import type { Bindings } from './core/index.js';
import type { manifest } from './manifest.gen.js';

type B = Bindings<typeof manifest>;

/**
 * One function per action id in telegram.manifest.json; a missing one is a type error.
 * Return a string to reply with it, nothing for "done", or throw: the user then sees
 * only an error code and the details go to the log. The engine has already asked for
 * any confirmation the action's risk needs before calling these.
 */
export const actions: B['actions'] = {
};

/** One function per status field; null shows "—". Keep them cheap: they run each time the screen opens. */
export const status: NonNullable<B['status']> = {
};
```

`skills/telegram-port/templates/configAdapter.ts`:

```ts
import type { ConfigAdapter } from './core/index.js';

type Tree = Record<string, unknown>;

/**
 * Where the settings live. Point `read` at the project's current config object and
 * `write` at whatever saves it (and applies it, for settings marked "live").
 */
const source: { read(): Tree; write(next: Tree): void | Promise<void> } = {
  read: () => {
    throw new Error('telegram-port: configAdapter.ts is not wired to the project config yet');
  },
  write: () => {
    throw new Error('telegram-port: configAdapter.ts is not wired to the project config yet');
  },
};

const at = (tree: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((node, key) => (node !== null && typeof node === 'object' ? (node as Tree)[key] : undefined), tree);

export const configAdapter: ConfigAdapter = {
  get: (path) => at(source.read(), path),
  async set(path, value) {
    // Write a changed copy, so a failed save leaves the running config as it was.
    const next = structuredClone(source.read());
    const keys = path.split('.');
    const last = keys.pop() as string;
    const parent = keys.length > 0 ? at(next, keys.join('.')) : next;
    if (parent === null || typeof parent !== 'object' || !(last in parent)) throw new Error(`telegram-port: no config key ${path}`);
    (parent as Tree)[last] = value;
    await source.write(next);
  },
};
```

`skills/telegram-port/templates/index.ts`:

```ts
import { startTelegram, type AlertId, type AuditEvent, type EngineLog, type TelegramHandle } from './core/index.js';
import { configAdapter } from './configAdapter.js';
import { actions, status } from './handlers.js';
import { manifest } from './manifest.gen.js';
import { messages } from './messages.__LANG__.js';

let handle: TelegramHandle | null = null;

/** The one line the app's start code calls. Never throws: without a token or owner the bot stays off. */
export async function startBot(log?: EngineLog, onAudit?: (e: AuditEvent) => void): Promise<void> {
  handle = await startTelegram({
    token: process.env.TELEGRAM_BOT_TOKEN,
    ownerChatId: process.env[manifest.owner.env],
    manifest,
    actions,
    status,
    messages,
    config: configAdapter,
    log,
    onAudit,
  });
}

/** Fire-and-forget: false when the bot is off, alerts are paused, or Telegram refused it. */
export function sendAlert(id: AlertId<typeof manifest>, vars?: Record<string, string | number>): Promise<boolean> {
  return handle ? handle.alerts.send(id, vars) : Promise.resolve(false);
}

export async function stopBot(): Promise<void> {
  await handle?.stop();
  handle = null;
}
```

`skills/telegram-port/templates/telegram.wiring.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { configAdapter } from '__TELEGRAM__/configAdapter.js';
import { createEngine, simulate } from '__TELEGRAM__/core/index.js';
import { actions, status } from '__TELEGRAM__/handlers.js';
import { manifest } from '__TELEGRAM__/manifest.gen.js';
import { messages } from '__TELEGRAM__/messages.__LANG__.js';

// Written once by telegram-port; yours to extend.
const raw = JSON.parse(readFileSync(new URL('__TELEGRAM__/telegram.manifest.json', import.meta.url), 'utf8'));
const OWNER = 1;
const engine = () => createEngine({ manifest, actions, status, messages, ownerChatId: OWNER, config: configAdapter });

describe('telegram wiring', () => {
  it('manifest.gen.ts matches telegram.manifest.json (after editing the JSON, run the gen tool)', () => {
    expect(manifest).toEqual(raw);
  });

  it('wires every action, status field, text and setting', () => {
    expect(engine).not.toThrow();
  });

  it('finds every setting path in the config', () => {
    for (const f of raw.settings?.fields ?? []) expect(configAdapter.get(f.path), f.path).not.toBeUndefined();
  });

  it('answers every reachable button without a failure', async () => {
    expect((await simulate(engine(), { ownerChatId: OWNER })).problems).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패하는 테스트** — `tests/install.test.ts`:

```ts
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareVersions, installCore, installProject } from '../skills/telegram-port/tools/lib/install.mjs';
import { sampleManifest } from './fixtures.js';

const PLUGIN_VERSION = readFileSync('skills/telegram-port/core/VERSION', 'utf8').trim();

function project(manifest: object | null = sampleManifest) {
  const root = mkdtempSync(join(tmpdir(), 'tp-'));
  mkdirSync(join(root, 'src/telegram'), { recursive: true });
  if (manifest) writeFileSync(join(root, 'src/telegram/telegram.manifest.json'), JSON.stringify(manifest, null, 2));
  return root;
}
const read = (root: string, p: string) => readFileSync(join(root, p), 'utf8');

describe('compareVersions', () => {
  it('compares numerically, part by part', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.1.0', '0.2.0')).toBe(-1);
  });
});

describe('installProject', () => {
  it('lays out the project layer on a first run', () => {
    const root = project();
    const r = installProject({ root });
    expect(r.core).toEqual({ core: 'installed', from: null, to: PLUGIN_VERSION });
    expect(r.written.sort()).toEqual([
      'src/telegram/configAdapter.ts', 'src/telegram/handlers.ts', 'src/telegram/index.ts',
      'src/telegram/messages.ko.ts', 'tests/telegram.wiring.test.ts',
    ]);
    expect(r.generated).toBe('src/telegram/manifest.gen.ts');
    expect(existsSync(join(root, 'src/telegram/core/index.ts'))).toBe(true);
    expect(read(root, 'tests/telegram.wiring.test.ts')).toContain("from '../src/telegram/core/index.js'");
    expect(read(root, 'tests/telegram.wiring.test.ts')).toContain("'../src/telegram/messages.ko.js'");
    expect(read(root, 'src/telegram/index.ts')).toContain("from './messages.ko.js'");
    expect(read(root, 'src/telegram/manifest.gen.ts')).toContain('"manifestRev": 3');
  });

  it('keeps every file the project already has, and regenerates only the manifest module', () => {
    const root = project();
    installProject({ root });
    writeFileSync(join(root, 'src/telegram/handlers.ts'), '// EDITED by a person\n');
    writeFileSync(join(root, 'src/telegram/messages.ko.ts'), '// EDITED messages\n');
    writeFileSync(join(root, 'src/telegram/telegram.manifest.json'), JSON.stringify({ ...sampleManifest, manifestRev: 4 }));
    const r = installProject({ root });
    expect(r.written).toEqual([]);
    expect(r.kept).toContain('src/telegram/handlers.ts');
    expect(read(root, 'src/telegram/handlers.ts')).toBe('// EDITED by a person\n');
    expect(read(root, 'src/telegram/messages.ko.ts')).toBe('// EDITED messages\n');
    expect(read(root, 'src/telegram/manifest.gen.ts')).toContain('"manifestRev": 4');
    expect(r.core.core).toBe('current');
  });

  it('refuses to run before the manifest exists', () => {
    expect(() => installProject({ root: project(null) })).toThrow(/telegram\.manifest\.json/);
  });
});

describe('installCore', () => {
  it('never downgrades a newer engine', () => {
    const root = project();
    mkdirSync(join(root, 'src/telegram/core'), { recursive: true });
    writeFileSync(join(root, 'src/telegram/core/VERSION'), '9.0.0\n');
    expect(installCore(join(root, 'src/telegram'))).toEqual({ core: 'newer', from: '9.0.0', to: '9.0.0' });
    expect(existsSync(join(root, 'src/telegram/core/index.ts'))).toBe(false);
  });

  it('upgrades an older engine and drops files the new one no longer has', () => {
    const root = project();
    mkdirSync(join(root, 'src/telegram/core'), { recursive: true });
    writeFileSync(join(root, 'src/telegram/core/VERSION'), '0.0.1\n');
    writeFileSync(join(root, 'src/telegram/core/gone.ts'), 'old\n');
    expect(installCore(join(root, 'src/telegram'))).toEqual({ core: 'upgraded', from: '0.0.1', to: PLUGIN_VERSION });
    expect(existsSync(join(root, 'src/telegram/core/gone.ts'))).toBe(false);
    expect(read(root, 'src/telegram/core/VERSION').trim()).toBe(PLUGIN_VERSION);
  });

  it('replaces a same-version engine only when forced', () => {
    const root = project();
    installCore(join(root, 'src/telegram'));
    writeFileSync(join(root, 'src/telegram/core/index.ts'), '// drifted\n');
    expect(installCore(join(root, 'src/telegram')).core).toBe('current');
    expect(read(root, 'src/telegram/core/index.ts')).toBe('// drifted\n');
    expect(installCore(join(root, 'src/telegram'), { force: true }).core).toBe('upgraded');
    expect(read(root, 'src/telegram/core/index.ts')).not.toBe('// drifted\n');
  });
});
```

- [ ] **Step 3: 실패 확인** — Run: `npx vitest run tests/install.test.ts` → Expected: FAIL (`Cannot find module '../skills/telegram-port/tools/lib/install.mjs'`).

- [ ] **Step 4: 구현** — `skills/telegram-port/tools/lib/install.mjs`:

```js
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifestModule, messagesModule } from './gen.mjs';

const SKILL_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CORE_DIR = join(SKILL_ROOT, 'core');
export const TEMPLATES_DIR = join(SKILL_ROOT, 'templates');

export function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

const versionIn = (dir) => (existsSync(join(dir, 'VERSION')) ? readFileSync(join(dir, 'VERSION'), 'utf8').trim() : null);

/**
 * Copies the engine into <telegramDir>/core. A project engine at the same version is
 * left alone (unless forced) and a newer one is never replaced: someone chose it.
 */
export function installCore(telegramDir, { force = false, from = CORE_DIR } = {}) {
  const target = join(telegramDir, 'core');
  const ours = versionIn(from);
  const theirs = versionIn(target);
  if (theirs && !force) {
    const cmp = compareVersions(theirs, ours);
    if (cmp > 0) return { core: 'newer', from: theirs, to: theirs };
    if (cmp === 0) return { core: 'current', from: theirs, to: theirs };
  }
  // Clear first, so files the new engine dropped do not linger beside it.
  rmSync(target, { recursive: true, force: true });
  cpSync(from, target, { recursive: true });
  return { core: theirs ? 'upgraded' : 'installed', from: theirs, to: ours };
}

const fill = (name, vars) =>
  Object.entries(vars).reduce((text, [key, value]) => text.split(key).join(value), readFileSync(join(TEMPLATES_DIR, name), 'utf8'));

/**
 * Installs the engine and the project layer. A project file that exists is the
 * project's and is never overwritten; only manifest.gen.ts, derived from the JSON,
 * is rewritten every time.
 */
export function installProject({ root, dir = 'src/telegram', tests = 'tests', forceCore = false }) {
  const telegramDir = join(root, dir);
  const manifestPath = join(telegramDir, 'telegram.manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`no ${dir}/telegram.manifest.json: write the manifest first`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const lang = manifest.language ?? 'en';
  const rel = (p) => relative(root, p).split(sep).join('/');
  const vars = { __LANG__: lang, __TELEGRAM__: relative(join(root, tests), telegramDir).split(sep).join('/') };

  const core = installCore(telegramDir, { force: forceCore });
  const files = [
    [join(telegramDir, 'handlers.ts'), fill('handlers.ts', vars)],
    [join(telegramDir, 'configAdapter.ts'), fill('configAdapter.ts', vars)],
    [join(telegramDir, 'index.ts'), fill('index.ts', vars)],
    [join(telegramDir, `messages.${lang}.ts`), messagesModule(manifest)],
    [join(root, tests, 'telegram.wiring.test.ts'), fill('telegram.wiring.test.ts', vars)],
  ];
  const written = [];
  const kept = [];
  for (const [path, text] of files) {
    if (existsSync(path)) {
      kept.push(rel(path));
      continue;
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
    written.push(rel(path));
  }
  const genPath = join(telegramDir, 'manifest.gen.ts');
  writeFileSync(genPath, manifestModule(manifest));
  return { core, written, kept, generated: rel(genPath) };
}
```

- [ ] **Step 5: 통과 확인** — Run: `npx vitest run tests/install.test.ts && npm run typecheck` → Expected: PASS (7 tests), 타입 오류 0. (템플릿은 `tsconfig`의 `include` 밖이라 여기서는 컴파일되지 않는다 — 예시(Task 6·7)가 설치된 상태로 검증한다.)

- [ ] **Step 6: 커밋**

```bash
git add skills/telegram-port/templates skills/telegram-port/tools/lib/install.mjs tests/install.test.ts
git commit -m "Install the engine and project layer without overwriting the project's files"
```

---

### Task 4: 토큰 없는 미리 보기

**Files:**
- Create: `skills/telegram-port/tools/preview/preview.mjs`
- Test: `tests/preview.test.ts`

**Interfaces:**
- Produces: `renderPreview(manifest: object, messages: Record<string,string> | null): string` — 완결된 HTML 문서 한 장

- [ ] **Step 1: 실패하는 테스트** — `tests/preview.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderPreview } from '../skills/telegram-port/tools/preview/preview.mjs';
import { sampleManifest, sampleMessages } from './fixtures.js';

const m = () => JSON.parse(JSON.stringify(sampleManifest));

describe('renderPreview', () => {
  it('draws the menu tree with labels, risk, commands and the danger phrase', () => {
    const html = renderPreview(m(), { ...sampleMessages });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('작업 목록');
    expect(html).toContain('<code>/jobs</code>');
    expect(html).toContain('class="risk danger"');
    expect(html).toContain('<code>PURGE</code>');
    expect(html).toContain('off · fast');
    expect(html).toContain('manifestRev 3');
  });

  it('lists settings with their range and apply mode, alerts and status fields', () => {
    const html = renderPreview(m(), { ...sampleMessages });
    expect(html).toContain('비율');
    expect(html).toContain('0–100%');
    expect(html).toContain('restart');
    expect(html).toContain('job.crash');
    expect(html).toContain('오늘 작업');
  });

  it('escapes text from the project', () => {
    const html = renderPreview(m(), { ...sampleMessages, 'jobs.list': '<img src=x onerror=alert(1)>' });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  it('falls back to keys when the messages file cannot be read', () => {
    const html = renderPreview(m(), null);
    expect(html).toContain('jobs.list');
    expect(html).toContain('messages file could not be read');
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/preview.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: 구현** — `skills/telegram-port/tools/preview/preview.mjs`:

```js
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const STYLE = `
:root { --bg:#f6f7f9; --fg:#1b2129; --muted:#5d6876; --line:#dde2e8; --read:#2f7d4f; --write:#2a6fb0; --danger:#b4531c;
  --mono: ui-monospace, Consolas, monospace; --sans: system-ui, "Segoe UI", sans-serif; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root { --bg:#12161b; --fg:#e3e8ee; --muted:#9aa6b3; --line:#2b333d;
  --read:#6fcf97; --write:#73b4ee; --danger:#ef9c66; color-scheme: dark; } }
body { background:var(--bg); color:var(--fg); font:15px/1.6 var(--sans); margin:0; padding:24px 16px; }
main { max-width:760px; margin:0 auto; display:grid; gap:28px; }
h1 { font-size:22px; margin:0; } h2 { font-size:16px; margin:0 0 8px; }
ul { margin:4px 0; padding-left:20px; } li { margin:2px 0; }
small, .muted { color:var(--muted); } code { font-family:var(--mono); font-size:.88em; }
.risk { font:600 11px var(--mono); text-transform:uppercase; padding:1px 6px; border-radius:4px; border:1px solid currentColor; }
.risk.read { color:var(--read); } .risk.write { color:var(--write); } .risk.danger { color:var(--danger); }
.warn { border-left:3px solid var(--danger); padding:6px 12px; }
.table { overflow-x:auto; } table { border-collapse:collapse; width:100%; font-size:14px; }
th, td { text-align:left; padding:6px 10px; border-bottom:1px solid var(--line); }`;

/** One HTML page that shows the whole bot without a token: menus, commands, settings, alerts, status. */
export function renderPreview(manifest, messages) {
  const t = (key) => esc(messages && key in messages ? messages[key] : key);
  const actions = new Map(manifest.actions.map((a) => [a.id, a]));
  const menus = new Map(manifest.menus.map((x) => [x.id, x]));
  const risk = (a) => `<span class="risk ${esc(a.risk)}">${esc(a.risk)}</span>`;
  const drawn = new Set();

  const tree = (id) => {
    if (id === 'settings') return '<li>⚙️ Settings <small>built in</small></li>';
    if (id === 'status') return '<li>📊 Status <small>built in</small></li>';
    const menu = menus.get(id);
    if (!menu) return `<li class="warn">unknown menu ${esc(id)}</li>`;
    // A menu reachable from two places is drawn once; the second mention points back.
    if (drawn.has(id)) return `<li>${t(menu.title)} <small>(shown above)</small></li>`;
    drawn.add(id);
    const items = menu.items
      .map((item) => {
        if ('menu' in item) return tree(item.menu);
        const a = actions.get(item.action);
        if (!a) return `<li class="warn">unknown action ${esc(item.action)}</li>`;
        const args = item.args ? ` <small>${item.args.map(esc).join(' · ')}</small>` : '';
        const command = a.command ? ` <code>/${esc(a.command)}</code>` : '';
        const phrase = a.risk === 'danger' ? ` <small>type <code>${esc(a.confirmPhrase ?? '')}</code></small>` : '';
        return `<li>${risk(a)} ${t(a.label)}${args}${command}${phrase}</li>`;
      })
      .join('');
    return `<li><strong>${t(menu.title)}</strong><ul>${items}</ul></li>`;
  };

  const range = (f) => {
    if (f.kind === 'boolean') return 'on / off';
    if (f.kind === 'enum') return (f.options ?? []).map(esc).join(' · ');
    if (f.ratio) return `${Math.round((f.min ?? 0) * 100)}–${Math.round((f.max ?? 1) * 100)}%`;
    return `${f.min ?? '−∞'}–${f.max ?? '∞'}`;
  };

  const commands = manifest.actions.filter((a) => a.command);
  const s = manifest.settings;
  const sections = [
    `<header><h1>Telegram bot preview</h1><p class="muted">manifestRev ${esc(manifest.manifestRev)} · language ${esc(manifest.language)} · owner from <code>${esc(manifest.owner?.env ?? '')}</code></p></header>`,
    messages ? '' : '<p class="warn">The messages file could not be read (it is no longer JSON-shaped), so labels show their keys.</p>',
    `<section><h2>Menus</h2><ul>${tree('main')}</ul></section>`,
    commands.length
      ? `<section><h2>Commands</h2><div class="table"><table><tr><th>Command</th><th>Action</th><th>Risk</th></tr>${commands
          .map((a) => `<tr><td><code>/${esc(a.command)}</code></td><td>${t(a.label)}</td><td>${risk(a)}</td></tr>`)
          .join('')}</table></div></section>`
      : '',
    s
      ? `<section><h2>Settings</h2>${s.categories
          .map(
            (c) =>
              `<h3>${t(c.title)}</h3><div class="table"><table><tr><th>Setting</th><th>Path</th><th>Allowed</th><th>Applies</th></tr>${s.fields
                .filter((f) => f.category === c.id)
                .map((f) => `<tr><td>${t(f.label)}</td><td><code>${esc(f.path)}</code></td><td>${range(f)}</td><td>${esc(f.apply)}</td></tr>`)
                .join('')}</table></div>`,
          )
          .join('')}${s.excluded?.length ? `<p class="muted">Never editable from chat: ${s.excluded.map((p) => `<code>${esc(p)}</code>`).join(', ')} and the built-in secret patterns.</p>` : ''}</section>`
      : '',
    manifest.alerts?.length
      ? `<section><h2>Alerts</h2><ul>${manifest.alerts
          .map((a) => `<li><code>${esc(a.id)}</code> — ${t(a.template)} <small>${a.mutable === false ? 'sent even while paused' : 'paused by /pause'}</small></li>`)
          .join('')}</ul></section>`
      : '',
    manifest.status
      ? `<section><h2>Status screen</h2><ul>${manifest.status.fields.map((f) => `<li>${t(`status.${f}`)} <small><code>${esc(f)}</code></small></li>`).join('')}</ul></section>`
      : '',
  ];
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Telegram bot preview</title><style>${STYLE}</style></head><body><main>${sections.join('')}</main></body></html>\n`;
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/preview.test.ts && npm run typecheck` → Expected: PASS (4 tests).

- [ ] **Step 5: 커밋**

```bash
git add skills/telegram-port/tools/preview/preview.mjs tests/preview.test.ts
git commit -m "Preview the whole bot as one HTML page without a token"
```

---

### Task 5: CLI — `install` · `gen` · `preview`

**Files:**
- Create: `skills/telegram-port/tools/port.mjs`
- Test: `tests/port-cli.test.ts`

**Interfaces:**
- Consumes: `installProject` (Task 3), `manifestModule`, `parseMessages` (Task 2), `renderPreview` (Task 4)
- Produces: `node <skill>/tools/port.mjs <install|gen|preview> [--target <dir>] [--dir src/telegram] [--tests tests] [--out <file>] [--force-core]` — 성공 시 JSON 한 줄을 stdout에, 실패 시 이유를 stderr에 쓰고 종료 코드 1

- [ ] **Step 1: 실패하는 테스트** — `tests/port-cli.test.ts`:

```ts
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sampleManifest, sampleMessages } from './fixtures.js';

const PORT = 'skills/telegram-port/tools/port.mjs';
const run = (...args: string[]) => spawnSync(process.execPath, [PORT, ...args], { encoding: 'utf8' });

function nodeProject(withManifest = true) {
  const root = mkdtempSync(join(tmpdir(), 'tp-cli-'));
  writeFileSync(join(root, 'package.json'), '{"name":"x","type":"module"}');
  writeFileSync(join(root, 'tsconfig.json'), '{}');
  mkdirSync(join(root, 'src/telegram'), { recursive: true });
  if (withManifest) writeFileSync(join(root, 'src/telegram/telegram.manifest.json'), JSON.stringify(sampleManifest));
  return root;
}

describe('port.mjs', () => {
  it('refuses a folder that is not a Node/TS project, writing nothing', () => {
    const root = mkdtempSync(join(tmpdir(), 'tp-cli-'));
    const r = run('install', '--target', root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Node/TypeScript');
    expect(readdirSync(root)).toEqual([]);
  });

  it('installs and reports what it wrote as JSON', () => {
    const root = nodeProject();
    const r = run('install', '--target', root);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.core.core).toBe('installed');
    expect(out.written).toContain('src/telegram/handlers.ts');
  });

  it('regenerates the manifest module alone', () => {
    const root = nodeProject();
    const r = run('gen', '--target', root);
    expect(r.status).toBe(0);
    expect(readFileSync(join(root, 'src/telegram/manifest.gen.ts'), 'utf8')).toContain('as const');
    expect(existsSync(join(root, 'src/telegram/handlers.ts'))).toBe(false);
  });

  it('writes the preview with the project texts', () => {
    const root = nodeProject();
    writeFileSync(join(root, 'src/telegram/messages.ko.ts'), `export const messages = ${JSON.stringify(sampleMessages)};\n`);
    const r = run('preview', '--target', root);
    expect(r.status).toBe(0);
    const html = readFileSync(join(root, '.telegram-port/preview.html'), 'utf8');
    expect(html).toContain('작업 목록');
    expect(JSON.parse(r.stdout).preview).toBe('.telegram-port/preview.html');
  });

  it('says what is missing when the manifest is not there yet', () => {
    const r = run('gen', '--target', nodeProject(false));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('telegram.manifest.json');
  });

  it('explains its usage for an unknown command', () => {
    const r = run('deploy', '--target', nodeProject());
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('usage');
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/port-cli.test.ts` → Expected: FAIL (6 tests; node exits with `Cannot find module`).

- [ ] **Step 3: 구현** — `skills/telegram-port/tools/port.mjs`:

```js
#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { manifestModule, parseMessages } from './lib/gen.mjs';
import { installProject } from './lib/install.mjs';
import { renderPreview } from './preview/preview.mjs';

const USAGE = 'usage: node tools/port.mjs <install|gen|preview> [--target <dir>] [--dir src/telegram] [--tests tests] [--out <file>] [--force-core]';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    target: { type: 'string', default: '.' },
    dir: { type: 'string', default: 'src/telegram' },
    tests: { type: 'string', default: 'tests' },
    out: { type: 'string', default: '.telegram-port/preview.html' },
    'force-core': { type: 'boolean', default: false },
  },
});
const [command] = positionals;
const root = resolve(values.target);
const telegramDir = join(root, values.dir);
const manifestPath = join(telegramDir, 'telegram.manifest.json');

if (!['install', 'gen', 'preview'].includes(command ?? '')) fail(USAGE);
if (!existsSync(join(root, 'package.json')) || !existsSync(join(root, 'tsconfig.json'))) {
  fail('telegram-port supports Node/TypeScript projects only: package.json and tsconfig.json are required.');
}
if (!existsSync(manifestPath)) fail(`no ${values.dir}/telegram.manifest.json: write the manifest first`);

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (err) {
  fail(`${values.dir}/telegram.manifest.json is not valid JSON: ${err.message}`);
}

const print = (result) => process.stdout.write(`${JSON.stringify(result)}\n`);

if (command === 'install') {
  print(installProject({ root, dir: values.dir, tests: values.tests, forceCore: values['force-core'] }));
} else if (command === 'gen') {
  writeFileSync(join(telegramDir, 'manifest.gen.ts'), manifestModule(manifest));
  print({ generated: `${values.dir}/manifest.gen.ts` });
} else {
  const messagesPath = join(telegramDir, `messages.${manifest.language ?? 'en'}.ts`);
  const messages = existsSync(messagesPath) ? parseMessages(readFileSync(messagesPath, 'utf8')) : null;
  const out = resolve(root, values.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, renderPreview(manifest, messages));
  print({ preview: relative(root, out).split(sep).join('/'), messagesRead: messages !== null });
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/port-cli.test.ts && npm run typecheck` → Expected: PASS (6 tests).

- [ ] **Step 5: 커밋**

```bash
git add skills/telegram-port/tools/port.mjs tests/port-cli.test.ts
git commit -m "Add the install, gen and preview command line"
```

---

### Task 6: 예시 1 — 코인과 무관한 작은 앱 (`small-app`)

사이트 상태를 감시하는 앱. 영어 문구, 설정 4개, 위험 동작 1개, 비밀값(`notify.token`)이 있지만 설정에 나오지 않음.

**Files:**
- Create: `examples/small-app/{package.json, tsconfig.json, src/app.ts, src/main.ts, src/telegram/telegram.manifest.json}`
- Generate (Task 5 CLI): `examples/small-app/src/telegram/{core/, manifest.gen.ts, index.ts, handlers.ts, configAdapter.ts, messages.en.ts}`, `examples/small-app/tests/telegram.wiring.test.ts`
- Then fill: `handlers.ts`, `configAdapter.ts`, `messages.en.ts`
- Modify: `tsconfig.json`, `vitest.config.ts`
- Test: `tests/examples.test.ts`

**Interfaces:**
- Consumes: `port.mjs install` (Task 5), 템플릿 (Task 3)

- [ ] **Step 1: 실패하는 테스트** — `tests/examples.test.ts` (예시 폴더를 모두 돈다 — Task 7에서 손대지 않아도 tracer-like가 들어온다):

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CORE = 'skills/telegram-port/core';
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)).map((x) => `${f}/${x}`) : [f]));
const text = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

describe.each(readdirSync('examples'))('examples/%s', (name) => {
  it('carries the current engine (after changing core: node skills/telegram-port/tools/port.mjs install --force-core --target examples/<name>)', () => {
    const copy = `examples/${name}/src/telegram/core`;
    expect(files(copy).sort()).toEqual(files(CORE).sort());
    for (const f of files(CORE)) expect(text(join(copy, f)), f).toBe(text(join(CORE, f)));
  });
});
```

Run: `npx vitest run tests/examples.test.ts` → Expected: FAIL (`ENOENT ... 'examples'`).

- [ ] **Step 2: 앱과 매니페스트**

`examples/small-app/package.json`:

```json
{ "name": "small-app", "private": true, "type": "module" }
```

`examples/small-app/tsconfig.json`:

```json
{ "extends": "../../tsconfig.json", "include": ["src/**/*.ts", "tests/**/*.ts"] }
```

`examples/small-app/src/app.ts`:

```ts
/** A small site watcher: nothing to do with coins. State is in memory; no network in this example. */
export interface Site {
  url: string;
  up: boolean | null;
}

export const config = {
  checks: { enabled: true, intervalSec: 60, timeoutMs: 5000 },
  alerts: { onRecover: true },
  notify: { token: 'not-a-real-token' },
};

export const sites: Site[] = [
  { url: 'https://example.com', up: true },
  { url: 'https://example.org', up: false },
];

export function listSites(): string {
  return sites.length ? sites.map((s) => `${s.up === false ? '🔴' : '🟢'} ${s.url}`).join('\n') : 'No sites yet.';
}

export function setChecks(on: boolean): string {
  config.checks.enabled = on;
  return on ? 'Checks on.' : 'Checks off.';
}

export function addSite(url: string): string {
  if (!/^https?:\/\/\S+$/.test(url)) throw new Error(`not a URL: ${url}`);
  sites.push({ url, up: null });
  return `Watching ${url}.`;
}

export function removeAllSites(): string {
  const n = sites.length;
  sites.length = 0;
  return `Removed ${n} sites.`;
}

export function saveConfig(next: Record<string, unknown>): void {
  Object.assign(config, next);
}
```

`examples/small-app/src/main.ts`:

```ts
import { startBot } from './telegram/index.js';

// The one line telegram-port adds to the app's start code.
await startBot();
```

`examples/small-app/src/telegram/telegram.manifest.json`:

```json
{
  "version": 1,
  "manifestRev": 1,
  "language": "en",
  "owner": { "env": "TELEGRAM_CHAT_ID" },
  "menus": [
    { "id": "main", "title": "main.title", "items": [{ "action": "sites.list" }, { "menu": "sites" }, { "menu": "settings" }, { "menu": "status" }] },
    { "id": "sites", "title": "sites.title", "items": [
      { "action": "sites.list" },
      { "action": "checks.mode", "args": ["on", "off"] },
      { "action": "sites.add" },
      { "action": "sites.clear" }
    ] }
  ],
  "actions": [
    { "id": "sites.list", "label": "sites.list", "risk": "read", "command": "sites" },
    { "id": "checks.mode", "label": "checks.mode", "risk": "write", "arg": { "kind": "enum" } },
    { "id": "sites.add", "label": "sites.add", "risk": "write", "command": "add", "arg": { "kind": "text", "prompt": "sites.add.ask" } },
    { "id": "sites.clear", "label": "sites.clear", "risk": "danger", "command": "clear", "confirmPhrase": "CLEAR" }
  ],
  "settings": {
    "categories": [{ "id": "checks", "title": "settings.checks" }, { "id": "alerts", "title": "settings.alerts" }],
    "fields": [
      { "id": "checks.enabled", "path": "checks.enabled", "category": "checks", "label": "set.enabled", "kind": "boolean", "apply": "live" },
      { "id": "checks.interval", "path": "checks.intervalSec", "category": "checks", "label": "set.interval", "kind": "int", "min": 10, "max": 3600, "apply": "restart" },
      { "id": "checks.timeout", "path": "checks.timeoutMs", "category": "checks", "label": "set.timeout", "kind": "int", "min": 500, "max": 30000, "apply": "live" },
      { "id": "alerts.recover", "path": "alerts.onRecover", "category": "alerts", "label": "set.recover", "kind": "boolean", "apply": "live" }
    ],
    "excluded": ["notify.*"]
  },
  "alerts": [
    { "id": "site.down", "template": "alert.down", "mutable": false },
    { "id": "site.up", "template": "alert.up", "mutable": true }
  ],
  "status": { "fields": ["sites.total", "sites.down"] }
}
```

- [ ] **Step 3: 설치 도구로 배치** — Run: `node skills/telegram-port/tools/port.mjs install --target examples/small-app` → Expected: JSON with `"core":"installed"` and `written` listing the five project files.

- [ ] **Step 4: 연결 파일 채우기** (도구가 만든 세 파일을 아래 내용으로 바꾼다)

`examples/small-app/src/telegram/handlers.ts`:

```ts
import type { Bindings } from './core/index.js';
import type { manifest } from './manifest.gen.js';
import { addSite, listSites, removeAllSites, setChecks, sites } from '../app.js';

type B = Bindings<typeof manifest>;

/**
 * One function per action id in telegram.manifest.json; a missing one is a type error.
 * Return a string to reply with it, nothing for "done", or throw: the user then sees
 * only an error code and the details go to the log. The engine has already asked for
 * any confirmation the action's risk needs before calling these.
 */
export const actions: B['actions'] = {
  'sites.list': () => listSites(),
  'checks.mode': (mode) => setChecks(mode === 'on'),
  'sites.add': (url) => addSite(url ?? ''),
  'sites.clear': () => removeAllSites(),
};

/** One function per status field; null shows "—". Keep them cheap: they run each time the screen opens. */
export const status: NonNullable<B['status']> = {
  'sites.total': () => sites.length,
  'sites.down': () => sites.filter((s) => s.up === false).length,
};
```

`examples/small-app/src/telegram/configAdapter.ts` — 템플릿에서 `source`만 바꾼다:

```ts
import type { ConfigAdapter } from './core/index.js';
import { config, saveConfig } from '../app.js';

type Tree = Record<string, unknown>;

/**
 * Where the settings live. Point `read` at the project's current config object and
 * `write` at whatever saves it (and applies it, for settings marked "live").
 */
const source: { read(): Tree; write(next: Tree): void | Promise<void> } = {
  read: () => config,
  write: (next) => saveConfig(next),
};

const at = (tree: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((node, key) => (node !== null && typeof node === 'object' ? (node as Tree)[key] : undefined), tree);

export const configAdapter: ConfigAdapter = {
  get: (path) => at(source.read(), path),
  async set(path, value) {
    // Write a changed copy, so a failed save leaves the running config as it was.
    const next = structuredClone(source.read());
    const keys = path.split('.');
    const last = keys.pop() as string;
    const parent = keys.length > 0 ? at(next, keys.join('.')) : next;
    if (parent === null || typeof parent !== 'object' || !(last in parent)) throw new Error(`telegram-port: no config key ${path}`);
    (parent as Tree)[last] = value;
    await source.write(next);
  },
};
```

`examples/small-app/src/telegram/messages.en.ts`:

```ts
import type { Messages } from './core/index.js';

// Keep this object JSON-shaped (double quotes, no trailing commas): the preview tool reads it.
export const messages: Messages = {
  "main.title": "Site watcher",
  "sites.title": "Sites",
  "sites.list": "List sites",
  "checks.mode": "Checks",
  "checks.mode.on": "Checks on",
  "checks.mode.off": "Checks off",
  "sites.add": "Add a site",
  "sites.add.ask": "Send the URL to watch.",
  "sites.clear": "Remove all sites",
  "settings.checks": "Checks",
  "settings.alerts": "Alerts",
  "set.enabled": "Checks enabled",
  "set.interval": "Interval (s)",
  "set.timeout": "Timeout (ms)",
  "set.recover": "Tell me on recovery",
  "alert.down": "🔴 {url} is down",
  "alert.up": "🟢 {url} is back",
  "status.sites.total": "Sites",
  "status.sites.down": "Down now"
};
```

- [ ] **Step 5: 저장소 설정** — `tsconfig.json`의 `include`에 `"examples/**/*.ts"`를 추가하고, `vitest.config.ts`를 바꾼다:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['tests/**/*.test.ts', 'examples/*/tests/**/*.test.ts'] } });
```

- [ ] **Step 6: 통과 확인** — Run: `npm run typecheck && npx vitest run tests/examples.test.ts examples/small-app` → Expected: 타입 오류 0, `examples/small-app` 동기화 1개 + 연결 테스트 4개 PASS (시뮬레이터 문제 0).

- [ ] **Step 7: 미리 보기 확인** — Run: `node skills/telegram-port/tools/port.mjs preview --target examples/small-app --out ../../.superpowers/preview-small-app.html` → Expected: `{"preview":...,"messagesRead":true}`. (`.superpowers/`는 git 밖)

- [ ] **Step 8: 커밋**

```bash
git add examples/small-app tests/examples.test.ts tsconfig.json vitest.config.ts
git commit -m "Add a site-watcher example installed with the tools"
```

---

### Task 7: 예시 2 — Solana-Tracer형 (`tracer-like`)

명령 그룹 셋, 비율 설정·재시작 설정이 섞인 설정 6개, 인자를 받는 위험 동작, 일시정지에도 가는 알림. 한국어 문구.

**Files:**
- Create: `examples/tracer-like/{package.json, tsconfig.json, src/app.ts, src/main.ts, src/telegram/telegram.manifest.json}`
- Generate then fill: `examples/tracer-like/src/telegram/{handlers.ts, configAdapter.ts, messages.ko.ts}` (+ 생성물 그대로: `core/`, `manifest.gen.ts`, `index.ts`, `tests/telegram.wiring.test.ts`)
- Test: `tests/examples.test.ts`(Task 6, 자동 포함), `examples/tracer-like/tests/telegram.wiring.test.ts`

**Interfaces:**
- Consumes: `port.mjs install` (Task 5)

- [ ] **Step 1: 실패 확인** — `examples/tracer-like/src/telegram/telegram.manifest.json`만 먼저 만들고(아래 Step 2 내용) Run: `npx vitest run tests/examples.test.ts` → Expected: FAIL for `examples/tracer-like` (`ENOENT ... src/telegram/core`).

- [ ] **Step 2: 앱과 매니페스트**

`examples/tracer-like/package.json`:

```json
{ "name": "tracer-like", "private": true, "type": "module" }
```

`examples/tracer-like/tsconfig.json`:

```json
{ "extends": "../../tsconfig.json", "include": ["src/**/*.ts", "tests/**/*.ts"] }
```

`examples/tracer-like/src/app.ts`:

```ts
/** A stand-in for Solana-Tracer: calls, watched wallets and a credit budget. In memory, no network. */
export interface Call {
  token: string;
  verdict: 'hit' | 'miss' | null;
}

export const config = {
  calls: { mode: 'record', forensics: { enabled: true } },
  radar: { sampleRate: { hit: 0.5, miss: 0.35 } },
  helius: { dailyCredits: 100000, forensicShare: 0.3 },
  scoring: { threshold: 60 },
  apiKeys: { helius: 'not-a-real-key' },
};

export const calls: Call[] = [
  { token: 'BONK', verdict: 'hit' },
  { token: 'WIF', verdict: null },
];
export const wallets = new Set<string>(['7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU']);
export const budget = { used: 1234 };

export function summary(): string {
  return `콜 ${calls.length}건 · 지갑 ${wallets.size}개 · 크레딧 ${budget.used}/${config.helius.dailyCredits}`;
}

export function listCalls(): string {
  return calls.map((c) => `${c.token}: ${c.verdict ?? '판정 전'}`).join('\n');
}

export function setCallMode(mode: string): string {
  config.calls.mode = mode;
  return `콜 모드: ${mode}`;
}

export function listWallets(): string {
  return wallets.size ? [...wallets].join('\n') : '추적 중인 지갑이 없습니다.';
}

export function watchWallet(address: string): string {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) throw new Error(`not a Solana address: ${address}`);
  wallets.add(address);
  return `추적 시작: ${address}`;
}

export function unwatchWallet(address: string): string {
  return wallets.delete(address) ? `추적 해제: ${address}` : `추적 중이 아닙니다: ${address}`;
}

export function saveConfig(next: Record<string, unknown>): void {
  Object.assign(config, next);
}
```

`examples/tracer-like/src/main.ts`:

```ts
import { startBot } from './telegram/index.js';

// The one line telegram-port adds to the app's start code.
await startBot();
```

`examples/tracer-like/src/telegram/telegram.manifest.json`:

```json
{
  "version": 1,
  "manifestRev": 1,
  "language": "ko",
  "owner": { "env": "TELEGRAM_CHAT_ID" },
  "menus": [
    { "id": "main", "title": "main.title", "items": [
      { "action": "status.show" }, { "menu": "calls" }, { "menu": "wallets" }, { "menu": "settings" }, { "menu": "status" }
    ] },
    { "id": "calls", "title": "calls.title", "items": [
      { "action": "calls.list" }, { "action": "calls.mode", "args": ["off", "record", "quick"] }
    ] },
    { "id": "wallets", "title": "wallets.title", "items": [
      { "action": "wallets.list" }, { "action": "wallets.watch" }, { "action": "wallets.unwatch" }
    ] }
  ],
  "actions": [
    { "id": "status.show", "label": "status.btn", "risk": "read", "command": "now" },
    { "id": "calls.list", "label": "calls.list", "risk": "read", "command": "calls" },
    { "id": "calls.mode", "label": "calls.mode", "risk": "write", "arg": { "kind": "enum" } },
    { "id": "wallets.list", "label": "wallets.list", "risk": "read", "command": "wallets" },
    { "id": "wallets.watch", "label": "wallets.watch", "risk": "write", "command": "watch", "arg": { "kind": "text", "prompt": "wallets.watch.ask" } },
    { "id": "wallets.unwatch", "label": "wallets.unwatch", "risk": "danger", "command": "unwatch",
      "arg": { "kind": "text", "prompt": "wallets.unwatch.ask" }, "confirmPhrase": "REMOVE" }
  ],
  "settings": {
    "categories": [
      { "id": "calls", "title": "settings.calls" },
      { "id": "budget", "title": "settings.budget" },
      { "id": "scoring", "title": "settings.scoring" }
    ],
    "fields": [
      { "id": "radar.hit", "path": "radar.sampleRate.hit", "category": "calls", "label": "set.radarHit", "kind": "float", "ratio": true, "min": 0, "max": 1, "apply": "live" },
      { "id": "radar.miss", "path": "radar.sampleRate.miss", "category": "calls", "label": "set.radarMiss", "kind": "float", "ratio": true, "min": 0, "max": 1, "apply": "live" },
      { "id": "forensics.enabled", "path": "calls.forensics.enabled", "category": "calls", "label": "set.forensics", "kind": "boolean", "apply": "live" },
      { "id": "helius.daily", "path": "helius.dailyCredits", "category": "budget", "label": "set.daily", "kind": "int", "min": 0, "max": 1000000, "apply": "restart" },
      { "id": "helius.share", "path": "helius.forensicShare", "category": "budget", "label": "set.share", "kind": "float", "ratio": true, "min": 0, "max": 0.5, "apply": "restart" },
      { "id": "scoring.threshold", "path": "scoring.threshold", "category": "scoring", "label": "set.threshold", "kind": "float", "min": 0, "max": 100, "apply": "live" }
    ],
    "excluded": ["apiKeys.*"]
  },
  "alerts": [
    { "id": "call.verdict", "template": "alert.callVerdict", "mutable": true },
    { "id": "wallet.move", "template": "alert.walletMove", "mutable": true },
    { "id": "budget.exhausted", "template": "alert.budgetExhausted", "mutable": false }
  ],
  "status": { "fields": ["calls.today", "wallets.tracked", "budget.used"] }
}
```

- [ ] **Step 3: 설치 도구로 배치** — Run: `node skills/telegram-port/tools/port.mjs install --target examples/tracer-like` → Expected: `"core":"installed"`, `written`에 `src/telegram/messages.ko.ts` 포함.

- [ ] **Step 4: 연결 파일 채우기**

`examples/tracer-like/src/telegram/handlers.ts`:

```ts
import type { Bindings } from './core/index.js';
import type { manifest } from './manifest.gen.js';
import { budget, calls, listCalls, listWallets, setCallMode, summary, unwatchWallet, wallets, watchWallet } from '../app.js';

type B = Bindings<typeof manifest>;

/**
 * One function per action id in telegram.manifest.json; a missing one is a type error.
 * Return a string to reply with it, nothing for "done", or throw: the user then sees
 * only an error code and the details go to the log. The engine has already asked for
 * any confirmation the action's risk needs before calling these.
 */
export const actions: B['actions'] = {
  'status.show': () => summary(),
  'calls.list': () => listCalls(),
  'calls.mode': (mode) => setCallMode(mode ?? 'off'),
  'wallets.list': () => listWallets(),
  'wallets.watch': (address) => watchWallet(address ?? ''),
  'wallets.unwatch': (address) => unwatchWallet(address ?? ''),
};

/** One function per status field; null shows "—". Keep them cheap: they run each time the screen opens. */
export const status: NonNullable<B['status']> = {
  'calls.today': () => calls.length,
  'wallets.tracked': () => wallets.size,
  'budget.used': () => budget.used,
};
```

`examples/tracer-like/src/telegram/configAdapter.ts`: Task 6 Step 4의 `configAdapter.ts`와 같은 내용 (같은 `../app.js`에서 `config`, `saveConfig`를 가져온다). 전체:

```ts
import type { ConfigAdapter } from './core/index.js';
import { config, saveConfig } from '../app.js';

type Tree = Record<string, unknown>;

/**
 * Where the settings live. Point `read` at the project's current config object and
 * `write` at whatever saves it (and applies it, for settings marked "live").
 */
const source: { read(): Tree; write(next: Tree): void | Promise<void> } = {
  read: () => config,
  write: (next) => saveConfig(next),
};

const at = (tree: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((node, key) => (node !== null && typeof node === 'object' ? (node as Tree)[key] : undefined), tree);

export const configAdapter: ConfigAdapter = {
  get: (path) => at(source.read(), path),
  async set(path, value) {
    // Write a changed copy, so a failed save leaves the running config as it was.
    const next = structuredClone(source.read());
    const keys = path.split('.');
    const last = keys.pop() as string;
    const parent = keys.length > 0 ? at(next, keys.join('.')) : next;
    if (parent === null || typeof parent !== 'object' || !(last in parent)) throw new Error(`telegram-port: no config key ${path}`);
    (parent as Tree)[last] = value;
    await source.write(next);
  },
};
```

`examples/tracer-like/src/telegram/messages.ko.ts`:

```ts
import type { Messages } from './core/index.js';

// Keep this object JSON-shaped (double quotes, no trailing commas): the preview tool reads it.
export const messages: Messages = {
  "main.title": "🛰 트레이서",
  "calls.title": "📞 콜",
  "wallets.title": "👛 지갑",
  "status.btn": "지금 상태",
  "calls.list": "콜 목록",
  "calls.mode": "콜 모드",
  "calls.mode.off": "콜 모드 · 끄기",
  "calls.mode.record": "콜 모드 · 기록만",
  "calls.mode.quick": "콜 모드 · 빠르게",
  "wallets.list": "추적 지갑",
  "wallets.watch": "지갑 추가",
  "wallets.watch.ask": "추적할 지갑 주소를 보내세요.",
  "wallets.unwatch": "지갑 추적 해제",
  "wallets.unwatch.ask": "추적을 해제할 지갑 주소를 보내세요.",
  "settings.calls": "콜·레이더",
  "settings.budget": "예산",
  "settings.scoring": "채점",
  "set.radarHit": "레이더 표본률 (적중)",
  "set.radarMiss": "레이더 표본률 (빗나감)",
  "set.forensics": "포렌식 읽기",
  "set.daily": "하루 크레딧",
  "set.share": "포렌식 몫",
  "set.threshold": "알림 점수 기준",
  "alert.callVerdict": "📞 {token} 판정: {verdict}",
  "alert.walletMove": "👛 {wallet} 이동: {detail}",
  "alert.budgetExhausted": "⛽ 오늘 크레딧을 다 썼습니다 ({used}/{limit})",
  "status.calls.today": "오늘 콜",
  "status.wallets.tracked": "추적 지갑",
  "status.budget.used": "쓴 크레딧"
};
```

- [ ] **Step 5: 통과 확인** — Run: `npm run typecheck && npm test` → Expected: 타입 오류 0, 전체 PASS (두 예시의 동기화·연결 테스트 포함, 시뮬레이터 문제 0).

- [ ] **Step 6: 커밋**

```bash
git add examples/tracer-like
git commit -m "Add a Solana-Tracer-like example with grouped commands and many settings"
```

---

### Task 8: 스킬 문서 — SKILL.md와 references

**Files:**
- Create: `skills/telegram-port/SKILL.md`, `skills/telegram-port/references/{extract,manifest,wiring,safety}.md`
- Test: `tests/skill.test.ts`

**Interfaces:**
- Consumes: CLI 표면 (Task 5), 템플릿 계약 (Task 3)

- [ ] **Step 1: 실패하는 테스트** — `tests/skill.test.ts`:

```ts
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SKILL = 'skills/telegram-port';
const read = (p: string) => readFileSync(`${SKILL}/${p}`, 'utf8').replace(/\r\n/g, '\n');

describe('SKILL.md', () => {
  it('has a name and a description the router can match', () => {
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(read('SKILL.md'));
    expect(fm).not.toBeNull();
    expect(fm![1]).toMatch(/^name: telegram-port$/m);
    const description = /^description: (.+)$/m.exec(fm![1])?.[1] ?? '';
    expect(description.length).toBeGreaterThan(80);
    expect(description.length).toBeLessThan(1024);
    expect(description).toMatch(/Telegram/);
  });

  it('names every reference file it ships, and only those', () => {
    const named = [...read('SKILL.md').matchAll(/`references\/([\w.-]+\.md)`/g)].map((m) => m[1]);
    expect(new Set(named)).toEqual(new Set(readdirSync(`${SKILL}/references`)));
  });

  it('points only at files that exist inside the skill folder', () => {
    const docs = ['SKILL.md', ...readdirSync(`${SKILL}/references`).map((f) => `references/${f}`)].map(read).join('\n');
    const paths = [...docs.matchAll(/`((?:references|tools|templates|core)\/[\w./-]+\.\w+)`/g)].map((m) => m[1]!);
    expect(paths.length).toBeGreaterThan(6);
    for (const p of paths) expect(existsSync(`${SKILL}/${p}`), p).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/skill.test.ts` → Expected: FAIL (`ENOENT ... SKILL.md`).

- [ ] **Step 3: SKILL.md** — `skills/telegram-port/SKILL.md`:

````markdown
---
name: telegram-port
description: Use when the user wants to add, port or update a Telegram bot for a Node/TypeScript project - reads the project's docs, config and code, drafts menus, commands, a settings editor, alerts and a status screen, confirms them with the user, and installs a bot whose every button is wired to the project's own functions and checked by typecheck and a press-every-button simulator.
---

# telegram-port

Install a Telegram bot into the Node/TypeScript project in the current directory. The bot is
described by a manifest (data) and run by a bundled engine; you write only the wiring.

`<skill>` below is this skill's base directory (shown when the skill loads). Run tools with
`node <skill>/tools/port.mjs <command> --target <project root>`; each prints one JSON line.

## Ground rules

- Write project code only in steps 3 and 4: the files under `src/telegram/`, the wiring test,
  `.env.example`, `package.json` dependencies, and one start line the user approved.
- Never put a secret into settings and never lower a `danger` action without the user's explicit yes.
  `references/safety.md` has the rules.
- Never overwrite a file the project already has. The install tool keeps existing files; do the same by hand.
- Record progress in `.telegram-port/state.json` (`{ "step": N, "manifestRev": R }`) after each step,
  so an interrupted run can resume. Keep evidence for the draft in `.telegram-port/extract.md`.

## Steps

### 0. Check

- No `package.json` or `tsconfig.json`: tell the user this version supports Node/TypeScript only, and stop.
- `src/telegram/core/VERSION` exists: this is a re-run. Go to step 6.

### 1. Extract

Follow `references/extract.md`. Read the README and docs, the config schema or example, exported
functions and CLI commands, any existing bot commands, event and log points (alert candidates) and
counters (status candidates). Draft the manifest in the format of `references/manifest.md`, with
every item's evidence (`file:line`) in `.telegram-port/extract.md`.

### 2. Confirm the draft

Show the user, briefly: the menu tree, every `danger` action, the config paths left out as secrets,
and the items you were unsure about. Ask only about the unsure ones, at most four questions at a time,
as choices. When they approve, write `src/telegram/telegram.manifest.json`.

### 3. Install

1. Run `install`. It copies the engine (`core/`), writes `manifest.gen.ts`, the messages file,
   `handlers.ts`, `configAdapter.ts`, `index.ts` and `tests/telegram.wiring.test.ts`, and reports
   what it wrote and what it kept.
2. Add the dependencies the engine needs: `grammy` and `zod` (use the project's package manager).
3. Add `TELEGRAM_BOT_TOKEN=` and the owner variable from the manifest (default `TELEGRAM_CHAT_ID=`)
   to `.env.example`. Never write real values.
4. Find where the app starts. Show the user a diff that adds `await startBot();` (imported from
   `src/telegram/index.js`) there, and apply it only after they approve.
5. Replace the key-only texts in `messages.<lang>.ts` with real ones in the manifest's language,
   keeping the file JSON-shaped.

### 4. Wire and verify

Follow `references/wiring.md`.

1. Fill `handlers.ts`: one function per action and status field. The typecheck errors on that file
   are the list of what is still unwired.
2. Point `configAdapter.ts` at the project's config (`read` and `write`).
3. Run the project's typecheck and tests. The wiring test checks that the generated module matches
   the JSON, that every handler, text and setting is wired, that every setting path exists, and that
   the simulator can press every button without a failure.
4. Do not move on until all of it passes. If a failure is a judgement call (a handler that needs
   network to read, a setting the config does not have), ask the user.

### 5. Preview and wrap up

1. Run `preview` and give the user the path of `.telegram-port/preview.html`. It shows the whole bot
   without a token.
2. Explain how to get a token from @BotFather, how to find their own user id (for example by
   messaging @userinfobot), and where to put both. The owner must be a person's id: commands are
   accepted only from that person.
3. Summarize: actions wired, the `danger` actions, the settings left out, anything left to do.

### 6. Re-run

1. Extract again and show the user what changed against the existing manifest: added, removed and
   changed menus, actions and settings. Apply only what they approve, and raise `manifestRev` by one.
2. Run `install`. It replaces `core/` only when the bundled engine is newer (tell the user what
   changed), keeps every project file, and regenerates `manifest.gen.ts`.
3. In `handlers.ts`, add functions for new actions and turn removed ones into comments marked
   `// telegram-port: removed from the manifest`. Never rewrite a function a person wrote.
4. Add texts for new keys to the messages file. Then verify as in step 4.

## Tools

| Command | Does |
|---|---|
| `install` | engine + project layer, never overwriting; `--force-core` replaces a same-version engine |
| `gen` | rewrites `manifest.gen.ts` from the JSON (after any manifest edit) |
| `preview` | writes `.telegram-port/preview.html` (`--out` to change) |

Files: `tools/port.mjs`, `tools/lib/install.mjs`, `tools/lib/gen.mjs`, `tools/preview/preview.mjs`,
templates in `templates/handlers.ts`, `templates/configAdapter.ts`, `templates/index.ts`,
`templates/telegram.wiring.test.ts`, the engine in `core/index.ts`.

## References

- `references/extract.md`: where to look and how to turn a project into a draft
- `references/manifest.md`: the manifest format and its rules
- `references/wiring.md`: handlers, config adapter, messages, start line, re-run rules
- `references/safety.md`: risk levels, secrets, what needs the user's yes
````

- [ ] **Step 4: references 네 개**

`skills/telegram-port/references/extract.md`:

````markdown
# Extract: from a project to a draft manifest

Goal: a draft the user can approve in one pass. Prefer leaving a feature out to guessing it wrong;
the user can add it in step 2.

## Where to look

| What | Where | Becomes |
|---|---|---|
| What the app does, in its own words | README, `docs/` | menu titles and grouping |
| Settings | config schema (zod, JSON Schema, TS type), `config.example.*`, `.env.example` | `settings.fields` |
| Things it can do | exported functions, CLI commands (`bin`, `commander`, `yargs`), HTTP routes | `actions` |
| Existing bot commands | any `bot.command(...)`, slash-command tables | `actions` with `command` |
| Things worth telling the user | log lines at warn/error, events, state changes (`emit`, notifications) | `alerts` |
| Numbers worth a glance | counters, queue sizes, budgets, last-run times | `status.fields` |

## Turning it into a draft

- **Menus**: one per feature area the README names. `main` holds the most used read action, the
  feature menus, then `settings` and `status` (both built in; link them, do not define them).
- **Actions**: one per user-level operation, not per function. Ids are `area.verb` (`calls.list`).
  Commands are short lowercase words, only for the actions people will type.
- **Risk**: decide from names and docs, and round up.
  - `danger`: delete, remove, clear, purge, reset, send, transfer, withdraw, trade, buy, sell,
    deploy, drop, shutdown. Pick a `confirmPhrase` in capitals (`REMOVE`).
  - `write`: set, update, toggle, enable, disable, add, start, stop, pause.
  - `read`: list, show, get, status, search.
- **Arguments**: a fixed set of values becomes `enum` (the menu item lists them); free text becomes
  `text` or `number` with a `prompt`.
- **Settings**: numbers, booleans and fixed choices a person would tune. Give each a real `min`/`max`
  from the schema or docs; a fraction shown as a percentage gets `ratio: true`. `apply: "restart"`
  unless the code reads the value each time.
- **Leave out**: secrets (see `references/safety.md`), paths, URLs of other services, anything
  structural (arrays of objects).

## Evidence

For every menu, action, setting, alert and status field, add a line to `.telegram-port/extract.md`:
`- calls.list — src/calls/list.ts:12 listCalls(), README "Calls" section`. Show these to the user
when they ask why something is there.
````

`skills/telegram-port/references/manifest.md`:

````markdown
# The manifest

`src/telegram/telegram.manifest.json` defines the whole bot. The engine validates it at start and
will not start the bot when it is wrong; the wiring test reports the same problems.

```json
{
  "version": 1,
  "manifestRev": 1,
  "language": "en",
  "owner": { "env": "TELEGRAM_CHAT_ID" },
  "menus": [
    { "id": "main", "title": "main.title", "items": [{ "action": "sites.list" }, { "menu": "sites" }, { "menu": "settings" }, { "menu": "status" }] },
    { "id": "sites", "title": "sites.title", "items": [{ "action": "checks.mode", "args": ["on", "off"] }, { "action": "sites.clear" }] }
  ],
  "actions": [
    { "id": "sites.list", "label": "sites.list", "risk": "read", "command": "sites" },
    { "id": "checks.mode", "label": "checks.mode", "risk": "write", "arg": { "kind": "enum" } },
    { "id": "sites.clear", "label": "sites.clear", "risk": "danger", "command": "clear", "confirmPhrase": "CLEAR" }
  ],
  "settings": {
    "categories": [{ "id": "checks", "title": "settings.checks" }],
    "fields": [{ "id": "checks.timeout", "path": "checks.timeoutMs", "category": "checks", "label": "set.timeout", "kind": "int", "min": 500, "max": 30000, "apply": "live" }],
    "excluded": ["notify.*"]
  },
  "alerts": [{ "id": "site.down", "template": "alert.down", "mutable": false }],
  "status": { "fields": ["sites.total"] }
}
```

## Rules

- **Texts are keys.** `title`, `label`, `prompt`, `template` name a key in `messages.<lang>.ts`.
  Every key must exist there. A status field `x` needs the key `status.x`. An enum value `v` of an
  action labelled `k` may have its own button text under `k.v`.
- **Ids are identities.** Buttons carry ids, not positions, so menus can be reordered safely. Ids use
  letters, digits, `.`, `_`, `-`. Never reuse an id for a different meaning; make a new one.
- **`main` is required.** `settings` and `status` are built in: link them from a menu, never define them.
- **Every action is reachable**: on a menu, or with a `command`.
- **`risk` is required**: `read` runs at once, `write` asks for one tap, `danger` asks for the typed
  `confirmPhrase` and is audited. `danger` without a phrase is invalid.
- **Arguments**: `enum` values come from the menu item's `args`; `text` and `number` wait 5 minutes
  for the user's reply, then expire.
- **Settings**: `kind` is `boolean`, `enum` (with `options`), `int` or `float`. `ratio: true` shows and
  takes percentages but stores fractions; `min`/`max` are then fractions too. `apply: "restart"`
  tells the user the change needs a restart. Paths that look secret are refused (see `references/safety.md`).
- **Alerts**: `mutable: false` for alerts that must get through even while the user paused alerts.
- **`manifestRev`**: raise it by one whenever you change the manifest. Buttons from another
  revision answer "the menu has changed" instead of doing something stale.
- After every edit, run `gen` so `manifest.gen.ts` matches; the wiring test fails until it does.
````

`skills/telegram-port/references/wiring.md`:

````markdown
# Wiring

## handlers.ts

```ts
export const actions: B['actions'] = {
  'sites.list': () => listSites(),                // read: return the reply text
  'checks.mode': (mode) => setChecks(mode === 'on'), // enum: one of the menu's args
  'sites.add': (url) => addSite(url ?? ''),       // text: what the user typed
  'sites.clear': () => removeAllSites(),          // danger: runs only after the typed phrase
};
export const status: NonNullable<B['status']> = {
  'sites.total': () => sites.length,              // null shows "—"
};
```

- A handler gets `(arg, { chatId })` and returns a string (the reply), nothing ("done"), or throws.
  A throw shows the user only an error code; the details go to the log. Do not catch errors to turn
  them into friendly text that hides a failure.
- Call the project's existing functions. Do not reimplement logic in the handler.
- Do not ask for confirmation inside a handler: the engine already did, by the action's `risk`.
- Read handlers run in the simulator during tests, so they must be safe to call: no writes, and no
  network unless the project's tests already allow it. If a read needs network, ask the user whether
  to mock it in the wiring test.
- Status functions run every time the status screen opens. Keep them cheap.

## configAdapter.ts

Point `source.read` at the project's live config object and `source.write` at whatever saves it,
and applies it if the app reads config once at start (the `apply` field tells the user which is which).
`set` writes a changed copy, so a failed save leaves the running config untouched. The wiring test
checks every setting path exists in what `read` returns.

## messages.<lang>.ts

Real texts in the manifest's language. Keep the object JSON-shaped (double quotes, no trailing
commas) so the preview can read it. Use `{name}` placeholders for alert variables.

## index.ts and the start line

`index.ts` exports `startBot(log?, onAudit?)`, `sendAlert(id, vars)` and `stopBot()`. Add
`await startBot();` where the app starts (after config is loaded), shown to the user as a diff first.
Pass the app's logger if it has one. Call `sendAlert('site.down', { url })` where the event happens;
it never throws and returns false when the bot is off.

## Re-run rules

- Never overwrite `handlers.ts`, `configAdapter.ts`, `messages.<lang>.ts`, `index.ts` or the wiring test.
- New action: add its function. Removed action: turn its function into a comment marked
  `// telegram-port: removed from the manifest`, so the person decides.
- Changed action (same id, new meaning): ask the user; prefer a new id.
- After any manifest edit: run `gen`, then typecheck and tests.
````

`skills/telegram-port/references/safety.md`:

````markdown
# Safety

## Risk levels are enforced by the engine

`read` runs at once. `write` runs after one tap on a one-time confirm button that expires in five
minutes. `danger` runs only after the user types the exact `confirmPhrase`, and each run is passed to
`onAudit`. A handler cannot skip this. Your job is to pick the level.

- Round up. An action that can lose data, spend money, send something to other people or stop the
  app is `danger`, whatever its name.
- Show every `danger` action in step 2.
- Lowering an action from `danger` (or from `write` to `read`) needs the user's explicit yes, in
  their words, for that action.

## Secrets never reach the chat

The settings editor shows current values, so a secret in settings would be printed into Telegram
history. The engine refuses setting paths that match `*token*`, `*secret*`, `*password*`, `*key*`,
`*mnemonic*`, `*seed*`, `*passphrase*`, `*credential*`, `*pass`, `*pwd*` (any case), plus the
manifest's `settings.excluded` patterns.

- Leave secrets out of the draft entirely, and list what you left out in step 2.
- Add the project's own secret paths to `excluded` when their names do not match the patterns
  (for example `wallet.words`).
- A false positive (`monkey.count` matching `*key*`) only means that setting is not offered in chat.
  Mention it; do not rename the project's config to get around it.
- Never print token values. Write only variable names to `.env.example`.

## Owner

Commands are accepted only from the person whose id is in the owner variable. A group's id
(negative) receives alerts but nobody can run commands; tell the user to use their own id.

## Needs the user's yes

- the start line in the app
- lowering a risk level
- putting a path that looks secret into settings (refuse; there is no override)
- a handler that needs network or writes during the simulator run
````

- [ ] **Step 5: 통과 확인** — Run: `npx vitest run tests/skill.test.ts && npm test` → Expected: PASS (3 tests), 전체 통과.

- [ ] **Step 6: 커밋**

```bash
git add skills/telegram-port/SKILL.md skills/telegram-port/references tests/skill.test.ts
git commit -m "Write the skill and its references"
```

---

### Task 9: 플러그인 패키징과 문서

**Files:**
- Create: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `README.ko.md`
- Modify: `README.md`, `package.json` (`files` 없음; 버전 0.1.0 유지)
- Test: `tests/plugin.test.ts`

**Interfaces:**
- Consumes: 스킬 폴더 (Task 8)
- Produces: 설치 명령 `/plugin marketplace add PineappleBingo/telegram-port` → `/plugin install telegram-port@telegram-port`

- [ ] **Step 1: 실패하는 테스트** — `tests/plugin.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const json = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

describe('plugin packaging', () => {
  it('agrees on name and version across the plugin, the marketplace and package.json', () => {
    const plugin = json('.claude-plugin/plugin.json');
    const market = json('.claude-plugin/marketplace.json');
    const pkg = json('package.json');
    expect(plugin.name).toBe('telegram-port');
    expect(plugin.version).toBe(pkg.version);
    expect(market.name).toBe('telegram-port');
    expect(market.plugins).toHaveLength(1);
    expect(market.plugins[0]).toMatchObject({ name: 'telegram-port', source: './', version: pkg.version });
  });

  it('ships the skill where Claude Code looks for it', () => {
    expect(existsSync('skills/telegram-port/SKILL.md')).toBe(true);
  });

  it('documents installing in both READMEs', () => {
    for (const f of ['README.md', 'README.ko.md']) {
      const text = readFileSync(f, 'utf8');
      expect(text, f).toContain('/plugin marketplace add PineappleBingo/telegram-port');
      expect(text, f).toContain('/plugin install telegram-port@telegram-port');
      expect(text, f).toContain('/telegram-port');
    }
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/plugin.test.ts` → Expected: FAIL (`ENOENT ... plugin.json`).

- [ ] **Step 3: 패키징 파일**

`.claude-plugin/plugin.json`:

```json
{
  "name": "telegram-port",
  "version": "0.1.0",
  "description": "Port a Telegram bot into any Node/TypeScript project: menus, commands, a settings editor, alerts and a status screen, wired to the project's own functions and checked by typecheck and a press-every-button simulator.",
  "author": { "name": "PineappleBingo" },
  "homepage": "https://github.com/PineappleBingo/telegram-port",
  "repository": "https://github.com/PineappleBingo/telegram-port",
  "license": "MIT",
  "keywords": ["telegram", "bot", "grammy", "typescript", "skill"]
}
```

`.claude-plugin/marketplace.json`:

```json
{
  "name": "telegram-port",
  "owner": { "name": "PineappleBingo" },
  "plugins": [
    {
      "name": "telegram-port",
      "source": "./",
      "description": "Port a Telegram bot into any Node/TypeScript project, wired to the project's own functions.",
      "version": "0.1.0"
    }
  ]
}
```

- [ ] **Step 4: README 두 개** — `README.md`를 아래로 바꾸고, 같은 구성의 한국어판 `README.ko.md`를 쓴다(제목·명령·경로는 같고 설명만 한국어).

````markdown
# telegram-port

A Claude Code plugin that installs a Telegram bot into a Node/TypeScript project. It reads the
project's docs, config and code, drafts the bot with you, and wires every button to the project's
own functions.

- **Menus and commands** for each feature, with risk levels the engine enforces: `read` runs,
  `write` asks for a tap, `danger` asks for a typed phrase and is audited.
- **A settings editor** with range checks. Paths that look secret are refused.
- **Alerts** the app sends with one call, and **a status screen**.
- **Checked**: a missing handler is a type error, and a wiring test presses every button.
- **A preview** of the whole bot as one HTML page, before you have a token.

## Install

```
/plugin marketplace add PineappleBingo/telegram-port
/plugin install telegram-port@telegram-port
```

Or copy `skills/telegram-port/` into `~/.claude/skills/`: the folder works on its own.

## Use

In the project's root, run `/telegram-port`. It will:

1. read the project and draft the menus, actions, settings, alerts and status fields;
2. show you the draft (every dangerous action and every secret it left out) and ask about what is unclear;
3. install the engine and the wiring under `src/telegram/` and a wiring test;
4. wire the handlers until typecheck and the wiring test pass;
5. write a preview and tell you how to get a token.

Run it again after the project changes: it shows the difference, keeps your edits, and upgrades the
engine only when the plugin's is newer.

## What it adds to a project

```
src/telegram/
├─ core/                     the engine (do not edit; replaced on upgrade)
├─ telegram.manifest.json    menus, commands, settings, alerts, status
├─ manifest.gen.ts           generated from the JSON
├─ handlers.ts               action id → your function
├─ configAdapter.ts          where settings are read and saved
├─ messages.<lang>.ts        texts
└─ index.ts                  startBot() · sendAlert() · stopBot()
tests/telegram.wiring.test.ts
```

## Examples

- `examples/small-app`: a site watcher, nothing to do with coins.
- `examples/tracer-like`: grouped commands, many settings, alerts.

## Development

```bash
npm install
npm run typecheck
npm test
```

## License

MIT
````

- [ ] **Step 5: 통과 확인** — Run: `npx vitest run tests/plugin.test.ts && npm run typecheck && npm test` → Expected: PASS (3 tests), 전체 통과.

- [ ] **Step 6: 플러그인 검증 (CLI가 있으면)** — Run: `claude plugin validate .` → Expected: 오류 없음. 명령이 없거나 스키마 차이를 지적하면 지적대로 `plugin.json`·`marketplace.json`을 고치고 Step 5를 다시 돌린다.

- [ ] **Step 7: 커밋**

```bash
git add .claude-plugin README.md README.ko.md tests/plugin.test.ts
git commit -m "Package the plugin and document installing and using it"
```

---

### Task 10: 출시 전 점검 (수동, 사용자 승인 필요)

코드가 아니라 확인 절차다. 설계서 §6 "스킬 평가"와 출시 조건.

- [ ] **Step 1: 처음부터 실행해 보기** — `examples/small-app`을 임시 폴더에 복사하고 `src/telegram/`과 `tests/`를 지운 뒤, 그 폴더에서 플러그인을 로드한 Claude Code로 `/telegram-port`를 실행한다 (`claude --plugin-dir <repo>`). Expected: typecheck와 연결 테스트가 통과하는 봇이 설치되고, 사람이 고칠 곳은 확인 단계의 질문뿐.
- [ ] **Step 2: 다시 실행하기** — 같은 폴더에서 `handlers.ts`에 한 줄을 고친 뒤 `/telegram-port`를 다시 실행한다. Expected: 고친 줄이 그대로 있고, 차이 보고와 `manifestRev` +1.
- [ ] **Step 3: 출시** — 사용자 승인 후: PR 머지 → `git tag v0.1.0 && git push origin v0.1.0` → `gh release create v0.1.0 --title "telegram-port 0.1.0" --notes-file <요약>`.
````

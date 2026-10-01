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

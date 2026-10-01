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

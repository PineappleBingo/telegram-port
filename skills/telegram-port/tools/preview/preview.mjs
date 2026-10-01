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

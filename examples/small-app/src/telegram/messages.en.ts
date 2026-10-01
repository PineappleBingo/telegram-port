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

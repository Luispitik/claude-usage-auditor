#!/usr/bin/env node
/**
 * claude-usage-auditor · status
 */

const fs = require('fs');
const path = require('path');
const {
  SETTINGS_PATH,
  DATA_DIR,
  EVENTS_DIR,
  REPORTS_DIR,
  CONFIG_FILE,
  ERRORS_FILE,
  HOOK_MARKERS,
  VERSION
} = require('./config');
const { readJsonLoose } = require('./utils/fs-utils');

function hooksActive() {
  const settings = readJsonLoose(SETTINGS_PATH, {});
  if (!settings.hooks) return {};
  const active = {};
  for (const [event, entries] of Object.entries(settings.hooks)) {
    if (!Array.isArray(entries)) continue;
    const found = entries.some((entry) =>
      entry.hooks && entry.hooks.some((h) => {
        if (!h.command) return false;
        const norm = h.command.replace(/\\/g, '/');
        return HOOK_MARKERS.some((m) => norm.includes(m));
      })
    );
    if (found) active[event] = true;
  }
  return active;
}

function eventsToday() {
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dayDir = path.join(EVENTS_DIR, today);
  const legacyFile = path.join(EVENTS_DIR, `${today}.jsonl`);

  if (fs.existsSync(dayDir) && fs.statSync(dayDir).isDirectory()) {
    let count = 0;
    for (const file of fs.readdirSync(dayDir)) {
      if (!file.endsWith('.jsonl')) continue;
      const content = fs.readFileSync(path.join(dayDir, file), 'utf8');
      count += content.split(/\r?\n/).filter((l) => l.trim()).length;
    }
    return count;
  }

  if (!fs.existsSync(legacyFile)) return 0;
  const content = fs.readFileSync(legacyFile, 'utf8');
  return content.split(/\r?\n/).filter((l) => l.trim()).length;
}

function eventFilesCount() {
  if (!fs.existsSync(EVENTS_DIR)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(EVENTS_DIR, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.jsonl')) count += 1;
    if (entry.isDirectory()) {
      count += fs.readdirSync(path.join(EVENTS_DIR, entry.name)).filter((f) => f.endsWith('.jsonl')).length;
    }
  }
  return count;
}

function latestReport() {
  if (!fs.existsSync(REPORTS_DIR)) return null;
  const files = fs.readdirSync(REPORTS_DIR).filter((f) => f.endsWith('.html'));
  if (!files.length) return null;
  files.sort();
  return files[files.length - 1];
}

function readRecentErrors(days = 7) {
  if (!fs.existsSync(ERRORS_FILE)) return [];
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  return fs.readFileSync(ERRORS_FILE, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean)
    .filter((e) => new Date(e.ts).getTime() >= cutoff);
}

function main() {
  console.log('Claude Usage Auditor · status');
  console.log('');

  const active = hooksActive();
  const expected = ['PreToolUse', 'PostToolUse', 'Stop', 'SessionStart'];
  console.log('  Hooks in settings.json:');
  for (const ev of expected) {
    console.log(`    ${active[ev] ? '✓' : '✗'} ${ev}`);
  }

  console.log('');
  console.log('  Data:');
  if (!fs.existsSync(DATA_DIR)) {
    console.log(`    · Data directory does not exist: ${DATA_DIR}`);
  } else {
    const cfg = readJsonLoose(CONFIG_FILE, {});
    console.log(`    · Directory: ${DATA_DIR}`);
    console.log(`    · Version: ${cfg.version || VERSION}`);
    if (cfg.installed_at) console.log(`    · Installed: ${cfg.installed_at}`);
    console.log(`    · Event files: ${eventFilesCount()}`);
    console.log(`    · Events today: ${eventsToday()}`);
    console.log(`    · Latest report: ${latestReport() || '—'}`);

    const errors = readRecentErrors(7);
    if (errors.length > 0) {
      const last = errors[errors.length - 1];
      console.log(`    · Recent tracker errors (7d): ${errors.length}`);
      console.log(`    · Last error: ${last.stage || 'unknown'} — ${last.message || 'unknown'}`);
    }
  }
}

main();

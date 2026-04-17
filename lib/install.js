#!/usr/bin/env node
/**
 * claude-usage-auditor · install
 */

const fs = require('fs');
const path = require('path');
const {
  DATA_DIR,
  EVENTS_DIR,
  METRICS_DIR,
  REPORTS_DIR,
  CONFIG_FILE,
  SETTINGS_PATH,
  TRACKER_MARKER,
  SESSION_HOOK_MARKER,
  VERSION,
  DEBUG
} = require('./config');
const { readJsonStrict, writeJson, ensureDir, backupFile } = require('./utils/fs-utils');

const SKILL_DIR = path.resolve(__dirname, '..');
const HOOK_PATH = path.join(SKILL_DIR, 'hooks', 'tracker.js');
const SESSION_HOOK_PATH = path.join(SKILL_DIR, 'hooks', 'session-start.js');

function verbose(msg) {
  if (DEBUG) process.stdout.write(`${msg}
`);
}

function hookCommand(mode) {
  return `node "${HOOK_PATH}" ${mode}`;
}

function sessionHookCommand() {
  return `node "${SESSION_HOOK_PATH}"`;
}

function ensureHookEntry(hooks, eventName, mode, options = {}) {
  hooks[eventName] = hooks[eventName] || [];
  const cmd = options.command || hookCommand(mode);
  const marker = options.marker || TRACKER_MARKER;
  const exists = hooks[eventName].some((entry) => {
    if (!entry.hooks) return false;
    return entry.hooks.some((h) => h.command && h.command.replace(/\\/g, '/').includes(marker));
  });
  if (exists) return false;
  hooks[eventName].push({ hooks: [{ type: 'command', command: cmd }] });
  return true;
}

function ensureDataDirs() {
  ensureDir(DATA_DIR, 0o700);
  ensureDir(EVENTS_DIR, 0o700);
  ensureDir(METRICS_DIR, 0o700);
  ensureDir(REPORTS_DIR, 0o700);
}

function main() {
  console.log('Claude Usage Auditor · install');
  console.log('');

  ensureDataDirs();
  writeJson(CONFIG_FILE, {
    version: VERSION,
    installed_at: new Date().toISOString(),
    hook_path: HOOK_PATH
  }, { mode: 0o600 });
  verbose(`  data dir ready: ${DATA_DIR}`);

  if (!fs.existsSync(HOOK_PATH)) {
    console.error(`  Hook not found: ${HOOK_PATH}`);
    process.exit(1);
  }

  const backup = backupFile(SETTINGS_PATH);
  if (backup) verbose(`  settings backup: ${backup}`);

  let settings;
  try {
    settings = readJsonStrict(SETTINGS_PATH, {});
  } catch (err) {
    console.error(`  Cannot install: ${err.message}`);
    console.error('  Fix ~/.claude/settings.json and retry.');
    process.exit(1);
  }

  settings.hooks = settings.hooks || {};
  const added = {
    PreToolUse: ensureHookEntry(settings.hooks, 'PreToolUse', 'pre-tool-use'),
    PostToolUse: ensureHookEntry(settings.hooks, 'PostToolUse', 'post-tool-use'),
    Stop: ensureHookEntry(settings.hooks, 'Stop', 'stop'),
    SessionStart: ensureHookEntry(settings.hooks, 'SessionStart', null, {
      command: sessionHookCommand(),
      marker: SESSION_HOOK_MARKER
    })
  };

  writeJson(SETTINGS_PATH, settings, { mode: 0o600 });

  for (const [event, wasAdded] of Object.entries(added)) {
    console.log(`  ${wasAdded ? '✓' : '·'} Hook ${event}${wasAdded ? ' added' : ' already present'}`);
  }

  console.log('');
  console.log('Install complete.');
  console.log(`Data dir: ${DATA_DIR}`);
}

main();

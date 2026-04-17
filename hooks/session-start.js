#!/usr/bin/env node
/**
 * claude-usage-auditor · session-start hook
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { PROMPTED_DIR, DEBUG } = require('../lib/config');
const { readStdin } = require('../lib/utils/stdin');
const { ensureDir } = require('../lib/utils/fs-utils');

function verbose(msg) {
  if (DEBUG) process.stderr.write(`[session-start] ${msg}\n`);
}

function normalizePath(input) {
  const resolved = path.resolve(input);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function shouldSkip(cwd) {
  if (!cwd) return true;
  const normalized = normalizePath(cwd);
  const home = normalizePath(os.homedir());
  const tmp = normalizePath(os.tmpdir());

  if (normalized === home) return true;
  if (normalized === normalizePath(path.parse(normalized).root)) return true;
  if (normalized.startsWith(tmp + path.sep) || normalized === tmp) return true;

  if (path.dirname(normalized) === home && path.basename(normalized).startsWith('.')) return true;
  return false;
}

function cleanupOldLocks() {
  try {
    ensureDir(PROMPTED_DIR, 0o700);
    const cutoff = Date.now() - 24 * 3600 * 1000;
    for (const entry of fs.readdirSync(PROMPTED_DIR)) {
      const lockPath = path.join(PROMPTED_DIR, entry);
      const st = fs.statSync(lockPath);
      if (st.mtimeMs < cutoff) fs.unlinkSync(lockPath);
    }
  } catch {
    // best effort
  }
}

(async () => {
  try {
    const raw = await readStdin(500);
    let payload = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = {};
    }

    const cwd = payload.cwd || process.cwd();
    const sessionId = payload.session_id || 'unknown';
    if (shouldSkip(cwd)) {
      process.exit(0);
      return;
    }

    const goalsPath = path.resolve(cwd, '.nextgenai-productivity', 'goals.yaml');
    const relativeGoalsPath = path.relative(cwd, goalsPath) || '.nextgenai-productivity/goals.yaml';
    if (fs.existsSync(goalsPath)) {
      process.exit(0);
      return;
    }

    cleanupOldLocks();
    try {
      ensureDir(PROMPTED_DIR, 0o700);
      const lockFile = path.join(PROMPTED_DIR, `${sessionId}.lock`);
      if (fs.existsSync(lockFile)) {
        process.exit(0);
        return;
      }
      fs.writeFileSync(lockFile, new Date().toISOString(), { encoding: 'utf8', mode: 0o600 });
    } catch {
      // keep going
    }

    const message = [
      '',
      '[nextgenai-productivity] Este proyecto aun no tiene objetivos definidos.',
      `Falta: ${relativeGoalsPath}`,
      'Ejecuta /productivity-goals cuando quieras alinear los insights semanales con lo que importa en este proyecto.',
      ''
    ].join('\n');

    const out = {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: message
      }
    };
    process.stdout.write(JSON.stringify(out));
    process.exit(0);
  } catch (e) {
    verbose(e.message);
    process.exit(0);
  }
})();

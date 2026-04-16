/**
 * Configuración centralizada del plugin.
 *
 * Toda ruta al directorio de datos y los markers de hook pasan por aquí
 * para que renombrar el plugin o personalizar la ubicación sea 1 cambio.
 *
 * Override: exporta env var `CLAUDE_USAGE_DATA_DIR` si quieres otro path.
 * Retrocompatibilidad: por defecto sigue siendo ~/.nextgenai-productivity
 * para no romper instalaciones existentes.
 */

const path = require('path');
const os = require('os');

const HOME = os.homedir();
const DATA_DIR = process.env.CLAUDE_USAGE_DATA_DIR
  || path.join(HOME, '.nextgenai-productivity');

module.exports = {
  HOME,
  DATA_DIR,
  EVENTS_DIR: path.join(DATA_DIR, 'events'),
  METRICS_DIR: path.join(DATA_DIR, 'metrics'),
  REPORTS_DIR: path.join(DATA_DIR, 'reports'),
  LLM_CACHE_DIR: path.join(DATA_DIR, 'llm-cache'),
  PROMPTED_DIR: path.join(DATA_DIR, 'prompted'),
  API_KEYS_FILE: path.join(DATA_DIR, 'api-keys.yaml'),
  CONFIG_FILE: path.join(DATA_DIR, 'config.json'),
  SETTINGS_PATH: path.join(HOME, '.claude', 'settings.json'),
  // Markers independientes del nombre del directorio del plugin
  HOOK_MARKERS: ['/hooks/tracker.js', '/hooks/session-start.js'],
  TRACKER_MARKER: '/hooks/tracker.js',
  SESSION_HOOK_MARKER: '/hooks/session-start.js',
  DEBUG: !!process.env.NGAI_DEBUG || !!process.env.NEXTGENAI_DEBUG,
  VERSION: '0.2.1'
};

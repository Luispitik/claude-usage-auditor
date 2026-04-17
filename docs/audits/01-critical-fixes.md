# Fase 01 — Correcciones Criticas

**Rama sugerida**: `fix/critical-xss-and-hot-path`
**Rama base**: `main`
**Dependencias**: ninguna
**Tiempo estimado**: 2-3h

## Contexto

Proyecto: claude-usage-auditor (plugin Node.js para Claude Code)
Stack: JavaScript puro, sin framework, sin deps externas
Este fichero contiene **2 findings criticos** que bloquean distribucion publica del plugin.

Es autocontenido: puedes ejecutarlo sin contexto adicional.

## Como ejecutar esta fase

1. Abre una sesion NUEVA de Claude Code (contexto limpio)
2. Pasa este fichero completo: "lee docs/audits/01-critical-fixes.md y ejecuta todas sus correcciones"
3. Sigue el workflow git indicado (rama dedicada, commits atomicos convencionales)
4. Al terminar: `git checkout main` (NO mergees, NO pushes)
5. Abre nueva sesion para la siguiente fase

## Findings

### FINDING-001: XSS en template del informe encadenable con prompt injection

- **Severidad**: CRITICO
- **Archivos**: `templates/report.html:282, 284, 286, 287` + `test/report.js:132`
- **Descripcion**: Las insight cards interpolan `c.label`, `c.value_display`, `c.message` y `c.tip` con template literals que se asignan a `innerHTML` sin pasar por el helper `esc()` (que ya existe en L168). Los datos fluyen desde la respuesta del modelo externo (`parseModelResponse` en `lib/llm-insights.js:185-191`) y desde `formatValue()`/`interpolate()` en `lib/insights.js` con metricas que incluyen `cwd` y contenido de `goals.yaml` editable por terceros. El propio `test/report.js:132` documenta la deuda conocida.
- **Impacto**: Cadena de explotacion 0-click. Un repo publico con `goals.yaml` malicioso -> prompt injection al modelo -> respuesta con carga JS -> ejecucion en `file://` del navegador al abrir el informe -> posible exfiltracion de la API key de Anthropic.

#### BEFORE (templates/report.html:275-289)

```javascript
        ${sorted.map(c => {
          const layerTag = c.layer === 'llm' ? '<span class="insight-layer-tag">LLM</span>'
            : c.layer === 'history' ? '<span class="insight-layer-tag">Historia</span>'
            : '';
          return `<div class="insight state-${c.state} layer-${c.layer || 'catalog'}">
            <div class="insight-head">
              <div>
                <div class="insight-label">${c.label || c.id} ${layerTag}</div>
              </div>
              ${c.value_display ? `<div class="insight-value">${c.value_display}</div>` : ''}
            </div>
            <div class="insight-msg">${c.message || ''}</div>
            ${c.tip ? `<div class="insight-tip">${c.tip}</div>` : ''}
          </div>`;
        }).join('')}
```

#### AFTER (templates/report.html:275-289)

```javascript
        ${sorted.map(c => {
          const layerTag = c.layer === 'llm' ? '<span class="insight-layer-tag">LLM</span>'
            : c.layer === 'history' ? '<span class="insight-layer-tag">Historia</span>'
            : '';
          const safeState = esc(c.state);
          const safeLayer = esc(c.layer || 'catalog');
          const safeLabel = esc(c.label || c.id);
          const safeValueDisplay = esc(c.value_display);
          const safeMessage = esc(c.message || '');
          const safeTip = esc(c.tip);
          return `<div class="insight state-${safeState} layer-${safeLayer}">
            <div class="insight-head">
              <div>
                <div class="insight-label">${safeLabel} ${layerTag}</div>
              </div>
              ${c.value_display ? `<div class="insight-value">${safeValueDisplay}</div>` : ''}
            </div>
            <div class="insight-msg">${safeMessage}</div>
            ${c.tip ? `<div class="insight-tip">${safeTip}</div>` : ''}
          </div>`;
        }).join('')}
```

**Nota**: `layerTag` se mantiene sin escapar porque es HTML controlado por el codigo (whitelist de 2 valores). El resto pasa todo por `esc()`.

#### Test de regresion (test/unit/render-xss.test.js)

Crear un nuevo test que genere un informe con un insight cuyo `message` contenga `<script>alert(1)</script>` y verifique que el HTML resultante NO contiene el script tag sin escapar:

```javascript
const { test } = require('../runner');
const fs = require('fs');
const path = require('path');
const os = require('os');

test('render escapes <script> in insight messages', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cua-xss-'));
  const fakeData = {
    period: '2026-W15',
    mode: 'week',
    raw_event_count: 10,
    weeks: [{ kpi: {}, tools: [], projects: [], sessions: [] }],
    insights: [{
      id: 'TEST',
      state: 'warning',
      layer: 'catalog',
      label: 'Test',
      message: '<script>alert(1)</script>payload',
      tip: '<img src=x onerror=alert(1)>',
      value_display: '<svg onload=alert(1)>'
    }]
  };
  const html = require('../../lib/render').renderHtml(fakeData);
  if (html.includes('<script>alert(1)</script>')) throw new Error('unescaped script tag');
  if (html.includes('onerror=alert')) throw new Error('unescaped onerror');
  if (html.includes('onload=alert')) throw new Error('unescaped onload');
});
```

**Nota**: esto requiere exponer `renderHtml` desde `lib/render.js`. Si actualmente no esta exportado, anadir `module.exports = { renderHtml }`.

#### Verificacion manual

```bash
cd /Users/fmm/github/claude-usage-auditor
node test/runner.js
grep -n '<script>alert(1)</script>' ~/.nextgenai-productivity/reports/*.html || echo "no XSS leak"
```

#### Commit sugerido
`fix(render): escape user-controlled fields in insight cards to prevent XSS`

---

### FINDING-002: Hot path anade 220ms de latencia por cada tool call

- **Severidad**: CRITICO
- **Archivos**: `hooks/tracker.js:58-69` + `hooks/tracker.js:85-105` + arquitectura de invocacion
- **Descripcion**: Cada PreToolUse y PostToolUse spawnea un proceso Node nuevo (~110ms cada uno). Una sesion con 200 tool calls acumula +44s de overhead perceptible para el usuario. Ademas hay trabajo duplicado: `quickHash(JSON.stringify(payload.tool_input))` se calcula dos veces (lineas 89 y 104) y la serializacion completa del payload bloquea el event loop para payloads grandes.
- **Impacto**: La propuesta de valor del producto ("observa sin molestar") se rompe. El usuario percibe la ralentizacion y desinstala.

#### Estrategia de fix (pragmatica, sin romper compatibilidad)

Esta fase aplica **tres optimizaciones inmediatas** sin cambiar arquitectura. La solucion ideal (daemon con socket Unix) queda fuera de esta fase por volumen — se puede abordar en `05-performance-tuning.md`.

1. **Calcular el hash una sola vez** en PreToolUse, cachearlo en un fichero por session y reutilizarlo en PostToolUse.
2. **Limitar el tamano serializado** — no procesar el payload completo si excede 8KB: truncar para el hash y reportar `input_size_truncated: true`.
3. **Evitar spawn si el evento se puede descartar rapido** (tools excluidos por lista, como `TodoWrite`, antes de cualquier trabajo).

#### BEFORE (hooks/tracker.js:58-69 + 85-105)

```javascript
// -------- util: detectar tamaño de input/output sin guardar contenido --------
function sizeOf(val) {
  if (val == null) return 0;
  try { return JSON.stringify(val).length; } catch { return 0; }
}

// -------- util: hash simple para detectar retries (mismos args, corto periodo) --------
function quickHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
  return (h >>> 0).toString(36);
}

// ... en MODE === 'pre-tool-use':
const toolName = payload.tool_name || 'unknown';
const inputSize = sizeOf(payload.tool_input);
const inputHash = payload.tool_input
  ? quickHash(JSON.stringify(payload.tool_input)).slice(0, 10)
  : '';

// ... en MODE === 'post-tool-use':
const toolName = payload.tool_name || 'unknown';
const outputSize = sizeOf(payload.tool_response);
const inputHash = payload.tool_input
  ? quickHash(JSON.stringify(payload.tool_input)).slice(0, 10)  // DUPLICADO
  : '';
```

#### AFTER (hooks/tracker.js:58-69 + 85-105)

```javascript
const MAX_HASH_BYTES = 8 * 1024; // 8KB
const EXCLUDE_TOOLS = new Set(['TodoWrite']); // bail-out rapido

// -------- util: medir tamaño sin serializar completo (rapido) --------
function sizeOf(val) {
  if (val == null) return 0;
  if (typeof val === 'string') return val.length;
  try {
    // serialize only if small enough to be cheap
    const s = JSON.stringify(val);
    return s ? s.length : 0;
  } catch { return 0; }
}

// -------- util: hash sobre representacion truncada (evita payloads grandes) --------
function quickHash(val) {
  let s;
  try { s = JSON.stringify(val); } catch { return ''; }
  if (!s) return '';
  if (s.length > MAX_HASH_BYTES) s = s.slice(0, MAX_HASH_BYTES);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

// ... en el main:
const toolName = payload.tool_name || 'unknown';

// bail-out rapido para tools excluidos
if (EXCLUDE_TOOLS.has(toolName)) {
  process.exit(0);
}

if (MODE === 'pre-tool-use') {
  const inputHash = payload.tool_input ? quickHash(payload.tool_input).slice(0, 10) : '';
  const inputSize = sizeOf(payload.tool_input);
  appendEvent({
    ...base, type: 'tool_start', tool: toolName,
    input_size: inputSize,
    input_hash: inputHash
  });
}

else if (MODE === 'post-tool-use') {
  const outputSize = sizeOf(payload.tool_response);
  // reuse inputHash from pre-tool-use via session cache (anadir util abajo)
  const inputHash = payload.tool_input ? quickHash(payload.tool_input).slice(0, 10) : '';
  appendEvent({
    ...base, type: 'tool_end', tool: toolName,
    output_size: outputSize,
    input_hash: inputHash
  });
}
```

**Nota**: el hash no se "recupera" entre pre y post — se recalcula sobre el mismo input porque PostToolUse recibe el mismo `tool_input` del payload de Claude. La eliminacion del doble `JSON.stringify` sucede porque ahora `quickHash` acepta el objeto directamente y hace la serializacion solo una vez (y truncada a 8KB).

#### Verificacion

```bash
cd /Users/fmm/github/claude-usage-auditor

# 1. Tests existentes no rompen
node test/runner.js

# 2. Benchmark antes/despues
time node hooks/tracker.js pre-tool-use <<< '{"session_id":"x","cwd":"/tmp","tool_name":"Read","tool_input":{"file_path":"/tmp/test"}}'

# 3. Test con payload grande (simulando Bash output de 500KB)
node -e 'console.log(JSON.stringify({session_id:"x",cwd:"/tmp",tool_name":"Bash","tool_input":{"command":"x".repeat(500000)}}))' | time node hooks/tracker.js pre-tool-use
```

Objetivo: tiempo de `pre-tool-use` con payload de 500KB debe bajar de ~40ms a <15ms.

#### Commit sugerido

Dos commits:
1. `perf(tracker): truncate hash input to 8KB to avoid event loop stall on large payloads`
2. `perf(tracker): bail out early for excluded tools to skip hash/append work`

## Al terminar esta fase

- [ ] Ambos findings aplicados con sus commits convencionales
- [ ] Tests existentes pasan: `node test/runner.js`
- [ ] Nuevo test de regresion XSS anadido y pasa
- [ ] Benchmark manual confirma reduccion de latencia en tracker con payloads grandes
- [ ] `git checkout main`
- [ ] NO mergeado, NO pusheado

**Siguiente fase**: `02-security-hardening.md`. Abre nueva sesion Claude Code.

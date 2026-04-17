# Fase 07 — Code Quality (limpieza)

**Rama sugerida**: `chore/code-quality`
**Rama base**: `main`
**Dependencias**: ninguna (puede ejecutarse en paralelo con otras)
**Tiempo estimado**: 2-3h

## Contexto

Fixes menores de calidad: bugs cosmeticos, null handling, parsers, convenciones de plataforma.

## Findings

### CODE-004: loadApiConfig trunca API key si contiene `#` (MEDIO)

- **Archivo**: `lib/llm-insights.js:36`

**Accion**: sustituir `rawLine.replace(/#.*$/, '')` por la funcion `stripComment` ya existente en `lib/insights.js:260` (que respeta strings entre comillas). Mover `stripComment` a `lib/utils/yaml.js` (ya creado en Fase 04) y usar en ambos sitios.

**Commit**: `fix(llm-insights): use comment-aware parser that respects quoted strings`

---

### CODE-005: Template no protege weekOrDay null si raw_event_count > 0 (MEDIO)

- **Archivo**: `templates/report.html:194`

**Accion**: expandir la condicion de empty state:

```javascript
if (D.raw_event_count === 0 || !weekOrDay) {
  root.innerHTML = `<div class="empty-box">
    <h3>${!weekOrDay ? 'Semana sin datos agregables' : 'Sin eventos en este periodo'}</h3>
    <p>...</p>
  </div>`;
  return;
}
```

**Commit**: `fix(render): handle null weekOrDay with specific empty state`

---

### CODE-006: status.js no tolera CRLF en JSONL (MEDIO)

- **Archivo**: `lib/status.js:49`

**Accion**: sustituir `split('\n')` por `split(/\r?\n/)`. Mismo patron que `aggregate.js`.

**Commit**: `fix(status): tolerate CRLF line endings in JSONL`

---

### CODE-008: Lockfiles de session-start sin cleanup (MEDIO)

- **Archivo**: `hooks/session-start.js:73`

**Accion**: al inicio del hook, antes de crear el lockfile de la sesion actual, borrar oportunisticamente lockfiles con mtime >24h:

```javascript
try {
  const entries = fs.readdirSync(PROMPTED_DIR);
  const cutoff = Date.now() - 24 * 3600 * 1000;
  for (const e of entries) {
    const p = path.join(PROMPTED_DIR, e);
    const st = fs.statSync(p);
    if (st.mtimeMs < cutoff) fs.unlinkSync(p);
  }
} catch { /* best effort */ }
```

Benchmark: hacer este cleanup cuesta ~1ms con 10 entradas, ~5ms con 100. Aceptable para SessionStart.

**Commit**: `fix(session-start): opportunistic cleanup of stale prompted lockfiles`

---

### CODE-010: stripComment maneja `\` como escape indebido (BAJO)

- **Archivo**: `lib/insights.js:264`

**Accion**: documentar en comentario el comportamiento actual o alinearlo con el subset de YAML simple single-quoted (donde `\` es literal). Cambio trivial.

**Commit**: `fix(yaml): align stripComment backslash handling with YAML spec`

---

### CODE-011: buildPromptPayload rompe con derived null (BAJO)

- **Archivo**: `lib/llm-insights.js:70`

**Accion**: anadir guardas:

```javascript
function buildPromptPayload(opts) {
  const { week, agg, derived } = opts;
  if (!derived) {
    return null; // caller decide que hacer (skip call, log error)
  }
  // resto igual pero con ?? 0 en los multiplicadores
  const focusPct = (derived.focus_ratio ?? 0) * 100;
  ...
}
```

En el caller, si `buildPromptPayload` devuelve null, saltar la llamada al modelo y loguear el motivo.

**Commit**: `fix(llm-insights): guard against null derived to avoid NaN payload`

---

### CODE-012: shouldSkip no detecta plataforma (BAJO)

- **Archivo**: `hooks/session-start.js:47`

**Accion**: sustituir los literales `'/tmp'` y `'C:\\'` por `os.tmpdir()` y logica platform-aware:

```javascript
const os = require('os');

function shouldSkip(cwd) {
  if (!cwd) return true;
  const normalized = path.resolve(cwd);
  const tmp = os.tmpdir();
  if (normalized.startsWith(tmp)) return true;
  // Windows: tambien C:\ como root
  if (process.platform === 'win32' && /^[A-Z]:\\?$/.test(normalized)) return true;
  if (normalized === '/') return true;
  return false;
}
```

**Commit**: `fix(session-start): use os.tmpdir() instead of hardcoded paths`

---

### CODE-013: Test runner contamina cache entre suites (BAJO)

- **Archivo**: `test/runner.js:112`

**Accion**: tras cada archivo de test, limpiar cache:

```javascript
for (const f of testFiles) {
  require(f);
  delete require.cache[require.resolve(f)];
}
```

**Commit**: `test(runner): clear require.cache between test files`

---

### DA-010: today() en UTC desalinea dia del usuario (MEDIO)

- **Archivo**: `hooks/tracker.js` + `lib/aggregate.js`

**Accion**: cambiar `today()` a usar la hora local del usuario:

```javascript
function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
```

**Commit**: `fix(tracker): use local date for daily buckets to match user's working day`

## Al terminar esta fase

- [ ] 9 findings aplicados con commits separados
- [ ] Tests pasan: `node test/runner.js`
- [ ] `git checkout main`

Enhorabuena — plan completo aplicado. Score objetivo: **78-82/100**. Ejecuta `/fs-audit-project` para verificacion (modo VERIFY).

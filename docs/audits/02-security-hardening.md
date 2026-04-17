# Fase 02 — Security Hardening (altos + medios)

**Rama sugerida**: `fix/security-hardening`
**Rama base**: `main`
**Dependencias**: Fase 01 (criticos deben estar aplicados primero)
**Tiempo estimado**: 3-4h

## Contexto

Proyecto: claude-usage-auditor (plugin Node.js para Claude Code)
Stack: JavaScript puro, sin framework, sin deps externas
Este fichero contiene **6 findings** de severidad ALTO y MEDIO en el dominio de seguridad.

Es autocontenido: puedes ejecutarlo sin contexto adicional.

## Como ejecutar esta fase

1. Abre una sesion NUEVA de Claude Code (contexto limpio)
2. Pasa este fichero completo
3. Sigue el workflow git (rama dedicada, commits atomicos convencionales)
4. Al terminar: `git checkout main` (NO mergees, NO pushes)

## Findings

### SEC-002: Logging verboso con rutas absolutas del usuario (ALTO)

- **Archivo**: `hooks/session-start.js:81` + ~13 sitios con `console.log` en `lib/`
- **Descripcion**: El hook inyecta `goalsPath` absoluto (con username) en `additionalContext` del SessionStart. Ademas hay decenas de `console.log` con rutas completas en lib/install.js, lib/status.js, lib/llm-insights.js, lib/render.js.
- **Impacto**: Fuga de informacion al compartir logs. `additionalContext` se pasa al contexto de Claude Code.

**Accion**:
1. En `hooks/session-start.js:81`, reemplazar la ruta absoluta por nombre relativo al `cwd` actual (`path.relative(payload.cwd, goalsPath)`)
2. Envolver todos los `console.log` de `lib/` en una funcion `verbose(msg)` que solo emite si `process.env.NEXTGENAI_DEBUG === '1'`
3. Mantener los mensajes criticos de error como `console.error` (silenciar tambien bajo flag)

**Commit**: `fix(logging): gate verbose output behind NEXTGENAI_DEBUG flag`

---

### SEC-003: api-keys.yaml sin verificacion de permisos + DATA_DIR sin mode 0o700 (MEDIO)

- **Archivos**: `lib/install.js` (creacion de `DATA_DIR`) + `lib/llm-insights.js:20-50` (lectura de api-keys.yaml)

**Accion**:
1. En `lib/install.js`, crear `DATA_DIR` con `fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 })`.
2. Si el directorio ya existe, aplicar `fs.chmodSync(DATA_DIR, 0o700)`.
3. En `loadApiConfig` de `lib/llm-insights.js`, antes de leer, hacer `fs.statSync(keyPath)` y avisar al usuario (stderr) si los permisos son mas permisivos que 0o600. Opcional: aplicar `fs.chmodSync(keyPath, 0o600)` si el fichero lo posee el usuario.

**Test**: anadir test en `test/security/security.test.js` que verifique que el instalador crea DATA_DIR con mode 700.

**Commit**: `fix(security): enforce 0700 on data dir and warn on loose api-keys permissions`

---

### SEC-004: Mutacion de ~/.claude/settings.json sin backup previo (MEDIO)

- **Archivos**: `lib/install.js` + `lib/uninstall.js` + helper `readJson`

**Accion**:
1. Antes de mutar `settings.json`, crear backup: `fs.copyFileSync(settingsPath, settingsPath + '.bak.' + Date.now())`
2. En `readJson`, diferenciar "fichero no existe" (devolver `{}`) de "fichero invalido" (lanzar error con mensaje claro). NO silenciar JSON invalido devolviendo `{}` — puede destruir config existente.
3. Si hay JSON invalido, abortar la instalacion y pedir al usuario que repare el fichero o lo restaure del backup.

**Test**: test que simula `settings.json` corrupto previo y verifica que install NO lo sobrescribe.

**Commit**: `fix(install): backup settings.json before mutation and refuse invalid JSON`

---

### SEC-005: Prototype pollution latente en agregador (MEDIO)

- **Archivo**: `lib/aggregate.js:150-151`
- **Descripcion**: `s.tools[ev.tool]` y `s.cwds[ev.cwd]` usan claves directamente desde eventos JSONL no validados. Un evento con `tool: "__proto__"` contamina el objeto base.

**Accion**: validar las claves antes de usarlas:

```javascript
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function safeKey(k) {
  if (typeof k !== 'string' || FORBIDDEN_KEYS.has(k)) return null;
  return k;
}

// en aggregateBySession, antes de indexar:
const toolKey = safeKey(ev.tool);
if (!toolKey) continue;
s.tools[toolKey] = (s.tools[toolKey] || 0) + 1;

const cwdKey = safeKey(ev.cwd);
if (cwdKey) s.cwds[cwdKey] = (s.cwds[cwdKey] || 0) + 1;
```

**Test**: inyectar un evento con `tool: "__proto__"` y verificar que no aparece en el output ni contamina ningun otro agregado.

**Commit**: `fix(aggregate): filter forbidden keys to prevent prototype pollution`

---

### SEC-006: Chart.js y Google Fonts via CDN sin SRI ni CSP (MEDIO)

- **Archivo**: `templates/report.html`
- **Descripcion**: El informe carga recursos externos sin Subresource Integrity. Contradice la promesa "100% local".

**Accion** (eleccion segun prioridad):

**Opcion A (recomendada): inlinear todo.** Incluir Chart.js v4.4.0 minified y las tipografias (o subset) en el propio template. Elimina la carga externa por completo. Tamano del report: +180KB (Chart) + 40KB (fonts subset) pero sigue siendo un solo fichero HTML autocontenido.

**Opcion B: SRI + CSP estricta.** Mantener CDN con atributo `integrity="sha384-..."` y `crossorigin="anonymous"`. Anadir `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'sha256-...'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com;">`.

**Recomendacion**: Opcion A. La ganancia en coherencia con "100% local" justifica el peso extra.

**Commit**: `fix(report): inline chart.js and fonts to eliminate external CDN calls`

---

### SEC-007: `loadGoalsForCwd` no valida que goalsPath este bajo cwd (BAJO, hardening preventivo)

- **Archivo**: `lib/insights.js` (busqueda de `goals.yaml`)

**Accion**: despues de resolver `goalsPath`, verificar con `path.relative(cwd, resolvedPath)` que no empieza por `..` (path traversal).

**Commit**: `fix(goals): validate goalsPath is within cwd before reading`

## Al terminar esta fase

- [ ] 6 findings aplicados con commits convencionales separados
- [ ] Tests de la fase pasan: `node test/runner.js`
- [ ] `grep -rn "console.log" lib/ | wc -l` devuelve 0 (todo via verbose())
- [ ] `grep -rn "__proto__" test/` muestra el test de prototype pollution
- [ ] `git checkout main`

**Siguiente fase**: `03-testing-coverage.md`. Abre nueva sesion Claude Code.

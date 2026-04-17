# Fase 04 — Architecture Refactor

**Rama sugerida**: `refactor/config-and-namespace`
**Rama base**: `main`
**Dependencias**: ninguna (independiente de Fase 01-03)
**Tiempo estimado**: 4-6h

## Contexto

Limpieza de dead code, version drift, namespace chaos y god files. Alto ROI: 8-10 puntos de score por pocas horas.

## Findings

### ARCH-001: lib/config.js es dead code + env var CLAUDE_USAGE_DATA_DIR rota (ALTO)

- **Archivo**: `lib/config.js` (bien disenado, 0 imports)
- **Afectados**: `hooks/tracker.js`, `hooks/session-start.js`, `lib/install.js`, `lib/uninstall.js`, `lib/status.js`, `lib/aggregate.js`, `lib/insights.js`, `lib/llm-insights.js`, `lib/render.js` (8 modulos redeclaran constantes)

**Accion**:
1. Auditar que `lib/config.js` exporta: `DATA_DIR`, `EVENTS_DIR`, `METRICS_DIR`, `REPORTS_DIR`, `HOOK_MARKERS`, `VERSION`, `getDataDir()` (que respeta `CLAUDE_USAGE_DATA_DIR`).
2. En cada uno de los 8 modulos, sustituir las constantes locales por `const { DATA_DIR, ... } = require('./config')` (o `require('../lib/config')` desde hooks/).
3. Anadir test: `test/unit/config.test.js` que verifica que `CLAUDE_USAGE_DATA_DIR=/tmp/xxx` hace que DATA_DIR apunte a `/tmp/xxx`.
4. Anadir mencion de la env var al README en la seccion de Uso.

**Commit**: `refactor(config): make config.js the single source of truth for paths and version`

---

### ARCH-002: Version drift en 7+ sitios (ALTO)

- **Afectados**: SKILL.md, README.md, lib/install.js:71, lib/config.js:35, lib/insights-catalog.json:2, templates/report.html:138,145, commands/productivity-install.md:2

**Accion**:
1. Definir `VERSION` en `lib/config.js` como unica fuente de verdad.
2. `lib/install.js` escribe `version: VERSION` en el config.json del usuario (dinamico, NO hardcoded).
3. `lib/render.js` pasa `version: VERSION` al template y `report.html` usa `${D.version}` en vez de `v0.1` hardcoded.
4. `lib/insights-catalog.json` y docs pueden quedar desincronizados — anadir test que fallara si la version del catalog no coincide.
5. Actualizar SKILL.md y README.md a `0.3.0` y bump en config.js tras aplicar toda la fase.

**Commit**: `refactor(version): single source of truth in config.js, dynamic everywhere else`

---

### ARCH-003: Namespace chaos (nextgenai-productivity / claude-usage-auditor / productivity) (ALTO)

- **Afectados**: repo name, SKILL.md, DATA_DIR (`.nextgenai-productivity`), commands (`/productivity-*`)

**Accion** (decision estrategica — requiere input del usuario):

Consolidar en **uno** de los tres namespaces. Recomendacion: **`claude-usage`** (alineado con el nombre del repo, no arrastra la marca "nextgenai" ni la generica "productivity").

Cambios resultantes:
- DATA_DIR: `~/.claude-usage/` (migracion automatica desde `~/.nextgenai-productivity/` si existe)
- Commands: `/usage-install`, `/usage-status`, `/usage-goals`, `/usage-report`, `/usage-uninstall`
- Env var: `CLAUDE_USAGE_DATA_DIR` (ya era asi, bien)
- Marker de hooks: `claude-usage-auditor`
- HTML del report: titulo "Claude Usage"

**Si el usuario no decide ahora**, aplicar solo un paso defensivo: detectar ambos directorios al arrancar y avisar con warning que hay que consolidar.

**Commit**: `refactor(namespace): consolidate under claude-usage with migration from legacy dir`

---

### ARCH-004: insights.js es god file (364 LOC, 4 responsabilidades) (MEDIO)

**Accion**: split en 4 modulos bajo `lib/insights/`:
- `lib/insights/derived.js` — calculo de metricas derivadas
- `lib/insights/rules.js` — motor de reglas (que evalua el catalog contra las metricas)
- `lib/insights/history.js` — comparacion con mediana de 4 semanas
- `lib/insights/index.js` — orquestador + parser YAML (o mejor, mover YAML a `lib/utils/yaml.js`)

Mantener `lib/insights.js` como shim de retro-compat que re-exporta del nuevo directorio.

**Commit**: `refactor(insights): split god file into derived/rules/history submodules`

---

### ARCH-005: render.js orquesta via execFileSync en vez de require (MEDIO)

- **Archivo**: `lib/render.js:48, 73`

**Accion**: sustituir los dos `execFileSync('node', [AGGREGATE_PATH])` por `require('./aggregate')` y `require('./insights')` llamando directamente a las funciones exportadas. Si esas funciones no existen, anadirlas via `module.exports`.

Beneficios: 250-400ms menos de latencia, manejo de errores mas limpio, testing mas facil.

**Commit**: `refactor(render): replace subprocess spawns with direct require() calls`

---

### ARCH-006: Helpers duplicados readJson/writeJson/readStdin (MEDIO)

**Accion**: crear `lib/utils/fs-utils.js` y `lib/utils/stdin.js` con las funciones comunes. Reemplazar las duplicadas en install.js, uninstall.js, status.js, tracker.js, session-start.js.

**Commit**: `refactor(utils): extract duplicated fs/stdin helpers into lib/utils/`

---

### ARCH-007: llm-insights.js no integrada en render.js (BAJO)

- **Descripcion**: la capa LLM existe y tiene cache, pero no se invoca desde `render.js`. El usuario no puede activarla por el camino documentado.

**Accion**: en `lib/render.js`, despues de calcular insights deterministicos, si `api-keys.yaml` existe y tiene `enabled: true`, invocar `require('./llm-insights').getLlmCards({ week, agg, derived })` y anadir las cards devueltas al array de insights con `layer: 'llm'`. Cachear en `~/.nextgenai-productivity/llm-cache/YYYY-Www.json`.

**Commit**: `feat(render): integrate LLM insights layer into report generation`

## Al terminar esta fase

- [ ] 7 findings aplicados con commits separados
- [ ] `grep -rn "'.nextgenai-productivity'" lib/ hooks/ | wc -l` devuelve 0 o 1 (solo en config.js)
- [ ] `grep -rn "version.*'0\." lib/ hooks/ SKILL.md` devuelve 0 o 1 (solo en config.js)
- [ ] `node test/runner.js` pasa incluido el nuevo test de config env var
- [ ] `git checkout main`

**Siguiente fase**: `05-performance-tuning.md`. Abre nueva sesion Claude Code.

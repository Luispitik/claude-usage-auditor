# Fase 03 — Testing Coverage

**Rama sugerida**: `test/coverage-gaps`
**Rama base**: `main`
**Dependencias**: Fase 01 (criticos primero, para poder validarlos con tests)
**Tiempo estimado**: 3-4h

## Contexto

Existen 65 tests distribuidos en unit/e2e/security pero hay modulos clave sin cobertura y no hay CI que los ejecute automaticamente.

## Findings

### TEST-001: lib/llm-insights.js sin tests unitarios

- **Archivo**: `lib/llm-insights.js` (221 LOC) — modulo con exposicion externa (HTTPS hacia Anthropic) y 0 tests
- **Accion**: crear `test/unit/llm-insights.test.js` con 9 casos:
  1. `loadApiConfig` — lee YAML valido, devuelve `{key, model, enabled}`
  2. `loadApiConfig` — YAML con `#` en string entre comillas NO trunca (regresion CODE-004)
  3. `loadApiConfig` — ausencia de fichero devuelve null
  4. `loadApiConfig` — fichero con permisos >0600 emite warning
  5. `buildPromptPayload` — agregados numericos validos producen payload esperado
  6. `buildPromptPayload` — `derived` null NO produce NaN/null en payload (regresion CODE-011)
  7. `parseModelResponse` — respuesta con 3 insights valida los parsea
  8. `parseModelResponse` — respuesta malformada devuelve `[]` sin crash
  9. Cache semanal — hit en misma semana, miss en semana distinta, regeneracion con `--force`

Usar mock de `https` para evitar llamadas reales. Patron: monkey-patch `https.request` en el test.

**Commit**: `test(llm-insights): add unit tests for config/payload/parse/cache`

---

### TEST-002: lib/status.js sin tests unitarios

- **Archivo**: `lib/status.js` (109 LOC)
- **Accion**: crear `test/unit/status.test.js` con 5 casos:
  1. `status` con 0 eventos devuelve `{events_today: 0, last_report: null}`
  2. `status` con JSONL valido devuelve conteo correcto
  3. `status` tolera CRLF en JSONL (regresion CODE-006)
  4. `status` con ultimo informe existente reporta su path relativo (no absoluto)
  5. `status` reporta la version correcta (despues de arreglar CODE-003 / OPS-002)

**Commit**: `test(status): add unit tests for counting, CRLF tolerance, version reporting`

---

### TEST-003: XSS regression test para render.js

Ya cubierto en Fase 01. Validar que el test esta en `test/unit/render-xss.test.js` y pasa.

---

### TEST-004: E2E con payload grande y retries concurrentes

- **Archivo**: extender `test/e2e/pipeline.test.js`
- **Accion**: anadir caso que:
  1. Simula 3 sesiones escribiendo eventos concurrentemente (via `spawn` de 3 procesos node llamando al tracker)
  2. Cada sesion envia 20 eventos con `input_size` de 5KB (por encima de PIPE_BUF)
  3. Verifica que al final el JSONL tiene 60 lineas validas (o registra el conteo real y falla con aviso si hay perdida, documentando la race para Fase 05)

Este test **puede fallar deliberadamente hasta que se aplique el fix de PERF-002** (un-archivo-por-sesion). Documentar en el test que es un test xFail hasta esa correccion.

**Commit**: `test(e2e): add concurrent-sessions large-payload stress test (xfail until PERF-002)`

## Al terminar esta fase

- [ ] 2-3 nuevos archivos de test anadidos bajo `test/unit/`
- [ ] Cobertura de `lib/llm-insights.js` y `lib/status.js` sube de 0 a al menos 70%
- [ ] `node test/runner.js` ejecuta los nuevos tests sin romper los existentes
- [ ] `git checkout main`

**Siguiente fase**: `04-architecture-refactor.md`. Abre nueva sesion Claude Code.

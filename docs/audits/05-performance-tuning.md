# Fase 05 — Performance Tuning

**Rama sugerida**: `perf/streaming-and-concurrency`
**Rama base**: `main` (aplicar DESPUES de Fase 04 porque reaprovecha config.js centralizado)
**Dependencias**: Fase 04
**Tiempo estimado**: 4-8h

## Contexto

La Fase 01 aplico los fixes criticos rapidos (hash truncado, bail-out). Esta fase ataca los problemas estructurales de rendimiento: race condition, streaming, subprocess.

## Findings

### PERF-002: Race condition — un archivo por sesion (ALTO)

- **Archivo**: `hooks/tracker.js:45-55` + `lib/aggregate.js:85-95`

**Accion**:
1. Cambiar el layout de `EVENTS_DIR`:
   - Antes: `events/YYYY-MM-DD.jsonl`
   - Despues: `events/YYYY-MM-DD/<session_id>.jsonl`
2. `hooks/tracker.js:appendEvent` ahora usa `path.join(EVENTS_DIR, today(), session_id + '.jsonl')`.
3. `lib/aggregate.js:loadEventsForDates` recorre cada subdirectorio `YYYY-MM-DD/*.jsonl` con glob.
4. Anadir migracion idempotente al inicio del tracker: si existe `events/YYYY-MM-DD.jsonl` y el layout nuevo esta vacio para esa fecha, rotar el fichero antiguo a `events/YYYY-MM-DD/legacy.jsonl`.

**Commit**: `fix(tracker): one file per session to eliminate append race condition`

---

### PERF-004: loadEventsForDates carga todo en memoria (ALTO)

- **Archivo**: `lib/aggregate.js:85-100`

**Accion**: sustituir `fs.readFileSync` + `split('\n')` por streaming con `readline`:

```javascript
const readline = require('readline');
const fs = require('fs');

async function streamEvents(filePath, onEvent) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try { onEvent(JSON.parse(line)); } catch { /* descarta linea invalida */ }
  }
}
```

Agregadores (por sesion, por semana) acumulan directamente sin guardar la lista completa de eventos.

Anadir cap del rango: por defecto 30 dias, con flag `--force-range` para rangos mas grandes.

**Commit**: `perf(aggregate): stream JSONL events instead of loading all in memory`

---

### PERF-003: Duplicate hash calculation (ALTO) 

Ya cubierto en Fase 01 con el hash truncado y un solo calculo. Verificar que no hay regresion.

---

### DA-003: Modo remoto (SSH/devcontainer) roto (ALTO)

- **Descripcion**: hooks corren en servidor, informes en home remoto, navegador en laptop local

**Accion** (requiere decision de arquitectura — presentar al usuario):

**Opcion A**: detectar que estamos en remote (`$REMOTE_CONTAINERS`, `$CODESPACES`, SSH session) y generar informes en formato auto-contenido portable. Anadir comando `/productivity-export` que hace tar+base64 del informe y lo imprime para copy-paste.

**Opcion B**: modo "servir desde servidor" — anadir comando `/productivity-serve` que lanza un http.createServer en puerto local (tipico de VS Code port-forwarding) y devuelve la URL portforwarded.

**Opcion C**: documentar la limitacion en README y marcar modo remoto como "no soportado" por ahora.

**Recomendacion**: Opcion A + C. Documentar limitacion + dar workaround export.

**Commit**: `feat(remote): detect remote sessions and provide export workaround`

---

### PERF-007: Cadena de existsSync en session-start (MEDIO)

- **Archivo**: `hooks/session-start.js:66, 70, 72`

**Accion**: sustituir la cadena de `existsSync` + `mkdirSync` por `mkdirSync({ recursive: true })` idempotente (una sola syscall eficaz).

**Commit**: `perf(session-start): replace existsSync chains with idempotent mkdir`

---

### PERF-008: callAnthropic sin retry ni AbortController (MEDIO)

- **Archivo**: `lib/llm-insights.js:141`

**Accion**:
1. Envolver `https.request` en `AbortController` para liberar el socket si se aborta.
2. 1 reintento con 2s de backoff si error es de red (no 4xx).
3. Si sigue fallando, log del error a `~/.nextgenai-productivity/errors.jsonl` y devolver `[]` para que el informe se renderice sin la capa LLM pero con aviso visible ("LLM no disponible esta semana").

**Commit**: `fix(llm): add retry, abort controller, and error log for transient failures`

---

### PERF-009: Sin rotacion de eventos JSONL + PROMPTED_DIR (MEDIO)

**Accion**:
1. Anadir `lib/prune.js` exportando `pruneOlderThan(days)` que borra directorios `events/YYYY-MM-DD/` mas antiguos que `days`.
2. Anadir comando `/productivity-prune` que invoca con flag `--older-than 90d` por defecto.
3. En `hooks/session-start.js`, purgar oportunisticamente lockfiles de `PROMPTED_DIR` mayores a 24h (low priority, solo si no cuesta tiempo).

**Commit**: `feat(prune): add retention policy command for events and lockfiles`

## Al terminar esta fase

- [ ] Benchmark con sesion simulada de 200 tool calls confirma reduccion de latencia
- [ ] Test de stress concurrente (xfail de Fase 03) ahora pasa
- [ ] Agregacion de 30 dias consume <10MB de heap (verificar con `--max-old-space-size=32`)
- [ ] `git checkout main`

**Siguiente fase**: `06-devops-setup.md`. Abre nueva sesion Claude Code.

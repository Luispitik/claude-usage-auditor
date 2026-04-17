# Fase 06 — DevOps Setup

**Rama sugerida**: `chore/devops-setup`
**Rama base**: `main`
**Dependencias**: Fase 04 (version centralizada en config.js)
**Tiempo estimado**: 3-5h

## Contexto

Cerrar los huecos de distribucion y observabilidad: package.json, CI, CHANGELOG, CONTRIBUTING, schema versioning, error log.

## Findings

### OPS-001: Sin CI/CD (ALTO)

**Accion**: crear `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - run: node test/runner.js
  test-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: node test/runner.js
```

Activar branch protection en main: require status check `test (20)`.

**Commit**: `ci: add GitHub Actions workflow running tests on Node 18/20/22 + Windows`

---

### OPS-006: Sin package.json (MEDIO, pero clave para distribucion)

**Accion**: crear `package.json` en la raiz:

```json
{
  "name": "claude-usage-auditor",
  "version": "0.3.0",
  "description": "Plugin para Claude Code que mide uso local del CLI y genera informes HTML con insights",
  "main": "lib/render.js",
  "bin": {
    "claude-usage-install": "lib/install.js",
    "claude-usage-uninstall": "lib/uninstall.js",
    "claude-usage-report": "lib/render.js"
  },
  "scripts": {
    "test": "node test/runner.js",
    "test:security": "node test/runner.js test/security/",
    "install-hooks": "node lib/install.js",
    "uninstall-hooks": "node lib/uninstall.js"
  },
  "engines": {
    "node": ">=18"
  },
  "keywords": ["claude-code", "plugin", "productivity", "observability"],
  "author": "Luispitik",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/Luispitik/claude-usage-auditor.git"
  },
  "dependencies": {}
}
```

Actualizar `lib/config.js` para leer `VERSION` desde `package.json` via `require('../package.json').version`.

Simplificar el README: ahora el comando de instalacion es `npm install` + `npx claude-usage-install`.

**Commit**: `chore: add package.json with npm-style install and version source-of-truth`

---

### OPS-004: Hooks fallan en silencio (ALTO, bumped)

**Accion**:
1. En `hooks/tracker.js`, sustituir el silencio actual por `writeError(msg)`:

```javascript
function writeError(stage, err) {
  try {
    const errFile = path.join(DATA_DIR, 'errors.jsonl');
    fs.appendFileSync(errFile, JSON.stringify({
      ts: new Date().toISOString(),
      stage,
      message: err.message,
      stack: err.stack ? err.stack.slice(0, 500) : null
    }) + '\n');
  } catch { /* no podemos hacer mas */ }
}
```

2. `lib/status.js` lee `errors.jsonl` y muestra conteo: "tracker ha registrado N errores en los ultimos 7 dias. Ultimo: [mensaje]"

3. Generar advertencia en el informe HTML si hay errores recientes.

**Commit**: `feat(observability): write tracker errors to errors.jsonl and surface in status`

---

### OPS-005: Sin CHANGELOG ni git tags (MEDIO)

**Accion**:
1. Crear `CHANGELOG.md` siguiendo keep-a-changelog. Entradas para 0.1.0, 0.2.0 (retroactivas desde git log) y 0.3.0 (esta fase).
2. Tag retroactivo: `git tag v0.2.0 <hash>` y `git tag v0.3.0` tras completar el plan.
3. Anadir script `npm run release` que bump la version, actualiza CHANGELOG, hace commit y crea tag.

**Commit**: `docs(changelog): add CHANGELOG.md and tag historical releases`

---

### OPS-007: Sin migracion de schema de events.jsonl (MEDIO)

**Accion**:
1. Anadir campo `v: 1` a cada evento escrito por el tracker.
2. En `lib/aggregate.js`, leer el campo `v` y:
   - Si `v === undefined` -> asumir v0 (compatibilidad retroactiva)
   - Si `v === 1` -> formato actual
3. Documentar el schema actual en `docs/SCHEMA.md`.
4. Cuando se haga un cambio futuro de schema, incluir en `lib/migrate.js` una funcion `migrateV0toV1(event)` que se aplica on-the-fly durante la agregacion.

**Commit**: `feat(schema): version event schema with v field for forward migration`

---

### OPS-008: Sin CONTRIBUTING.md y env var no documentada (MEDIO)

**Accion**:
1. Crear `CONTRIBUTING.md` con: como clonar, como ejecutar tests, como crear PR, estructura del codigo, estilo de commits (Conventional Commits).
2. Anadir seccion "Entornos y variables" en el README que documente `CLAUDE_USAGE_DATA_DIR`, `NEXTGENAI_DEBUG`, y la activacion de `api-keys.yaml`.

**Commit**: `docs: add CONTRIBUTING.md and document environment variables`

---

### OPS-009: Install no idempotente al 100% (BAJO)

**Accion**: en `lib/install.js`, si `DATA_DIR` existe pero faltan subdirectorios (`events/`, `metrics/`, `reports/`), crearlos silenciosamente. Asegurar que dos `install.js` consecutivos dejan el estado identico.

**Test**: ejecutar `install` -> `rm -rf metrics/` -> `install` y verificar que `metrics/` existe despues.

**Commit**: `fix(install): ensure idempotent reconstruction of missing subdirectories`

---

### OPS-011: Sin secret scanner en CI (BAJO)

**Accion**: anadir step en `.github/workflows/ci.yml` con `gitleaks-action`. Falla el CI si detecta secrets en el diff.

**Commit**: `ci: add gitleaks to scan PRs for accidentally committed secrets`

## Al terminar esta fase

- [ ] `package.json` presente con version de source-of-truth
- [ ] CI verde en GitHub
- [ ] `CHANGELOG.md` con entradas 0.1/0.2/0.3
- [ ] `git tag --list` muestra v0.1.0, v0.2.0, v0.3.0
- [ ] `CONTRIBUTING.md` presente
- [ ] `git checkout main`

**Siguiente fase**: `07-code-quality.md`. Abre nueva sesion Claude Code.

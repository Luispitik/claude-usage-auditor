# Plan de Correccion — claude-usage-auditor

Score actual: **41/100** | Score objetivo tras plan completo: **78-82/100**
Fecha: 2026-04-17 | Iteracion: 01

## Fases detectadas

| N | Fichero | Findings | Severidad | Tiempo | Dependencias |
|---|---|---|---|---|---|
| 01 | `01-critical-fixes.md` | 2 | CRITICO | 2-3h | ninguna |
| 02 | `02-security-hardening.md` | 6 | ALTO/MEDIO | 3-4h | 01 |
| 03 | `03-testing-coverage.md` | 4 | - | 3-4h | 01 |
| 04 | `04-architecture-refactor.md` | 7 | ALTO/MEDIO | 4-6h | ninguna |
| 05 | `05-performance-tuning.md` | 6 | ALTO/MEDIO | 4-8h | 04 |
| 06 | `06-devops-setup.md` | 8 | ALTO/MEDIO | 3-5h | 04 |
| 07 | `07-code-quality.md` | 9 | BAJO | 2-3h | ninguna |

**Tiempo total estimado:** 21-33 horas de trabajo efectivo.

## Como ejecutar (IMPORTANTE leer antes)

Los ficheros se ejecutan **uno por uno, cada uno en sesion nueva de Claude Code**. NO pasar varios ficheros en la misma sesion: el contexto se llena y la calidad de los fixes degrada.

### Flujo recomendado

1. Abre Claude Code en este directorio
2. Pasale el primer fichero: *"Lee `docs/audits/01-critical-fixes.md` y ejecuta todas sus correcciones siguiendo su workflow git"*
3. Revisa los commits generados antes de mergear
4. Al terminar, **cierra la sesion** y abre una nueva
5. Repite con el siguiente fichero

### Ruta rapida (solo criticos)

Si solo puedes permitirte aplicar una fase: **ejecuta solo `01-critical-fixes.md`**. Quedas protegido del XSS encadenable (RCE 0-click en navegador del usuario) y del cold-start que penaliza cada tool call. El resto son mejoras importantes pero no inmediatas.

### Orden alternativo por impacto

Si prefieres optimizar el score lo mas rapido posible con horas limitadas:

1. **01-critical-fixes.md** — +15-20 pts (desbloquea distribucion)
2. **04-architecture-refactor.md** — +8-10 pts (config.js dead code + version drift + namespace)
3. **06-devops-setup.md** — +5-7 pts (CI + package.json)
4. **02-security-hardening.md** — +5-6 pts
5. **03-testing-coverage.md** — +3-5 pts
6. **05-performance-tuning.md** — +3-5 pts (profundo pero menos visible al usuario)
7. **07-code-quality.md** — +2-3 pts

## Lo que NO hace este plan

- NO mergea a main
- NO hace push
- NO crea Pull Requests automaticamente
- Solo genera ramas locales con commits convencionales. Tu decides que hacer con cada una.

## Contexto del proyecto

- **Tipo**: plugin Node.js para Claude Code (no app web, no servicio)
- **Tamano**: 2.896 LOC, 19 archivos, 3 commits, 1 dia de vida
- **Stack**: JavaScript puro sin TypeScript, sin framework, cero dependencias propias
- **Distribucion**: git clone + `node lib/install.js`

## Hallazgos por dimension

- **Seguridad**: 25/100 — 1 critico encadenado (XSS + prompt injection), logging verboso, mutacion config sin backup
- **Rendimiento**: 40/100 — cold-start 220ms por tool, race JSONL, memoria unbounded, modo remoto roto
- **Arquitectura**: 50/100 — config.js dead code, version drift 7x, god file insights.js, namespace chaos
- **Testing**: 55/100 — llm-insights sin tests, status.js sin tests, sin CI
- **Calidad**: 55/100 — privacy-by-design y defensivo bien, pero duplicacion y bugs menores
- **DevOps**: 30/100 — sin CI, sin package.json, sin CHANGELOG, hooks fallan silenciosos

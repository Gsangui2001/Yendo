# CLAUDE.md — Yendo

> Contexto del proyecto que Claude Code lee automáticamente cada sesión.
> La documentación completa está en `docs/`.

## Qué es Yendo

Plataforma de cadetes y delivery local en **Colón, Entre Ríos, Argentina**.
Conecta **comercios** y **clientes particulares** con **cadetes** locales.
KPI central: crear un pedido en **5 segundos**. Velocidad + simplicidad.

- Visión: ser el servicio de mensajería más rápido y confiable.
- ~30 comercios adheridos · ~20 cadetes · cobertura local Colón.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React + Vite + Tailwind CSS |
| Backend | Node.js + Express (`Backend/`) |
| Base de datos / Auth / Realtime | Supabase (PostgreSQL) |
| Deploy Frontend | Netlify (auto-deploy desde GitHub) |

## Estructura del repo

```
C:\Proyectos\yendo\
├── Backend/        Node + Express (rutas: ordenes, cadetes)
├── Frontend/       React + Vite (la app principal)
│   └── src/
│       ├── pages/{admin,comercio,cadete,privado}/Dashboard.jsx
│       ├── pages/AuthPage.jsx        login/registro
│       ├── components/Layout.jsx     sidebar
│       ├── components/Comercio/Pedido.jsx
│       ├── components/Cadete/NotificacionesPedidos.jsx
│       ├── components/Particular/SolicitarCadete.jsx
│       └── lib/supabaseClient.js
├── docs/           Documentación (Obsidian) — leer para contexto
└── CLAUDE.md       este archivo
```

## Roles de usuario

| Rol | Prioridad | Función |
|---|---|---|
| 🏪 Comercio | ALTA | Crear pedidos, gestionar clientes, presupuesto/saldo |
| 👤 Privado | BAJA | Pedir cadete para mandados |
| 🚴 Cadete | — | Tomar pedidos, ganancias, jornada |
| 📊 Admin | — | Supervisar todo, alta de comercios/cadetes, precios/zonas |

## Base de datos (Supabase)

Tablas: `perfiles`, `comercios` (con `saldo`/`categoria`), `clientes`, `cadetes`,
`direcciones`, `ordenes`, `zonas` (con `precio`, `precio_km`, `tiempo`).
RLS activado + políticas admin. Trigger `handle_new_user` crea perfil al registrarse.
Proyecto Supabase: `gzcsvexfnfzwtmlayafb`.

## URLs en producción

| | URL |
|---|---|
| Landing (presentación) | https://yendo-landing.netlify.app |
| App (login + paneles) | https://yendo-app-panel.netlify.app |

Repos GitHub: `Gsangui2001/yendo-landing` (landing, branch master) ·
`Gsangui2001/Yendo` (código, branch main).

## Cuentas de prueba

> Las credenciales reales NO se guardan en el repo. Cargá los usuarios en
> Supabase y usá una contraseña propia. Placeholders de referencia:

- Admin: `admin@example.com` / `CAMBIAR_EN_SUPABASE`
- Comercio: `comercio@example.com` / `CAMBIAR_EN_SUPABASE`
- Cadete: `cadete@example.com` / `CAMBIAR_EN_SUPABASE`
- Privado: `privado@example.com` / `CAMBIAR_EN_SUPABASE`

## Sistema de presupuesto

El admin asigna un **presupuesto (saldo)** al registrar un comercio.
Cada pedido **valida y descuenta** el costo del envío del saldo del comercio.
El admin puede **recargar** saldo desde el panel de Comercios.

## Documentación en `docs/`

- `Estrategia.md` — visión, posicionamiento, canales, modelo de negocio
- `usuario.md` — flujos detallados por tipo de usuario
- `matching-prioridad.md` — lógica de asignación cadete (comercio > particular)
- `guia-uso.md` — guía de uso
- `prompts-comunes.md` — prompts reutilizables
- `readme.md` — índice / notas
- `CLAUDE.md` (en docs) — contexto original

## Convenciones

- Español rioplatense (vos, tenés, etc.) en toda la UI.
- Verde Yendo: `#22C55E` / `#15803D`. Cards `rounded-2xl`, sombras suaves.
- Deploy Frontend: push a GitHub → Netlify auto-deploya.

## G Stack (skills disponibles)

Instalado en `~/.claude/skills/gstack/`. Skills invocables con `/gstack-<nombre>`:

| Skill | Qué hace |
|---|---|
| `/gstack-autoplan` | Planifica la tarea antes de ejecutar — analiza, propone, espera OK |
| `/gstack-review` | Code review completo del diff actual |
| `/gstack-qa` | QA completo: prueba la feature antes de mergear |
| `/gstack-qa-only` | Solo QA sin context adicional |
| `/gstack-spec` | Genera una especificación técnica de la tarea |
| `/gstack-ship` | Pipeline completo: spec → plan → impl → review → qa → deploy |
| `/gstack-browse` | Abre un navegador headless y navega URLs |
| `/gstack-scrape` | Extrae datos de una página web |
| `/gstack-investigate` | Investiga un bug o comportamiento raro |
| `/gstack-learn` | Aprende sobre un tema y resume lo relevante |
| `/gstack-design-review` | Revisa UI/UX del diseño actual |
| `/gstack-design-html` | Genera un prototipo HTML de una pantalla |
| `/gstack-design-consultation` | Consulta de diseño interactiva |
| `/gstack-design-shotgun` | Genera múltiples variantes de diseño rápido |
| `/gstack-document-generate` | Genera documentación para el código |
| `/gstack-document-release` | Genera release notes |
| `/gstack-health` | Diagnóstico del estado general del proyecto |
| `/gstack-plan-eng-review` | Revisión de plan de ingeniería |
| `/gstack-plan-design-review` | Revisión de plan de diseño |
| `/gstack-plan-devex-review` | Revisión de developer experience |
| `/gstack-plan-ceo-review` | Revisión de plan a nivel ejecutivo |
| `/gstack-plan-tune` | Afina/mejora un plan existente |
| `/gstack-retro` | Retrospectiva de lo trabajado |
| `/gstack-land-and-deploy` | Mergea y despliega a producción |
| `/gstack-benchmark` | Benchmark de performance |
| `/gstack-benchmark-models` | Compara modelos de IA |
| `/gstack-context-save` | Guarda el contexto actual de la sesión |
| `/gstack-context-restore` | Restaura contexto de una sesión anterior |
| `/gstack-pair-agent` | Lanza un agente par para trabajar en paralelo |
| `/gstack-canary` | Deploy canary con monitoreo |
| `/gstack-freeze` | Congela el estado del proyecto |
| `/gstack-unfreeze` | Descongela el proyecto |
| `/gstack-guard` | Activa guardia de regresiones |
| `/gstack-careful` | Modo cuidadoso — más validaciones antes de actuar |
| `/gstack-skillify` | Convierte una tarea repetida en un skill nuevo |
| `/gstack-upgrade` | Actualiza G Stack a la última versión |
| `/gstack-make-pdf` | Genera un PDF desde contenido |
| `/gstack-landing-report` | Reporte de landing page |
| `/gstack-cso` | Chief of Staff mode — organiza y prioriza |
| `/gstack-office-hours` | Sesión de office hours con el agente |
| `/gstack-devex-review` | Revisión de experiencia del desarrollador |
| `/gstack-setup-deploy` | Configura pipeline de deploy |
| `/gstack-setup-gbrain` | Configura GBrain (memoria persistente del agente) |
| `/gstack-setup-browser-cookies` | Configura cookies del navegador headless |
| `/gstack-sync-gbrain` | Sincroniza GBrain con el estado actual |
| `/gstack-open-gstack-browser` | Abre el browser de gstack en modo visual |

> Instalado el 2026-06-09. Bun 1.3.14 · Git 2.37.0.

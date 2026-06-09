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

## Cuentas de prueba (password: `Yendo2026!`)

- Admin: `laureirojohan@gmail.com` / o cuenta `gerardo`
- Comercio: `comercio@yendo.com`
- Cadete: `cadete@yendo.com`
- Privado: `privado@yendo.com`

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

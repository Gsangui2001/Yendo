# 🟢 Yendo — Proyecto completo

> **Esta es la carpeta maestra. Todo lo de Yendo vive acá: `C:\Proyectos\yendo\`**
> Cualquier otra copia (OneDrive, Downloads, Documents\Codex) es respaldo, no la fuente.

## 📁 Estructura

```
C:\Proyectos\yendo\
├── CLAUDE.md     → contexto que Claude lee cada sesión
├── README.md     → este índice
├── Frontend/     → App React + Vite (login, dashboards por rol, Supabase)
├── Backend/      → API Node.js + Express
├── beta/         → Beta operativa autónoma (HTML/JS, sin backend, localStorage)
├── docs/         → Documentación (Obsidian): estrategia, usuarios, arquitectura...
├── design/       → Todos los mockups catalogados (landing + app + bocetos)
├── sql/          → Scripts SQL de Supabase (schema, RLS, fixes)
└── _archivo/     → Versiones viejas archivadas (no borradas, por las dudas)
```

## 🌐 Sitios en producción

| Sitio | URL | Deploy |
|---|---|---|
| 🏠 Landing | https://yendo-landing.netlify.app | GitHub `Gsangui2001/yendo-landing` |
| 🔐 App completa | https://yendo-app-panel.netlify.app | Netlify (build de `Frontend/`) |
| ⚡ Beta operativa | https://yendo-beta-operativa.netlify.app | Netlify (carpeta `beta/`) |

> ⚠️ La **landing** vive como repo aparte en `C:\Users\59891\Downloads\Yendo-handoff`
> (conectado a GitHub). El código de la landing también está respaldado ahí.

## 🔑 Cuentas de prueba (password: `Yendo2026!`)

| Rol | Email |
|---|---|
| Admin | `laureirojohan@gmail.com` (o tu cuenta `gerardo`) |
| Comercio | `comercio@yendo.com` |
| Cadete | `cadete@yendo.com` |
| Privado | `privado@yendo.com` |

## 🗄️ Base de datos

Supabase proyecto `gzcsvexfnfzwtmlayafb`.
Tablas: `perfiles`, `comercios`, `clientes`, `cadetes`, `direcciones`, `ordenes`, `zonas`.
Scripts en `sql/`. Detalle en `docs/arquitectura-general.md`.

## 📌 Recordatorio anti-desorden

- **Trabajá siempre desde `C:\Proyectos\yendo\`.**
- Hay DOS carpetas "Documents": la **local** (no sincroniza) y la de **OneDrive** (sí).
  Por eso algunas cosas "no aparecían en OneDrive": estaban en la local.
- Para que Obsidian y Claude vean lo mismo: abrí la bóveda en `docs/`.

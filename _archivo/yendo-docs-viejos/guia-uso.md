# 🚀 Cómo Usar Esta Documentación + Claude Code

---

## 📂 Setup Inicial (Hacer una sola vez)

### Paso 1: Copiar a Obsidian

1. Crea una carpeta en Obsidian: `Yendo` 
2. Copia estos archivos aquí:
   - `README.md`
   - `CLAUDE.md`
   - `arquitectura-general.md`
   - `usuarios.md`
   - `prompts-comunes.md`
   - Crea subcarpetas: `Frontend/`, `Backend/`, `Features/`, `Bugs/`

### Paso 2: Integrar con Claude Code

```bash
# En tu carpeta del proyecto Yendo
cd ~/proyectos/yendo

# Crea symlink a la documentación
ln -s ~/Obsidian-Vault/Yendo ./docs
```

Ahora Claude Code puede acceder a toda la doc con:
```
Lee el archivo docs/CLAUDE.md
```

### Paso 3: Prueba

Abre Claude Code:
```bash
claude-code --path ~/proyectos/yendo
```

En el IDE, escribe:
```
Lee docs/CLAUDE.md y resumen que es Yendo
```

Si funciona → ✅ Setup completado

---

## 📋 Flujo Diario de Trabajo

### Mañana: Planificar el día

1. Abre Obsidian
2. Lee: `CLAUDE.md` → sección "Plan de Desarrollo"
3. Decide qué vas a construir hoy
4. Ejemplo: "Hoy: crear componente PedidoExpress"

### Desarrollo: Usar Claude Code

**Paso 1: Ir a prompts-comunes.md**
- Busca el prompt que necesitas
- Cópialo

**Paso 2: Adapta el prompt**
- Añade detalles específicos
- Referencia archivos: "Como en usuarios.md"

**Paso 3: Dale a Claude Code**

Ejemplo:
```
Crea un componente React llamado PedidoExpress para crear pedidos en 5 segundos.

Requisitos:
- Comercio selecciona cliente (dropdown con guardados)
- Selecciona zona (7 opciones)
- Precio automático basado en zona (usar datos de zonas-precios.md)
- Submit → POST /api/ordenes
- Validar todos los campos

Basate en: usuarios.md → Flujo Comercio → Crear Pedido

Estructura similar a otros componentes en frontend/src/components/Comercio/
```

**Paso 4: Claude Code genera código**
- Ajusta si es necesario
- Pega en tu proyecto

### Tarde: Documentar lo hecho

1. Abre `CLAUDE.md`
2. Actualiza sección "🚀 Plan de Desarrollo"
3. Marca lo completado: `[✅]`
4. Si hay cambios técnicos importantes, documenta en sección "🔴 Desafíos"

---

## 🎯 Casos de Uso Comunes

### Caso 1: "Quiero crear la pantalla de Comercio"

**Flujo:**
1. Lee `usuarios.md` → sección "Usuario Comercio"
2. Entiende el flujo completo
3. Abre `prompts-comunes.md` → "Crear componente nuevo"
4. Adapta y dale a Claude Code

**Pregunta a Claude Code:**
```
Basándome en usuarios.md → Flujo Principal (Comercio),
crea los componentes React necesarios para la pantalla de inicio del comercio.

Pantalla debe mostrar:
- Botón para crear nuevo pedido (lleva a formulario)
- Últimos 3 pedidos
- Clientes frecuentes

Usa las tareas de usuarios.md como guía.
```

### Caso 2: "Tengo un bug en geolocalización"

**Flujo:**
1. Abre `arquitectura-general.md` → busca "geolocalización"
2. Revisa el código actual vs lo esperado
3. Lee prompts-comunes → "Debuggea geolocalización"
4. Dale info a Claude Code

**Pregunta:**
```
Hay un bug: las ubicaciones de cadetes no actualizan en tiempo real en el mapa.

Contexto:
- Usando Firebase Realtime DB en /cadetes_ubicacion/
- Hook useEffect en MapaCadetes.jsx

Ver arquitectura-general.md → Firebase Realtime DB

Debuggea:
1. ¿El listener está activo?
2. ¿Los datos se escriben en Firebase?
3. ¿El intervalo es muy largo?

Revisa el código y sugiere solución.
```

### Caso 3: "Necesito un endpoint nuevo"

**Flujo:**
1. Lee `arquitectura-general.md` → "Endpoints Node.js"
2. Entiende el patrón
3. Ve `prompts-comunes.md` → "Crear endpoint"
4. Adapta y pide a Claude Code

**Pregunta:**
```
Crea el endpoint para que un cadete acepte un pedido.

Ruta: PATCH /api/ordenes/:id/aceptar
Body: { cadete_id: "..." }

Debe:
1. Validar que cadete_id existe
2. Cambiar estado de orden a "asignada"
3. Actualizar estado de cadete a "en_viaje"
4. Notificar al comercio (guardar en Firestore)
5. Retornar orden actualizada

Basate en patrón de otros endpoints en backend/src/routes/
Ver arquitectura-general.md → Flujos Clave
```

### Caso 4: "Quiero cambiar un requisito del MVP"

**Flujo:**
1. Documenta el cambio en `CLAUDE.md`
2. Actualiza secciones relevantes (usuarios.md, prompts, etc)
3. Dale contexto nuevo a Claude Code

**Ejemplo:**
```
CAMBIO DE REQUISITO:

Antes: Cadete acepta/rechaza manualmente
Nuevo: Mostrar countdown de 30 segundos, si no responde auto-rechaza

Actualiza:
- usuarios.md → flujo "Recibir pedido"
- CLAUDE.md → decisiones de producto
- prompts-comunes.md → agregar prompt para feature

Crea el componente React que implemente el countdown + auto-rechazo.
```

---

## 🔄 Mantener la Documentación Actualizada

### Checklist Semanal

- [ ] Lunes: Lee CLAUDE.md y planifica la semana
- [ ] Miércoles: Actualiza CLAUDE.md con lo hecho
- [ ] Viernes: Documenta bugs/decisiones nuevas

### Cuando cambias algo importante

**Si cambias un flujo:**
1. Actualiza sección en `usuarios.md`
2. Menciona en `CLAUDE.md`
3. Agrega un prompt nuevo a `prompts-comunes.md` si es relevante

**Si descubres un bug:**
1. Documenta en `CLAUDE.md` → sección "🔴 Desafíos"
2. Crea archivo `Backend/bug-[nombre].md` (opcional)
3. Cuando lo fixes, marca como ✅

**Si agregas una feature nueva:**
1. Documenta en `CLAUDE.md`
2. Crea archivo en `Features/[nombre].md` con detalles
3. Actualiza `README.md` si es importante

---

## 💡 Tips para Máxima Productividad

### Tip 1: Usa referencias específicas
En lugar de:
```
Crea un formulario de login
```

Escribe:
```
Crea un formulario siguiendo el patrón en usuarios.md → Usuario Comercio
Debe tener email + password, validar con Firebase Auth.
```

### Tip 2: Documenta mientras desarrollas
No dejes la doc para el final. Después de cada feature:
1. Código ✅
2. Documentación ✅

### Tip 3: Usa prompts específicos de yendo
No pidas solo "crea un endpoint", usa los prompts en `prompts-comunes.md`

### Tip 4: Mantén CLAUDE.md como fuente de verdad
Antes de pedirle a Claude Code cualquier cosa, asegúrate que el requisito esté en CLAUDE.md

### Tip 5: Crea tus propios prompts
Si creas un patrón nuevo (ej: validación especial), agrega a `prompts-comunes.md`

---

## 🗂️ Estructura de Archivos Sugerida

```
Obsidian-Vault/
└── Yendo/
    ├── README.md (este índice)
    ├── CLAUDE.md (memoria del proyecto)
    ├── arquitectura-general.md
    ├── usuarios.md
    ├── prompts-comunes.md
    │
    ├── Frontend/
    │   ├── componentes-creados.md (log de lo hecho)
    │   ├── estados-bugs.md (bugs encontrados)
    │   └── notas-ui.md (decisiones de diseño)
    │
    ├── Backend/
    │   ├── endpoints-creados.md (log de APIs)
    │   ├── firebase-configuracion.md (setup actual)
    │   └── bugs-resueltos.md (problemas + soluciones)
    │
    ├── Features/
    │   ├── pedido-express.md (detalle profundo)
    │   ├── mapa-tiempo-real.md
    │   └── notificaciones.md
    │
    └── Ideas/
        ├── mejoras-futuras.md (post-MVP)
        └── optimizaciones.md
```

---

## 🆘 Si algo sale mal

### Problema: Claude Code no accede a archivos

```bash
# Verifica que el symlink existe
ls -la ~/proyectos/yendo/docs

# Debería mostrar:
# docs -> ~/Obsidian-Vault/Yendo
```

Si no existe, recrealo:
```bash
cd ~/proyectos/yendo
ln -s ~/ruta/exacta/Obsidian-Vault/Yendo ./docs
```

### Problema: Archivos markdown no son legibles

- Asegúrate que están en `~/Obsidian-Vault/Yendo/`
- Obsidian exporta texto plano sin problema
- Si es muy largo, Claude Code lo trunca (dividir en archivos más pequeños)

### Problema: Necesito referencias que no están

- Crea el archivo faltante
- Referencia en `README.md` para que otros lo encuentren
- Manda a Claude Code: "Crea documentación para [cosa]"

---

## 📞 Próximos Pasos

1. **Hoy:** Copia estos archivos a Obsidian
2. **Mañana:** Crea el symlink a Claude Code
3. **Próximo:** Pide tu primer prompt a Claude Code

**Primer prompt sugerido:**
```
Lee docs/README.md y docs/CLAUDE.md.
Resume el proyecto Yendo en 3 párrafos.
```

Si funciona → ¡Estás listo para empezar! 🚀


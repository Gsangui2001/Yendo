# Los 4 Tipos de Usuario - Yendo Mensajería

---

## 📊 Resumen Rápido

| Usuario       | Acceso    | Rol                   | Prioridad |
| ------------- | --------- | --------------------- | --------- |
| 🏪 Comercio   | Web/movil | Crear pedidos express | 🔴 ALTA   |
| 👤 Particular | Web/Móvil | Solicitar cadete      | 🟡 BAJA   |
| 🚴 Cadete     | Web/Móvil | Aceptar pedidos       | N/A       |
| 📊 Admin      | Web/movil | Supervisar todo       | N/A       |

---

## 👤 Usuario 0.5: CLIENTE PARTICULAR (NUEVO)

**Quién es:** Persona que necesita mandar algo (documento, paquete, mandado) de un lugar a otro. No es un negocio.

**Acceso:** Web + Móvil (misma que comercios, pero rol diferente)

**Estado:** Nueva funcionalidad, reemplaza pedidos manuales por WhatsApp

**IMPORTANTE:** Sus pedidos tienen BAJA PRIORIDAD que comercios

---

### Flujo Principal: Solicitar Cadete

**Pantalla:** Dashboard Cliente Particular

```
┌─────────────────────────────────────┐
│  SOLICITAR CADETE                    │
├─────────────────────────────────────┤
│                                      │
│  ¿QUÉ NECESITAS MANDAR?             │
│  [textarea grande]                   │
│  ej: "Documento a Hospital Central"  │
│                                      │
│  ¿DESDE DÓNDE?                       │
│  [Autocompletado: Mi ubicación]      │
│  [o buscar en mapa]                  │
│                                      │
│  ¿HACIA DÓNDE?                       │
│  [Autocompletado: direcciones ↻]     │
│  [o guardar nueva dirección]         │
│                                      │
│  📍 DISTANCIA ESTIMADA: 2.3 km       │
│  💰 PRECIO ESTIMADO: $3.000          │
│  ⏱️ ETA: ~10 minutos                 │
│                                      │
│  MÉTODO DE PAGO:                     │
│  ☑ Pagar al cadete (efectivo)       │
│  ☐ Pagar a Yendo (tarjeta)          │
│                                      │
│  [SOLICITAR CADETE AHORA]            │
│                                      │
│  Cadetes disponibles ahora: 12       │
│                                      │
└─────────────────────────────────────┘
```

**Validaciones:**
- Descripción: requerida (min 10 caracteres)
- Dirección origen: requerida
- Dirección destino: requerida
- Método de pago: seleccionado

**Después de solicitar:**
- ✅ Toast: "Pedido creado, buscando cadete..."
- Estado → "pendiente"
- Redirige a pantalla "Tracking en tiempo real"

---

### Flujo Secundario: Tracking en Tiempo Real

**Pantalla después de crear pedido:**

```
┌─────────────────────────────────────┐
│  TU CADETE ESTÁ EN CAMINO             │
├─────────────────────────────────────┤
│                                      │
│  Mapa Google Maps (80% pantalla)     │
│  [Tu ubicación] ► [Destino]          │
│  🚴 Juan García (tu cadete)          │
│                                      │
│  ETA: 7 minutos                      │
│  Distancia: 2.1 km                   │
│                                      │
│  CADETE: Juan García                 │
│  ⭐⭐⭐⭐⭐ 4.8/5 (234 viajes)        │
│  📞 +54 9 11 2345-6789               │
│  [LLAMAR]  [MENSAJEAR]               │
│                                      │
│  Estado: 🟢 En camino                │
│  Notificación: Cuando llegue         │
│                                      │
└─────────────────────────────────────┘
```

**Elementos:**
- Mapa con ruta actualizada cada 2 segundos
- Rating del cadete (para generar confianza)
- Botones para contacto directo
- Auto-actualizas ETA basado en posición real

**Cuando cadete llega:**
- Notificación: "🔔 Tu cadete llegó a destino"
- Pop-up: "¿Entrega completada?"
- Particular confirma
- Orden → "completada"

---

### Flujo Terciario: Historial y Direcciones

**Pestaña: "Mis pedidos"**

```
Fecha      | Descripción        | Desde        | Hasta          | Pago     | Estado
-----------|-------------------|--------------|----------------|----------|----------
03/06 14:30 | Documento urgente  | Mi casa      | Hospital       | Efectivo | Completo
03/06 13:45 | Paquete           | Farmacia XYZ | Dirección X    | Tarjeta  | Completo
02/06 16:20 | Sobre importante  | Casa        | Juzgado        | Efectivo | Completo
```

**Pestaña: "Mis direcciones"**

```
Casa (Mi ubicación actual)
[Editar]  [Eliminar]

Hospital Central
[Editar]  [Eliminar]

Juzgado
[Editar]  [Eliminar]

[+ Agregar dirección]
```

---

### Autenticación: Google + Teléfono

**Primer login:**
- Click "Iniciar sesión"
- Opción 1: Google Sign-In (rápido)
- Opción 2: Teléfono (ingresar número, verificar SMS)

**Después:**
- Sistema guarda teléfono + ubicaciones
- Próximo login es 1-click (GoogleAuth o SMS)
- o ya estar registrado 

---

### Sistema de Pago para Particulares

**Opción 1: Pagar al cadete (efectivo)**
- Particular no ingresa datos
- Paga en efectivo cuando cadete llega
- Yendo cobra comisión al cadete (~10-15%)

**Opción 2: Pagar a Yendo (tarjeta)**
- Particular ingresa tarjeta en app (Stripe/MercadoPago)
- Transacción antes de que cadete salga
- Cadete sabe que está "pago"
- Yendo cobra 100%

---

### Consideraciones de Cliente Particular

**Acceso limitado:**
- ❌ No ve "historial de cadetes" (solo el suyo actual)
- ❌ No ve "clientes frecuentes" (no es un negocio)
- ❌ No ve mapa completo de cadetes (solo el suyo)
- ✅ VE su pedido en tiempo real
- ✅ VE rating del cadete
- ✅ PUEDE contactar cadete directamente

**Diferencia vs Comercio:**
| Aspecto | Comercio | Particular |
|---------|----------|-----------|
| Crea pedidos | | Formulario normal |
| Ve mapa de cadetes | ✅ Sí | ❌ No |
| Prioridad | 🔴 ALTA | 🟡 BAJA |
| Historial | Detallado + PDF | Básico |
| Clientes guardados | ✅ Sí | ❌ No |



**Quién es:** Dueño o encargado de un negocio que necesita mandar cosas rápido.

**Acceso:** Web/app (desktop + responsive móvil)

**Activos:** 30 comercios adheridos hoy

---

### Flujo Principal: Crear Pedido (5 segundos)

**Pantalla:** Dashboard comercio

**Pasos:**
1. Abre Yendo (web/app)
2. Ingresa con email + password
3. Ve su nombre: "Pharmacy XYZ"
4. Click en card grande "Crear nuevo pedido"

**Formulario Pedido Express:**

```
┌─────────────────────────────────┐
│  NUEVO PEDIDO           │
├─────────────────────────────────┤
│                                  │
│  Cliente: [dropdown + buscar]    │  ← Predefinidos o nuevo y tambien que pueda                                             guardar clientes frecuentes
│  ☑ Hospital Central             │
│  ☐ Clínica Sur                  │
│  [o escribe nombre nuevo]        │
│                                  │
│  Dirección: [autocomplete]       │  ← Auto del cliente guardado
│                                  │
│  Zona: [dropdown]               │  ← 7 opciones fijas
│  ✓ Ciudad de Colón              │
│                                  │
│  📍 Precio automático:           │  ← Basado en zona
│     $3.000                       │
│                                  │
│  Cadetes disponibles ahora: 8    │  ← En esa zona y tambien los que estan activos
│  🟢 Disponibles (ver en mapa)    │
│                                  │
│  [ENVIAR PEDIDO]  [LIMPIAR]      │
└─────────────────────────────────┘
```

**Validaciones:**
- Cliente: requerido
- Dirección: requerido
- Zona: requerido (por defecto la última usada)

**Después de enviar:**
- ✅ Toast: "Pedido enviado a 8 cadetes"
- Notificación sonora a cadetes disponibles
- Redirecciona a detalles del pedido (estado "pendiente")

**Tiempo total:** <5 minutos ⚡

---

### Flujo Secundario: Ver Mapa de Cadetes

**Botón:** En el dashboard principal

**Mapa:** Google Maps
- Cadetes con pin verde (disponibles en esa zona)
- Click en pin → nombre, teléfono, viajes completados
- No puedo interactuar con el cadete, solo ver

**Uso:** "¿Hay cadetes disponibles ahora?" → sí/no

---

### Flujo Terciario: Historial de Pedidos

**Pestaña:** "Mis pedidos" en dashboard

**Tabla:**
```
Fecha      | Cliente           | Zona           | Cadete    | Estado
-----------|-------------------|----------------|-----------|----------
03/06 14:30 | Hospital Central  | Ciudad Colón   | Juan García | Completada
03/06 13:45 | Clínica Sur       | Barrio Ombú   | María López | Completada
02/06 16:20 | Farmacia Luna    | San José       | Carlos M.  | Completada
```

**Acciones:**
- Click en fila → detalles completos + notas
- Click "Repetir pedido" → llena el form con los mismos datos
- Filtrar por fecha/estado
- Descargar "Resumen del mes" en PDF

**PDF incluye:**
- Listado de todos los pedidos
- Total pagado vs crédito disponible
- Promedio de entregas por día

---

### Estado: Activo o Inactivo

**Requisitos para ser "Activo":**
- Creó un pedido en los últimos 30 días
- O lo acaba de aceptar como adherido 

**Si está Inactivo:**
- Admin ve lista de "Comercios inactivos" y puede contactar
-

---

## 🚴 Usuario 2: CADETE

**Quién es:** Persona que transporta paquetes. Trabaja por viaje (comisión).

**Acceso:** Web + Móvil (responsive)

**Roles:** Aceptar/rechazar manualmente, no algoritmo automático, los pedidos van por orden

---

### Flujo Principal: Recibir y Aceptar Pedido

**Estado inicial:** Cadete en la app, estado "disponible"

**Notificación de nuevo pedido:**
```
┌─────────────────────────────────────┐
│                                      │
│         🔔 NUEVO PEDIDO! 🔔          │
│                                      │
│     PHARMACY XYZ                     │
│     Dirección: Calle 123, #456       │
│                                      │
│     Zona: Ciudad de Colón            │
│     💰 GANAS: $3.000                 │
│                                      │
│   [✅ ACEPTAR]       [❌ RECHAZAR]    │
│                                      │
│     Auto-desaparece en 30 seg        │
└─────────────────────────────────────┘
```

**Elementos:**
- Sonido automático (volumen alto)
- Pantalla completa
- Botones enormes
- Información clara: qué, dónde, cuánto gano

**Aceptar:**
1. Estado → "en_viaje"
2. Notificación al comercio: "Tu cadete está en camino"
3. Mapa con ruta al cliente
4. Botón "Llegué" al llegar

**Rechazar:**
1. Estado → sigue "disponible"
2. Pedido se envía al siguiente cadete disponible

---

### Flujo Secundario: Mapa y Navegación

**Después de aceptar:**
```
┌─────────────────────────────────────┐
│                                      │
│    Mapa Google Maps                  │
│  [Tu ubicación] ► [Cliente]          │
│                                      │
│  Distancia: 2.3 km                   │
│  ETA: 7 minutos                      │
│  Ruta: Google Maps                   │
│                                      │
│  [LLEGUÉ - COMPLETAR VIAJE]          │
│                                      │
│  Mi ubicación se actualiza c/5 seg   │
│  (comercio y admin ven dónde voy)    │
│                                      │
└─────────────────────────────────────┘
```

**Al hacer click "Llegué":**
- Estado → "completada"
- cadete recibe notificación de entrega
- Ganancias se suman a "Ganancias del día"

---

### Flujo Terciario: Dashboard Cadete

**Pantalla principal:**
```
┌─────────────────────────────────────┐
│  HOLA JUAN GARCÍA                    │
│                                      │
│  Estado: 🟢 DISPONIBLE               │
│  Tu zona: Ciudad de Colón            │
│  Cadetes cercanos: 3 (competencia)   │
│                                      │
│  📊 GANANCIAS HOY                    │
│     $45.000                          │
│                                      │
│  📊 GANANCIAS MES                    │
│     $1.200.000                       │
│                                      │
│  📈 RANKING                          │
│     Posición: #3 de 47 cadetes       │
│     Viajes completados: 234          │
│     Rating: ⭐⭐⭐⭐⭐ 4.8/5           │
│                                      │
│  [VER MIS VIAJES DE HOY]             │
│                                      │
│  [CAMBIAR ESTADO A OFFLINE]          │
│                                      │
└─────────────────────────────────────┘
```

**Información:**
- Dinero en tiempo real (actualiza al completar viaje) dia/semana/mes
- Ranking propio respecto a los demas
- ver de que comercio o cliente lo solicitan
- Historial de pedidos realizados y cancelados día/semana/mes

---

### Consideraciones de Cadete

**No puede:**
- Ver detalles del comercio (solo el cliente y dirección)
- Rechazar muchos pedidos seguidos (sin penalización, pero se nota)
- Cambiar de zona fijo (puede trabajar en cualquier zona pero "su zona" es la principal)

**Debe:**
- Mantener "disponible" mientras está trabajando
- Actualizar ubicación cada 5 segundos
- Completar viaje antes de aceptar otro

---

## 📊 Usuario 3: ADMIN (Vos)

**Quién eres:** Dueño/operador de Yendo. Necesitas ver TODO en tiempo real.

**Acceso:**  web/app (solo para administradores)

**Responsabilidades:**
- Monitorear la salud de la plataforma
- Manejar problemas (pedidos sin asignar >5 min)
- Ver estadísticas y KPIs
- Contactar comercios inactivos
- controlar cada pedido y ver cadetes activos

---

### Dashboard Admin - Vista Principal

```
┌──────────────────────────────────────────────────────┐
│  YENDO ADMIN                              [Logout]    │
├──────────────────────────────────────────────────────┤
│                                                       │
│  MAPA GENERAL (60% pantalla)                          │
│  ┌──────────────────────────────────────────────┐   │
│  │                                              │   │
│  │  🟢 Juan García (disponible)                │   │
│  │  🟡 María López (en viaje)                  │   │
│  │  ⚫ Carlos M. (offline)                      │   │
│  │  ...47 cadetes más                          │   │
│  │                                              │   │
│  │  Leyenda:                                    │   │
│  │  🟢 Disponible  🟡 En viaje  ⚫ Offline      │   │
│  └──────────────────────────────────────────────┘   │
│                                                       │
│  PANEL LATERAL (40% pantalla)                        │
│  ┌──────────────────────────────────────────────┐   │
│  │  ⚠️ ALERTAS                                  │   │
│  │  • Orden #1234: sin cadete 6 minutos        │   │ ← Rojo
│  │  • Orden #5678: sin cadete 3 minutos        │   │ ← Naranja
│  │                                              │   │
│  │  📋 PEDIDOS PENDIENTES                       │   │
│  │  Pharmacy XYZ → Hospital | $3K | Zona: Col  │   │
│  │  Clínica Sur → Farmacia | $3.5K | Zona: Omb│   │
│  │  ...5 más                                    │   │
│  │                                              │   │
│  │  📈 HORAS PICO (últimas 24h)                 │   │
│  │  14h: 12 pedidos                             │   │
│  │  15h: 18 pedidos ← PICO                      │   │
│  │  16h: 14 pedidos                             │   │
│  │  17h: 8 pedidos                              │   │
│  └──────────────────────────────────────────────┘   │
│                                                       │
│  [📊 VER REPORTES]  [👥 COMERCIOS]  [💰 FACTURACIÓN]│
└──────────────────────────────────────────────────────┘
```

---

### Tab 2: Reportes y Estadísticas

```
REPORTES
┌────────────────────────────────────────┐
│ RANKING DE CADETES (este mes)           │
│ Pos | Nombre      | Viajes | Ganancias │
│ 1   | Pedro López | 189    | $1.5M     │
│ 2   | Ana García  | 176    | $1.4M     │
│ 3   | Juan García | 172    | $1.37M    │
│ ... |             |        |           │
│                                         │
│ RANKING DE COMERCIOS (hoy)              │
│ Pos | Nombre      | Pedidos | Total     │
│ 1   | Pharmacy XYZ | 24      | $72K      │
│ 2   | Clínica Sur | 18      | $63K      │
│ 3   | Farmacia A  | 15      | $52.5K    │
│ ... |             |         |           │
│                                         │
│ INACTIVOS ÚLTIMOS 30 DÍAS               │
│ • Farmacia Luna (último pedido: 25/5)   │
│ • Droguería Centro (último: 20/5)       │
│ • Clínica Privada (último: 10/5)        │
│ • [Contactar] [Eliminar]                │
└────────────────────────────────────────┘
```

---

### Tab 3: Gestión de Comercios

```
COMERCIOS ADHERIDOS
┌───────────────────────────────────────────────┐
│ Filtrar: [Todos ▼] [Activos ▼] [Zona ▼]     │
│                                               │
│ Farmacia XYZ          ✅ Activo               │
│ 30 pedidos | Último: hoy 14:30               │
│ [Ver detalles] [Ver historial] [Contactar]   │
│                                               │
│ Clínica Sur           ✅ Activo               │
│ 18 pedidos | Último: hoy 11:15               │
│ [Ver detalles] [Ver historial] [Contactar]   │
│                                               │
│ Farmacia Luna         ❌ Inactivo (34 días)  │
│ 42 pedidos | Último: 25 de mayo              │
│ [Ver detalles] [Reactivar] [Eliminar]        │
│                                               │
│ ...27 más                                     │
└───────────────────────────────────────────────┘
```

---

### Tab 4: Facturación

```
FACTURACIÓN
┌─────────────────────────────────────────┐
│ Mes actual: JUNIO 2026                  │
│                                          │
│ Total viajes: 1.247                     │
│ Ingresos estimados:                     │
│ • Por viajes: $3.741.000 (varía/viaje) │
│ • Suscripción: $4000     │
│ TOTAL ESTIMADO: $3.741.000              │
│                                          │
│ Desglose por comercio:                  │
│ Pharmacy XYZ | 24 viajes | $72.000      │
│ Clínica Sur  | 18 viajes | $63.000      │
│ Farmacia A   | 15 viajes | $52.500      │
│ ...                                      │
│                                          │
│ [DESCARGAR REPORTE PDF]                 │
│ [ENVIAR FACTURA A COMERCIOS]            │
└─────────────────────────────────────────┘
```

---

### Flujo de Manejo de Problemas

**Problema:** Orden sin asignar > 5 minutos

**Acción automática:**
1. Alerta roja en dashboard
2. Aparece en tab "Alertas"
3. Admin puede hacer click y ver:
   - Detalles del pedido
   - Cadetes disponibles en esa zona
   - Opción "Asignar manual a [Cadete]"

**Problema:** Comercio inactivo 30+ días

**Acción:**
1. Aparece en tab "Comercios"
2. Admin decide: contactar (enviar email/whatsapp) o eliminar

---

### Permisos de Admin

- ✅ Ver TODO en tiempo real
- ✅ Asignar pedidos manualmente
- ✅ Ver datos de comercios + cadetes
- ✅ Descargar reportes
- ✅ Contactar comercios/cadetes
- registrar comercios y cadetes manualmente tambien
- ❌ Editar precios (predefinidos, no en MVP)
- ❌ Eliminar órdenes (solo marcar como "cancelada")

---

## 🔐 Seguridad de Acceso

| Datos             | Comercio | Cadete | Admin |
|-------------------|----------|--------|-------|
| Sus propios datos | ✅ R/W   | ✅ R/W | ✅ R  |
| Sus órdenes       | ✅ R/W   | ✅ R   | ✅ R  |
| Otros comercios   | ❌       | ❌     | ✅ R  |
| Otros cadetes     | ✅ R*    | ❌     | ✅ R  |
| Todo el mapa      | ❌       | ❌     | ✅ R  |

*Comercio solo ve cadetes disponibles en su zona y tambien cuantos cadetes hay activo en el dia

---

## 📱 Responsive Design

### Comercio en Móvil
- Formulario pedido en full-screen
- Botones grandes para clicks rápidos
- Historial en scroll vertical

### Cadete en Móvil
- Notificación: full-screen forzado
- Mapa: 100% pantalla con botones flotantes
- Dashboard: scroll vertical

### Admin en Móvil
- NO optimizado para móvil (solo web)
- Pero debería ser usable en tablet


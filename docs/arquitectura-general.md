# Arquitectura General - Yendo Mensajería

---

## 🏛️ Vista High-Level

```
┌─────────────────────────────────────────────────────────────┐
│                    USUARIOS (4 tipos)                       │
├─────────────────────────────────────────────────────────────┤
│ 🏪 Comercio (Web/movil) │ 👤 Particular (Web/Móvil) │ 🚴 Cadete (movil)  │ 📊 Admin   │
│                   │     (NUEVO)                │            │            │
└────────────┬──────────────────────────────────┬────────────┬────────────┘
             │                                  │            │
             └──────────────┬───────────────────┘            │
                            │ (HTTPS)                        │
             ┌──────────────▼─────────────┐                  │
             │   Firebase + Google Maps   │                  │
             │  - Firestore (datos)       │                  │
             │  - Realtime DB (ubicación) │◄─────────────────┘
             │  - Auth (usuarios)         │
             │  - Maps API (mapa)         │
             └────────────┬─────────────┘
                          │
             ┌────────────▼─────────────┐
             │   Node.js Backend         │
             │  (Express API)            │
             │  - Lógica de negocio      │
             │  - Matching: Comercio > Particular (PRIORIDAD)
             │  - Webhooks Firebase      │
             │  - Facturación            │
             │  - Pago dual (efectivo/tarjeta)
             └─────────────────────────┘
```

---

## 📦 Estructura de Carpetas

```
yendo/
├── frontend/                    # React
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Comercio/
│   │   │   │   ├── Pedido.jsx (⭐ CORE)
│   │   │   │   ├── ClientesSavedos.jsx
│   │   │   │   ├── MapaCadetes.jsx
│   │   │   │   └── Historial.jsx
│   │   │   ├── Particular/
│   │   │   │   ├── SolicitarCadete.jsx (⭐ NUEVO)
│   │   │   │   ├── Tracking.jsx
│   │   │   │   ├── DireccionesGuardadas.jsx
│   │   │   │   └── HistorialParticular.jsx
│   │   │   ├── Cadete/
│   │   │   │   ├── NotificacionesPedidos.jsx
│   │   │   │   ├── MapaUbicacion.jsx
│   │   │   │   └── Dashboard.jsx
│   │   │   └── Admin/
│   │   │       ├── MapaGeneral.jsx
│   │   │       ├── Reportes.jsx
│   │   │       └── Alertas.jsx
│   │   ├── pages/
│   │   │   ├── ComercioPage.jsx
│   │   │   ├── ParticularPage.jsx (NUEVO)
│   │   │   ├── CadetePage.jsx
│   │   │   └── AdminPage.jsx
│   │   ├── hooks/
│   │   │   ├── useFirebase.js
│   │   │   ├── useGeolocation.js
│   │   │   ├── useOrders.js
│   │   │   └── useAuth.js (NUEVO - Google + Teléfono)
│   │   ├── services/
│   │   │   ├── firebaseConfig.js
│   │   │   ├── paymentService.js (NUEVO - efectivo/tarjeta)
│   │   │   └── authService.js (NUEVO)
│   │   └── App.jsx
│   └── package.json
│
├── backend/                     # Node.js
│   ├── src/
│   │   ├── routes/
│   │   │   ├── ordenes.js
│   │   │   ├── particulares.js (NUEVO)
│   │   │   ├── cadetes.js
│   │   │   ├── comercios.js
│   │   │   └── admin.js
│   │   ├── controllers/
│   │   │   ├── ordenController.js (actualizado - matching con prioridad)
│   │   │   ├── particularController.js (NUEVO)
│   │   │   ├── cadetController.js
│   │   │   └── comercioController.js
│   │   ├── services/
│   │   │   ├── firebaseService.js
│   │   │   ├── mapsService.js
│   │   │   ├── notificacionService.js
│   │   │   ├── matchingService.js (NUEVO - prioridad)
│   │   │   ├── paymentService.js (NUEVO)
│   │   │   └── facturacionService.js
│   │   ├── middleware/
│   │   │   ├── auth.js (actualizado)
│   │   │   └── validacion.js
│   │   └── app.js
│   └── package.json
│
├── firebase/
│   ├── firestore-schema.md      # Estructura de colecciones (actualizado)
│   ├── realtime-db-schema.md    # Estructura de datos tiempo real
│   └── security-rules.json      # Reglas de seguridad (actualizado)
│
└── docs/                        # Documentación (Obsidian)
    ├── README.md
    ├── CLAUDE.md
    ├── arquitectura-general.md
    ├── usuarios.md
    ├── prompts-comunes.md
    └── ...
```

---

## 🗄️ Firebase Schema (Firestore)

### Colecciones Principales

#### `comercios`
```json
{
  "id": "com_12345",
  "nombre": "Pharmacy XYZ",
  "email": "owner@pharmacy.com",
  "telefono": "+54 11 2xxx",
  "direccion": "Calle 123",
  "zona_default": "Ciudad de Colón",
  "clientes_guardados": ["cli_1", "cli_2"],
  "activo": true,
  "fecha_creacion": "2024-01-15",
  "pedidos_totales": 145,
  "gasto_mensual": 435000
}
```

#### `cadetes`
```json
{
  "id": "cad_12345",
  "nombre": "Juan García",
  "telefono": "+54 11 2xxx",
  "estado": "disponible", // disponible, en_viaje, offline
  "zona_habitual": "Ciudad de Colón",
  "ubicacion": {
    "lat": -32.3197,
    "lng": -58.1234,
    "timestamp": 1717410000
  },
  "viajes_totales": 234,
  "ganancias_hoy": 45000,
  "ganancias_mes": 1200000,
  "ranking": 3
}
```

#### `ordenes`
```json
{
  "id": "ord_12345",
  "comercio_id": "com_12345",
  "cadete_id": "cad_12345",
  "cliente": {
    "nombre": "Carlos López",
    "telefono": "+54 9 11 2xxx",
    "direccion": "Av. Principal 500"
  },
  "zona": "Ciudad de Colón",
  "precio": 3000,
  "estado": "completada", // pendiente, asignada, en_transito, completada
  "fecha_creacion": "2024-06-03T14:30:00Z",
  "fecha_asignacion": "2024-06-03T14:31:00Z",
  "fecha_completada": "2024-06-03T14:45:00Z",
  "notas": "Entregar al guardia"
}
```

#### `particulares`
```json
{
  "id": "par_12345",
  "nombre": "Carlos López",
  "telefono": "+54 9 11 2345678",
  "email": "carlos@email.com",
  "auth_method": "google", // o "telefono"
  "direcciones_guardadas": [
    {
      "nombre": "Casa",
      "direccion": "Calle 123 #456",
      "lat": -32.3197,
      "lng": -58.1234
    }
  ],
  "pedidos_totales": 12,
  "gasto_total": 36000,
  "fecha_creacion": "2024-05-15",
  "ultimo_pedido": "2024-06-02T10:15:00Z"
}
```

#### `ordenes` (actualizado - puede ser de comercio O particular)
```json
{
  "id": "ord_12345",
  "tipo_origen": "comercio", // o "particular"
  "comercio_id": "com_12345", // null si es particular
  "particular_id": "par_12345", // null si es comercio
  "cadete_id": "cad_12345",
  "prioridad": "alta", // "alta" si comercio, "baja" si particular
  "cliente": {
    "nombre": "Hospital Central",
    "telefono": "+54 11 2xxx",
    "direccion": "Av. Principal 500"
  },
  "descripcion": "Documento urgente", // para particulares
  "origen": {
    "lat": -32.3197,
    "lng": -58.1234,
    "direccion": "Casa de Carlos"
  },
  "destino": {
    "lat": -32.3210,
    "lng": -58.1245,
    "direccion": "Hospital Central"
  },
  "zona": "Ciudad de Colón", // null si particular (usa distancia)
  "precio": 3000,
  "metodo_pago": "efectivo", // o "tarjeta"
  "pagado": false, // true si ya se pagó a Yendo
  "estado": "completada",
  "fecha_creacion": "2024-06-03T14:30:00Z",
  "fecha_asignacion": "2024-06-03T14:31:00Z",
  "fecha_completada": "2024-06-03T14:45:00Z"
}
```
```json
{
  "id": "cli_12345",
  "comercio_id": "com_12345",
  "nombre": "Hospital Central",
  "telefono": "+54 11 2xxx",
  "direccion": "Calle Hospital 100",
  "zona": "Barrio Ombú",
  "veces_usado": 42,
  "ultimo_uso": "2024-06-02T10:15:00Z"
}
```

---

## 🌍 Firebase Realtime DB (Ubicaciones en Tiempo Real)

```
cadetes_ubicacion/
├── cad_12345: {
│   "lat": -32.3197,
│   "lng": -58.1234,
│   "timestamp": 1717410000
│ }
└── cad_67890: {
    "lat": -32.3210,
    "lng": -58.1245,
    "timestamp": 1717410000
  }

ordenes_activas/
├── ord_12345: {
│   "estado": "en_transito",
│   "cadete_id": "cad_12345",
│   "comercio_id": "com_12345"
│ }
└── ...
```

---

## 🔌 Endpoints Node.js (Backend)

### Órdenes
- `POST /api/ordenes` - Crear orden (comercio)
- `GET /api/ordenes/:id` - Obtener orden
- `PATCH /api/ordenes/:id/estado` - Cambiar estado
- `GET /api/ordenes/comercio/:comercioId` - Historial comercio

### Cadetes
- `GET /api/cadetes/disponibles` - Cadetes libres por zona
- `PATCH /api/cadetes/:id/ubicacion` - Actualizar ubicación
- `PATCH /api/cadetes/:id/estado` - Cambiar estado
- `GET /api/cadetes/:id/ganancias` - Ganancias del día/mes

### Comercios
- `POST /api/comercios` - Registrar comercio
- `GET /api/comercios/:id` - Datos comercio
- `POST /api/comercios/:id/clientes` - Guardar cliente
- `GET /api/comercios/:id/resumen-mes` - Facturación

### Admin
- `GET /api/admin/mapa-general` - Todos los cadetes
- `GET /api/admin/pedidos-pendientes` - Sin asignar
- `GET /api/admin/estadisticas` - Gráficos, ranking
- `GET /api/admin/reporte-mes` - PDF resumen

---

## 🔐 Autenticación (Firebase Auth)

**Flujo:**
1. Comercio/Cadete/Admin se registra/logea con email + contraseña
2. Firebase crea `uid` único
3. En Firestore, documento `comercios/uid` vinculado a `uid`
4. JWT token para sesión

**Roles:**
- Comercio: puede crear órdenes
- Cadete: puede aceptar/rechazar
- Admin: acceso total (verificado en backend)

---

## 🗺️ Google Maps API

**Features necesarios:**
- `Maps JavaScript API` - Mostrar mapa en frontend
- `Distance Matrix API` - Calcular distancias (para mostrar ETA)
- `Geocoding API` - Convertir direcciones en coordenadas

**Uso:**
- Comercio ve cadetes disponibles en mapa
- Cadete ve su ubicación + ruta a cliente
- Admin ve todos los cadetes

---

## ⚡ Flujos Clave

### 1. Crear orden (Comercio) - 5 segundos
1. Comercio abre app
2. Selecciona cliente guardado (1 click) O escribe nuevo
3. Selecciona zona (dropdown)
4. Precio aparece automático
5. Click "Enviar pedido"
6. → Notificación a cadetes disponibles en esa zona

**Cadete:**
1. Recibe notificación (sonido + popup)
2. Ve detalles: cliente, dirección, precio
3. Click "Aceptar" o "Rechazar"
4. Si acepta → mapa con ruta
5. Completa → "Viaje completado"

### 2. Dashboard Admin (Tiempo real)
1. Mapa con pins de todos los cadetes
2. Tabla de pedidos pendientes
3. Alertas rojas si hay pedidos sin cadete >5 min
4. Gráfico de horas pico

---

## 📊 Consideraciones de Escalabilidad

| Aspecto | Solución |
|---------|----------|
| **Ubicaciones en tiempo real** | Realtime DB (optimizado para datos pequeños, alta frecuencia) |
| **Historial de órdenes** | Firestore (escalable, query flexible) |
| **Mapas con 100+ cadetes** | Clustering en Google Maps |
| **Notificaciones** | Firebase Cloud Messaging (FCM) |
| **Backup** | Firebase Backup + Cloud Storage |

---

## 🚀 Próxima Iteración (Etapa 2+)

- WhatsApp Business API para crear órdenes
- Predicción inteligente: "El cadete X estará disponible en 2 minutos"
- App nativa React Native para cadetes
- Integración con sistemas de pago


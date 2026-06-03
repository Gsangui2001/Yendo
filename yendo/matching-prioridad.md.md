# Sistema de Matching - Prioridad Comercio vs Particular

---

## 🎯 Regla de Oro

**COMERCIOS SIEMPRE PRIMERO**

Cuando hay un cadete disponible:
1. Primero: se ofrece a pedidos de comercios sin asignar
2. Si no hay: se ofrece a pedidos de particulares sin asignar

**Nunca** un particular "roba" un cadete de un comercio.

---

## 📊 Lógica de Matching

### Paso 1: Nuevo pedido entra

```javascript
{
  id: "ord_12345",
  tipo_origen: "comercio", // o "particular"
  prioridad: "alta",       // "alta" si comercio, "baja" si particular
  zona: "Ciudad de Colón",
  estado: "pendiente"
}
```

### Paso 2: Backend llama matchingService.js

```javascript
// En backend/src/services/matchingService.js

function buscarCadetePara(orden) {
  if (orden.prioridad === "alta") { // Comercio
    // OPCIÓN 1: Buscar cadete en su zona específica
    let cadetes = firebase.query(
      "cadetes",
      estado == "disponible" AND zona == orden.zona
    );
    
    if (cadetes.length > 0) {
      return cadetes[0]; // Primer disponible
    }
  }
  
  if (orden.prioridad === "baja") { // Particular
    // OPCIÓN 2: Buscar cadete más cercano (por distancia)
    let cadetes = firebase.query(
      "cadetes",
      estado == "disponible"
    );
    
    let cadeteMasCercano = findClosest(
      cadetes,
      orden.origen.lat,
      orden.origen.lng
    );
    
    return cadeteMasCercano;
  }
}
```

### Paso 3: Enviar notificación

```javascript
// Notificación al cadete
firebase.cloudMessaging.send({
  token: cadete.fcmToken,
  data: {
    orden_id: orden.id,
    tipo: orden.tipo_origen, // "comercio" o "particular"
    cliente: orden.cliente.nombre,
    direccion: orden.cliente.direccion,
    precio: orden.precio,
    prioridad: orden.prioridad
  }
});

// Actualizar estado
firebase.update(`ordenes/${orden.id}`, {
  estado: "notificado",
  timestamp_notificacion: Date.now()
});
```

### Paso 4: Cadete acepta o rechaza

**Si acepta:**
```javascript
PATCH /api/ordenes/:id/aceptar
{
  cadete_id: "cad_123",
  estado: "asignada"
}
```

**Si rechaza:**
- Orden → "rechazada_por_cadete"
- Backend busca OTRO cadete disponible
- Repite paso 2-4

**Si cadete no responde en 30 seg:**
- Timeout automático
- Intenta con siguiente cadete

---

## ⚡ Optimizaciones

### Para Comercios (Alta Prioridad)

**Regla:** Primero por zona exacta, luego por cercania

```javascript
function matchComercio(orden) {
  // Tier 1: Cadete en la misma zona
  let enZona = cadetes.filter(c => 
    c.estado === "disponible" && 
    c.zona === orden.zona
  );
  
  if (enZona.length > 0) {
    // Seleccionar el que tiene menos viajes en progreso
    return enZona.sort((a, b) => 
      a.viajesEnProgreso - b.viajesEnProgreso
    )[0];
  }
  
  // Tier 2: Cadete más cercano (en radio de 5km)
  let cercano = findWithinRadius(cadetes, 5000);
  if (cercano.length > 0) {
    return cercano[0];
  }
  
  // Tier 3: Cualquier disponible (aunque sea lejos)
  return cadetes[0];
}
```

### Para Particulares (Baja Prioridad)

**Regla:** Cadete más cercano a la ubicación del particular

```javascript
function matchParticular(orden) {
  // Solo: cadete más cercano
  return findClosest(
    cadetes.filter(c => c.estado === "disponible"),
    orden.origen.lat,
    orden.origen.lng
  );
}
```

---

## 🚨 Casos Especiales

### Caso 1: Cadete disponible, 3 pedidos esperando

**Escenario:**
- Comercio A: pedido en "pendiente" hace 5 min
- Comercio B: pedido en "pendiente" hace 2 min
- Particular X: pedido en "pendiente" hace 1 min
- Cadete disponible

**Acción:**
- Ofrecer al comercio A primero (más antiguo)
- Si rechaza → Comercio B
- Si rechaza → Particular X

---

### Caso 2: Particular rechaza 5 veces seguidas

**Por qué pasa:** Particular está haciendo pedidos de prueba, o el precio/distancia no le conviene.

**Solución:**
- Después de 5 rechazos: marcar cuenta como "anormal"
- Notificación al admin
- Continuar tomando pedidos pero con warning

---

### Caso 3: Comercio tiene 10 pedidos esperando

**Escenario:** Comercio popular, 10 cadetes disponibles

**Acción:**
- Notificar a los 10 cadetes simultáneamente
- Primer cadete que acepte → asignación
- Otros reciben "orden ya asignada" y vuelven a "disponible"

---

## 📊 Métricas a Monitorear

**Para Comercios:**
- Tiempo promedio desde pedido creado hasta asignado
- % de pedidos asignados en <5 min
- Tasa de rechazo por cadete

**Para Particulares:**
- Tiempo promedio de espera
- Tasa de abandono (crear pedido y no esperar respuesta)
- Rating promedio de cadetes asignados

**Para Cadetes:**
- Viajes asignados de comercios vs particulares
- Ingresos por tipo (comercio vs particular)
- Aceptación/rechazo

---

## 💻 Endpoints Relevantes

### Crear pedido (Comercio)
```
POST /api/ordenes
{
  comercio_id: "com_123",
  tipo_origen: "comercio",
  cliente: {...},
  zona: "Ciudad de Colón",
  precio: 3000
}
→ Backend llama matchingService
→ Envía notificación a cadete
→ Retorna orden + estado "pendiente"
```

### Crear pedido (Particular)
```
POST /api/particulares/solicitar-cadete
{
  particular_id: "par_123",
  tipo_origen: "particular",
  descripcion: "Documento urgente",
  origen: {lat, lng},
  destino: {lat, lng},
  metodo_pago: "efectivo"
}
→ Backend calcula distancia/precio
→ Llama matchingService (busca cercano)
→ Envía notificación a cadete
→ Retorna orden + estado "pendiente"
```

### Aceptar pedido (Cadete)
```
PATCH /api/ordenes/:id/aceptar
{
  cadete_id: "cad_123"
}
→ Orden: pendiente → asignada
→ Cadete: disponible → en_viaje
→ Notificar al comercio/particular
```

### Rechazar pedido (Cadete)
```
PATCH /api/ordenes/:id/rechazar
{
  cadete_id: "cad_123",
  razon: "lejos" // opcional
}
→ Orden: pendiente → rechazada_por_cadete
→ Cadete: sigue disponible
→ Backend busca siguiente cadete
```

---

## 🔐 Reglas Firebase

**Solo comercios pueden crear órdenes de comercio:**
```json
{
  "ordenes": {
    "$orderId": {
      ".write": "root.child('comercios').child(auth.uid).exists() || 
                 root.child('particulares').child(auth.uid).exists()",
      "tipo_origen": {
        ".validate": "(data.val() === 'comercio' || data.val() === 'particular')"
      }
    }
  }
}
```

---

## 📝 Testing del Matching

**Caso 1: Comercio con prioridad**
- [ ] Crear orden de comercio
- [ ] Verificar que cadete recibe notificación rápido
- [ ] Verificar que particular esperando NO recibe notificación

**Caso 2: Particular después de comercio**
- [ ] Crear orden de comercio + esperar 5 seg
- [ ] Crear orden de particular
- [ ] Verificar que comercio fue notificado primero

**Caso 3: Cadete rechaza comercio**
- [ ] Cadete rechaza orden comercio
- [ ] Verificar que siguiente cadete recibe notificación
- [ ] Particular esperando NO es interrumpido

**Caso 4: Carga alta**
- [ ] 10 comercios + 20 particulares + 15 cadetes
- [ ] Verificar que sistema prioriza correctamente
- [ ] Verificar que no hay "pedidos huérfanos"


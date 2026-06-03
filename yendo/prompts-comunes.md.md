# Prompts Comunes - Yendo Mensajería

Usa estos prompts constantemente con Claude Code. Ajusta según necesites.

---

## 🎯 Prompts para Frontend (React)

### Crear componente nuevo
```
Crea un componente React llamado [NombreComponente] para [descripción breve].

Requisitos:
- Debe recibir estas props: [prop1, prop2]
- Debe conectarse a Firebase con useEffect
- Debe mostrar [descripción visual]
- Incluye manejo de loading y error
- Exporta por defecto

Basate en la arquitectura de src/components/[Carpeta]/
```

### Formulario rápido
```
Crea un formulario React para [acción - ej: crear pedido].

Campos:
- [campo1]: tipo [tipo - ej: texto], requerido
- [campo2]: tipo, validación
- [campo3]: tipo

Comportamiento:
- Submit debe llamar a [función/API]
- Mostrar loading mientras envía
- Mostrar éxito/error
- Limpiar forma después de éxito

Usa componentes de [tu librería de UI - ej: Tailwind]
```

### Integrar Firebase
```
Conecta este componente a Firebase Firestore para [acción].

Colección: [nombre_coleccion]
Documento: [estructura]

Debe:
- Traer datos en tiempo real con onSnapshot
- Manejar autenticación (uid del usuario)
- Incluir error handling
- Mostrar loading mientras trae datos
```

### Mapa con Google Maps
```
Integra Google Maps en un componente React.

Debe mostrar:
- Mapa centrado en [ciudad/coordenada]
- Pins para [elementos - ej: cadetes disponibles]
- Popup al hacer click mostrando [info]
- Actualizar cada [X segundos] desde Firestore

Usa: google-maps-react o @react-google-maps/api
```

---

## 🔧 Prompts para Backend (Node.js)

### Crear endpoint
```
Crea un endpoint Express para [acción - ej: crear orden].

Ruta: [POST/GET/PATCH] /api/[ruta]
Body: [estructura JSON con campos]

Debe:
1. Validar que el usuario esté autenticado (JWT)
2. Validar el body con [validación - ej: joi]
3. Llamar a Firestore para [acción específica]
4. Retornar { success: true, data: {...} } o error
5. Manejar excepciones

Código completo con error handling.
```

### Actualizar estado de orden
```
Crea un endpoint para cambiar estado de una orden.

Estado puede ser: pendiente → asignada → en_transito → completada

Debe:
- Validar que el estado sea válido
- Actualizar en Firestore
- Si es "asignada", notificar al cadete
- Retornar la orden actualizada
```

### Traer datos con filtros
```
Crea un endpoint para traer [recursos] con filtros.

Filtros posibles:
- [filtro1]: [tipo de filtro - ej: por zona]
- [filtro2]
- Paginación: limit + offset

Query Firestore:
- Documente la colección a usar
- Los índices necesarios (si es que hay)

Retorna: { success: true, data: [...], total: X }
```

### Middleware de validación
```
Crea un middleware Express para validar [cosa].

Debe validar:
- [campo1]: requerido, tipo [tipo]
- [campo2]: debe cumplir [condición]
- Retornar 400 si falla

Usa: express-validator o joi
```

---

## 🔄 Prompts para Flujos Complejos

### Feature: Pedido Express (5 segundos)
```
Implementa el flujo completo de "Pedido Express":

Frontend (React):
1. Comercio selecciona cliente guardado OR escribe uno nuevo
2. Selecciona zona (dropdown con zonas predefinidas)
3. Precio aparece automático basado en zona
4. Click "Enviar" → POST /api/ordenes
5. Toast de "Pedido enviado"

Backend (Node.js):
1. POST /api/ordenes recibe { comercio_id, cliente, zona }
2. Busca cadetes disponibles en esa zona
3. Envia notificación a todos ellos (Firebase Cloud Messaging)
4. Guarda orden en Firestore con estado "pendiente"
5. Retorna orden creada

Tiempo total: <5 segundos
```

### Feature: Aceptar/Rechazar pedido (Cadete)
```
Implementa la notificación + aceptación de pedidos para cadete:

Frontend:
1. Cadete recibe notificación sonora + popup grande
2. Detalles: cliente, dirección, precio, zona
3. 2 botones: "Aceptar" (verde) "Rechazar" (gris)
4. Si acepta → mapa con ruta al cliente
5. Tracking de ubicación en tiempo real

Backend:
1. Cuando cadete acepta → PATCH /api/ordenes/:id/aceptar
2. Cambiar estado a "asignada"
3. Enviar notificación al comercio "Tu cadete está en camino"
4. Rechazada → buscar siguiente cadete disponible
```

### Feature: Dashboard Admin en Tiempo Real
```
Crea un dashboard para admin que muestre:

Izquierda: Mapa Google
- Pins de todos los cadetes
- Colores: verde=disponible, naranja=en_viaje, gris=offline
- Click en pin → detalles del cadete

Derecha: Tabla de pedidos
- Columnas: Comercio, Cliente, Zona, Cadete, Precio, Estado
- Filas con fondo rojo si >5 minutos sin asignar
- Click en fila → detalles + opción de asignar manual

Abajo: Gráficos (Charts.js o Recharts)
- Línea: pedidos por hora (24h)
- Barras: ganancias por zona
- Tabla: ranking cadetes

Actualización: cada 5 segundos
```

---

## 🐛 Prompts para Debugging

### Problema: Ubicación no actualiza en tiempo real
```
El mapa no muestra ubicaciones nuevas de cadetes. 

Checklist:
1. ¿Firebase Realtime DB tiene listener activo? Revisa useEffect
2. ¿Cadete está escribiendo en /cadetes_ubicacion/{id}?
3. ¿Las reglas de Firebase permiten lectura en tiempo real?
4. ¿El intervalo de actualización es muy largo?

Usa: console.log() en cada listener para debuggear
```

### Problema: Órdenes no llegan a cadetes
```
Los cadetes no reciben notificaciones.

Debuggea:
1. ¿El endpoint POST /api/ordenes está siendo llamado?
2. ¿Se está llamando a Firebase Cloud Messaging?
3. ¿El dispositivo del cadete tiene FCM token?
4. ¿Revisar logs de Firebase Cloud Functions?

Logs: console.log(error) en todos los try/catch
```

---

## 📚 Prompts para Documentar

### Documentar una feature
```
Documenta la feature de [nombre] en arquitectura-general.md

Incluye:
- ¿Qué es? (1 párrafo)
- ¿Quién la usa? (comercio/cadete/admin)
- Flujo paso a paso (usuario)
- Flujo técnico (frontend → backend → firebase)
- Endpoints involucrados
- Colecciones Firebase
- Consideraciones de performance
```

### Actualizar CLAUDE.md
```
Actualiza CLAUDE.md con:
- Feature completada: [nombre]
- Cambio técnico importante: [descripción]
- Nuevo endpoint: [POST /api/...]
- Decisión tomada: [descripción]

Sección: "🚀 Plan de Desarrollo"
```

---

## 🎨 Prompts para UI/UX

### Landing de Comercio
```
Crea la pantalla principal para Comercio.

Layout:
- Header: logo Yendo, nombre comercio, botón logout
- Card grande: "Crear nuevo pedido" → lleva a form
- Card: "Últimos 3 pedidos" con detalles rápidos
- Card: "Clientes frecuentes" con botón 1-click

Diseño: limpio, minimalista, verde como color principal
Responsive: debe verse bien en móvil
```

### Notificación de Cadete
```
Crea una notificación grande y prominente para cadete.

Requisitos:
- Sonido automático
- Fondo de pantalla completa
- Detalles grandes: cliente, dirección, precio
- 2 botones GRANDES: Aceptar (verde) Rechazar
- Auto-dismiss en 30 segundos si no interactúa

Animación: slide up desde abajo
```

---

## 🔐 Prompts para Seguridad

### Validar autenticación
```
Crea un middleware para validar JWT token.

Debe:
1. Extraer token del header "Authorization: Bearer [token]"
2. Verificar que sea válido con tu secret
3. Extraer uid del token
4. Verificar que el uid existe en Firestore/comercios
5. Pasar uid a req.user

Error: 401 si token inválido
```

### Reglas Firebase
```
Escribe las reglas de Firestore para [colección].

Reglas:
- Solo admin puede leer todo
- Cadete puede leer ordenes asignadas a él
- Comercio puede leer/escribir sus órdenes
- Usuarios no autenticados: sin acceso

Formato: JSON rules v2
```

---

## 🧪 Prompts para Testing

### Test unitario
```
Crea un test en Jest para [función].

Debe testear:
1. Caso feliz: [descripción]
2. Validación: [descripción]
3. Error: [descripción]

Usa: describe, it, expect
Mock: [dependencias si las hay]
```

---

## 💡 Tips al usar estos prompts

1. **Copia + adapta:** No uses exactamente como está, ajusta nombres/detalles
2. **Sé específico:** Si cambias un requisito, menciona en el prompt
3. **Referencia:** "Como en arquitectura-general.md" para contexto
4. **Iterativo:** Si el resultado no es perfecto, da feedback: "Falta [X]"
5. **Documenta:** Después de crear, actualiza este archivo si hay un patrón nuevo

---

## 📌 Próximos prompts a crear

- [ ] Integración WhatsApp Business (Etapa 2)
- [ ] Predicción inteligente de disponibilidad
- [ ] Facturación automática
- [ ] App React Native para cadetes


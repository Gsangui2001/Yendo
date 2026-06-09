# CLAUDE.md - Yendo Mensajería

**Última actualización:** Junio 2026  
**Etapa:**  Desarrollo MVP

---

## 🎯 Misión del Proyecto

Crear la plataforma de cadetes **más rápida** del mercado. Que los comercios y los clientes privados puedan solicitar un cadete. que se pueda cobrar la tarifa diara a los cadetes por la web/app, tambien a los comercios adheridos. que cada cadete, comercio y cliente privado tenga su usario, tener mas rentabilidad en yendo

No es una plataforma logística compleja. Es velocidad + simplicidad.

---

## 👥 Contexto Actual

- **Comercios activos:** 30 adheridos (es nuestro activo más valioso + PRIORIDAD)
- **Clientes particulares:** Crecimiento esperado (nueva funcionalidad)
- **Status:** Mostrando prototipo a comercios, implementando web/app para particulares
- **Equipo:** Gerar (Marketing + Sales + Product) + Desarrollo
- cadets : 20 o mas cadetes actualmente
- horarios: lunes a jueves 8am a 1am, viernes y sabado 8am a 2am y los domingos de 10am a 1am
- los cadetes tienen de ganancia los envios
- yendo gana de una base diaria de cadetes y coemrcios adheridos
- Quiero que el titulo sea YENDO, los colores que tenemos son verde,azul y blanco
  

---


## 🏗️ Stack Tecnológico (Decisión Final)

- **Frontend:** React (web + responsive móvil)
- **Backend:** Node.js + Express
- **Base de datos / Tiempo real:** Supabase (PostgreSQL + Realtime)
- **Por qué Supabase:** PostgreSQL estructurado, Auth integrado, Realtime Subscriptions, más barato cuando crece, menos vendor lock-in.

---

## 📋 MVP - Lo que se construye PRIMERO

### Para Comercio
1. ✅ **Pedido - 0 a enviado en 5 segundos (CORE)
2. ✅ Clientes guardados + autocompletado
3. ✅ Pedido en 1-click para clientes frecuentes
4. ✅ Repetir pedido desde historial
5. ✅ Selector de zona → precio automático
6. ✅ Mapa en tiempo real con cadetes libres
7. ✅ Historial de pedidos + PDF
8. usario para cada comercio con numero de telefono, google, etc
9. logo del comercio

### Para Cliente Particular (NUEVO)
1. ✅ **Solicitar cadete** - formulario simple (¿qué, dónde, cuándo?)
2. ✅ Login: Google Auth o teléfono
3. ✅ Guardar direcciones frecuentes
4. ✅ Mapa en tiempo real: ver dónde está el cadete
5. ✅ ETA estimado
6. ✅ Notificación cuando cadete llega
7. ✅ Historial de pedidos
8. ✅ Opciones de pago: efectivo al cadete O tarjeta a Yendo
9. usario para cada cliente con numero de telefono, google, etc


### Para Cadete
1. ✅ Pedidos en pantalla completa + sonido
2. ✅ Aceptar/Rechazar manualmente
3. ✅ Ver ubicación en mapa
4. ✅ Ganancias del día/mes
5. ✅ Ranking solo de la persona que esta registrada
6. usario para cada cadete con numero de telefono, google, etc
7. foto del cadete

### Para Admin
1. ✅ Mapa general con todos los cadetes
2. ✅ Alertas de pedidos sin asignar
3. ✅ Gráfico de horas pico
4. ✅ Ranking de cadetes y comercios (que solo el administrador vea esto)
5. ✅ Comercios inactivos destacados
6. ✅ Exportar resumen mensual
7. usario para cada aministrador con numero de telefono, google, etc

---

## 💰 Modelo de Negocio

### Etapa 1 (Ahora)
- Plataforma **GRATUITA** para los 30 comercios actuales
- Objetivo: Validar producto, conseguir feedback real

### Etapa 2 (Cuando todos la usen)
- Planes pagos: **$15.000/mes por comercio**
- 20 comercios pagando = **$300K/mes**
- Plus: comisión por viaje (independiente)

### Etapa 3 (Futuro)
- WhatsApp Business integrado (pedido automático)
- Predicción inteligente de clientes
- App móvil nativa para cadetes
- Facturación automática

---

## 📊 Zonas y Precios (Configuración Actual)

| Zona              | Precio |
| ----------------- | ------ |
| Ciudad de Colón   | $3.000 |
| Barrio Ombú       | $3.500 |
| Barrio Artalaz    | $5.000 |
| Barrio Los Bretes | $6.000 |
| San José          | $8.500 |
| El Brillante      | $8.500 |
| Pueblo Liebig     | $8.500 |

**Sistema:** Comercio elige zona → precio automático → cadete ve lo que gana.

---

## 🎯 Decisiones de Producto Tomadas

1. **Aceptación MANUAL de pedidos (cadete)** - No algoritmo automático. El cadete decide si acepta.
2. **5 segundos es el KPI** - Todo el producto está optimizado para esto.
3. **No es Uber** - No hay asignación automática, no hay "búsqueda de conductor".
4. **Los 30 comercios son el activo primario** - Pedidos de comercios tienen PRIORIDAD sobre particulares.
5. **Gratuito en Etapa 1** - Validar que usen, luego monetizar.
6. **Particulares pagan al cadete O a Yendo** - Flexibilidad de pago (efectivo o app).
7. **Misma app/web para ambos** - Pero roles separados (comercio vs particular).
8. **Historial + mapa en tiempo real** - Los particulares necesitan visibilidad (diferencia clave vs WhatsApp manual).
9. 

---

## 🔴 Desafíos Técnicos Conocidos

1. **Geolocalización en tiempo real** - Firebase Realtime DB debe ser ultrarrápida
2. **Notificaciones** - Sonido + pantalla completa para cadetes (mobile web)
3. **Matching con PRIORIDAD** - Lógica de: comercios > particulares (nuevo, más complejo)
4. **Map refresh** - No puede ser laggy, usuarios esperan actualizaciones cada ~2 segundos
5. **Offline resilience** - Si Firebase cae, qué pasa?
6. **Sistema de pago dual** - Particular paga al cadete (efectivo) O a Yendo (tarjeta)
7. analizar si sirve que el cadete tome el pedido manualmente o que se le asigue automatico

---

## 📝 Prompts Frecuentes que Necesitarás

Ver: `prompts-comunes.md`

Ejemplos:
- "Crea un componente React para [feature X]"
- "Escribe el endpoint en Node.js para [acción Y]"
- "Estructura Firebase Firestore para [datos Z]"

---

## 🚀 Plan de Desarrollo (Fases)

### Semana 1-2: Setup
- [ ] Repo + estructura de carpetas
- [ ] Firebase project + auth
- [ ] React + routing base
- [ ] Node.js + primeros endpoints

### Semana 3-4: MVP Comercio
- [ ] Interfaz crear pedido (5 seg challenge)
- [ ] Clientes guardados
- [ ] Selector de zona + precios
- [ ] Historial básico

### Semana 5-6: MVP Cadete
- [ ] Dashboard cadete
- [ ] Notificaciones + sonido
- [ ] Aceptar/rechazar pedidos
- [ ] Mapa de ubicación

### Semana 7-8: MVP Admin
- [ ] Dashboard admin
- [ ] Mapa general
- [ ] Reportes básicos
- [ ] Alertas

### Semana 9-10: Pulir
- [ ] Testing
- [ ] UX refinement
- [ ] Performance tuning
- [ ] Feedback comercios → iteraciones

---

## 🎓 Contexto para Claude Code

Cuando trabajes en Yendo:
1. Siempre prioriza **velocidad y UX simplista**
2. No construyas features que no están en el MVP
3. Si hay un tradeoff entre "correcto" y "rápido", elige rápido (MVP es para validar)
4. Documenta cambios en este archivo
5. Cualquier decisión técnica → anótala aquí

---

## 📚 Archivos Relacionados

- `README.md` - Índice completo
- `usuarios.md` - Flujos detallados por usuario
- `mvp-features.md` - Desglose técnico de cada feature
- `arquitectura-general.md` - Diagrama e integración
- `prompts-comunes.md` - Prompts reutilizables


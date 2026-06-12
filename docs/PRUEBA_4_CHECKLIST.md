# Prueba 4 — Checklist de auditoría profunda

Fecha: ____________  ·  Probador: ____________  ·  Commit: ____________

**Cómo usar esto:** cada fila se completa DURANTE la prueba, no de memoria.
Si algo falla, anotá el ID de la orden (los primeros 8 caracteres alcanzan)
y corré `node Backend/scripts/diagnosticar-orden.js <id>` para adjuntar el
diagnóstico como evidencia.

Prioridades: **P0** = bloquea la operación · **P1** = molesta pero hay vuelta · **P2** = cosmético.

Cuentas demo: comercio@ / cadete@ / privado@ / admin@yendo.com (pass de demo).

---

## A. Comercio crea pedido (flujo completo)

| # | Paso | Resultado esperado | Real | Evidencia | Bug | Prioridad |
|---|------|--------------------|------|-----------|-----|-----------|
| A1 | Login comercio | Entra al panel sin errores | | | | |
| A2 | Nuevo pedido → elegir cliente | La dirección del cliente se autocompleta | | | | |
| A3 | Ver "Origen — dirección del comercio" | Muestra la dirección real del comercio (solo lectura) | | | | |
| A4 | Destino: dirección en Colón (ej: San Martín 441) | Cotiza solo, ~0.5–3 km, $3.000 | | | | |
| A5 | Destino: "San José, Entre Ríos" | ~10 km · ruta real → **$8.500** | | | | |
| A6 | Destino: "Galarza 1000, Concepción del Uruguay" | Cotiza ~35–45 km o avisa que excede el envío local — NUNCA cotiza como si fuera Villa Elisa | | | | |
| A7 | Confirmar pedido | Toast con "Código de entrega: XXXX" | | | | |
| A8 | Mapa del envío (inicio comercio) | El pin de destino está EXACTAMENTE en la dirección pedida | | | | |
| A9 | Se asigna cadete | Estado pasa a "Cadete asignado"; nombre y botón Llamar visibles | | | | |
| A10 | Tarjeta "Pedido principal" | Muestra el código de entrega en recuadro ámbar | | | | |
| A11 | Cadete entrega con código | Pedido pasa a "Entregado" en el panel comercio | | | | |
| A12 | Diagnóstico | `diagnosticar-orden.js <id>`: coordenadas consistentes (diferencia < 1 km), finanzas cerradas | | | | |

## B. Cadete ocupado (un viaje a la vez)

| # | Paso | Resultado esperado | Real | Evidencia | Bug | Prioridad |
|---|------|--------------------|------|-----------|-----|-----------|
| B1 | Cadete conectado, llega pedido 1 | Modal de oferta con dirección, km y ganancia | | | | |
| B2 | Acepta pedido 1 | Va a la pantalla de pedido activo; dirección grande + botón "Abrir ruta" | | | | |
| B3 | Botón "Abrir ruta" | Google Maps abre EXACTAMENTE en el destino (no en otra localidad) | | | | |
| B4 | Comercio crea pedido 2 | Al cadete ocupado NO le aparece oferta (ni modal ni lista) | | | | |
| B5 | Admin mira pedido 2 | Queda "Buscando cadete" con select "Asignar a..." | | | | |
| B6 | Cadete intenta API directa para aceptar pedido 2 (opcional, técnico) | Backend responde 409 "Ya tenés un pedido en curso" | | | | |
| B7 | Cadete entrega pedido 1 (con código) | Vuelve a disponible; la oferta del pedido 2 le llega sola (≤ 12 s) | | | | |

## C. Privado crea pedido

| # | Paso | Resultado esperado | Real | Evidencia | Bug | Prioridad |
|---|------|--------------------|------|-----------|-----|-----------|
| C1 | Login privado → Pedir cadete | Form con origen/destino (sin precio por zona) | | | | |
| C2 | Elegir dirección guardada como origen | Cotiza al instante (usa coordenadas guardadas) | | | | |
| C3 | Destino nuevo escrito a mano | Cotiza con km de ruta real; precio correcto ($3.500 base + $1.000/km extra) | | | | |
| C4 | Crear pedido | Aparece en "Pedidos en curso" con recuadro ámbar del código | | | | |
| C5 | Tracking en mapa | Pin de destino en el lugar correcto; cadete visible cuando acepta | | | | |
| C6 | Entrega | El cadete pide el código, el privado se lo da, queda entregada | | | | |
| C7 | Finanzas | `diagnosticar-orden.js`: total, 82/18 y propina correctos | | | | |

## D. Admin

| # | Paso | Resultado esperado | Real | Evidencia | Bug | Prioridad |
|---|------|--------------------|------|-----------|-----|-----------|
| D1 | Cadetes → click KPI "Activos" | La tabla muestra SOLO disponibles + en viaje | | | | |
| D2 | Click "Disponibles" / "En ruta" / "Desconectados" | Filtra solo ese estado; click de nuevo vuelve a todos | | | | |
| D3 | Inicio: chips de cadetes | Conteos correctos de libres/en viaje/offline | | | | |
| D4 | Pedido sin tomar > 15 min | Aparece "demorado" en rojo en la alerta | | | | |
| D5 | Asignación manual ("Asignar a...") | El pedido pasa a asignada y al cadete le aparece | | | | |
| D6 | Tabla pedidos: columna Código | Admin ve el código de cada pedido activo | | | | |
| D7 | Forzar entrega (select estado → Entregado) | Funciona SIN código (privilegio admin) | | | | |
| D8 | Finanzas por cadete | viajes/facturado/propinas/efectivo a rendir/a depositar consistentes con los pedidos del día | | | | |

## E. Errores y bordes

| # | Paso | Resultado esperado | Real | Evidencia | Bug | Prioridad |
|---|------|--------------------|------|-----------|-----|-----------|
| E1 | Destino "Rosario, Santa Fe" | Error: "No pudimos confirmar la dirección... Agregá ciudad/localidad" + opción km a mano | | | | |
| E2 | Destino inventado ("asdf 99999") | Error claro "No encontramos la dirección..." | | | | |
| E3 | Sesión vencida (dejar la pestaña 1+ hora o borrar el token en DevTools) | Al cotizar/crear: redirige a login con "Tu sesión venció" — NO sigue en km manual | | | | |
| E4 | Cadete sin GPS (denegar permiso de ubicación) | El matching igual asigna (por fairness); el mapa muestra ruta estimada | | | | |
| E5 | Sin cadetes disponibles | "Sin cadetes disponibles. Espera aprox X min"; pedido queda en cola y visible en admin | | | | |
| E6 | Código de entrega incorrecto | "Código incorrecto. Pedíselo de nuevo al cliente." — la orden NO se entrega | | | | |
| E7 | Código vacío | "Ingresá el código de entrega" | | | | |
| E8 | Reintento con código correcto tras fallar | Entrega OK; `diagnosticar-orden.js` muestra intentos fallidos registrados | | | | |

## Herramientas de apoyo

```
# Diagnóstico completo de una orden (acepta prefijo de id o "ultima")
node Backend/scripts/diagnosticar-orden.js ultima

# Regresión de geocoding (San José, C. del Uruguay, Villa Elisa, Colón, inválidas)
node Backend/scripts/test-geo-regression.js

# E2E del código de entrega (crea, falla, entrega, limpia)
node Backend/scripts/test-delivery-code.js

# E2E de cotización + coordenadas guardadas
node Backend/scripts/test-cotizar-e2e.js

# Si el mapa de una orden vieja sigue mal: re-geocodificar datos guardados
node Backend/scripts/regeocodificar-guardados.js
```

## Resumen final

- Bugs P0: ____
- Bugs P1: ____
- Bugs P2: ____
- ¿Listo para piloto con comercios reales? SÍ / NO — por qué: ____________

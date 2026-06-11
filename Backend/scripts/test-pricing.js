// Casos de validación de la lógica de precios (los del spec del producto).
// USO: node scripts/test-pricing.js  — sale con código 1 si algo no da.

import { calcularPrecio } from '../lib/pricing.js';

let fallas = 0;
function caso(nombre, resultado, esperado) {
  const errores = Object.entries(esperado)
    .filter(([k, v]) => resultado[k] !== v)
    .map(([k, v]) => `    ${k}: esperado ${v}, dio ${resultado[k]}`);
  if (errores.length) {
    fallas++;
    console.log(`✗ ${nombre}`);
    errores.forEach((e) => console.log(e));
  } else {
    console.log(`✓ ${nombre}`);
  }
}

// Comercio 8 km sin recargo ni propina
caso('Comercio 8km simple',
  calcularPrecio({ tipo: 'comercio', distancia_km: 8, metodo_pago: 'efectivo' }),
  { precio_envio: 5100, ganancia_yendo: 918, ganancia_cadete: 4182, total_cadete: 4182, total_cliente: 5100, efectivo_a_rendir: 918, monto_a_depositar_cadete: 0 });

// Comercio 8 km con lluvia activa
caso('Comercio 8km + lluvia',
  calcularPrecio({ tipo: 'comercio', distancia_km: 8, config: { recargo_lluvia_activo: true } }),
  { precio_envio: 5600, ganancia_yendo: 1008, ganancia_cadete: 4592, recargo_clima_feriado: 500 });

// Lluvia + feriado activos: el recargo se cobra UNA vez
caso('Recargo no se duplica',
  calcularPrecio({ tipo: 'comercio', distancia_km: 8, config: { recargo_lluvia_activo: true, recargo_feriado_activo: true } }),
  { precio_envio: 5600, recargo_clima_feriado: 500 });

// Comercio 8 km + lluvia + propina $500
caso('Comercio 8km + lluvia + propina (efectivo)',
  calcularPrecio({ tipo: 'comercio', distancia_km: 8, propina_cadete: 500, metodo_pago: 'efectivo', config: { recargo_lluvia_activo: true } }),
  { total_cliente: 6100, ganancia_yendo: 1008, total_cadete: 5092, efectivo_a_rendir: 1008, monto_a_depositar_cadete: 0 });

// Mismo caso online: Yendo deposita al cadete
caso('Comercio 8km + lluvia + propina (online)',
  calcularPrecio({ tipo: 'comercio', distancia_km: 8, propina_cadete: 500, metodo_pago: 'online', config: { recargo_lluvia_activo: true } }),
  { total_cliente: 6100, efectivo_a_rendir: 0, monto_a_depositar_cadete: 5092 });

// Privado 4 km (dentro de los 5 incluidos)
caso('Privado 4km',
  calcularPrecio({ tipo: 'particular', distancia_km: 4 }),
  { precio_envio: 3500, ganancia_yendo: 630, ganancia_cadete: 2870 });

// Privado 8 km
caso('Privado 8km',
  calcularPrecio({ tipo: 'particular', distancia_km: 8 }),
  { precio_envio: 5600, ganancia_yendo: 1008, ganancia_cadete: 4592 });

// Propina con transferencia: ejemplo $5.100 + $500
caso('Ejemplo transferencia 5100+500',
  calcularPrecio({ tipo: 'comercio', distancia_km: 8, propina_cadete: 500, metodo_pago: 'transferencia' }),
  { precio_envio: 5100, total_cliente: 5600, ganancia_yendo: 918, total_cadete: 4682, monto_a_depositar_cadete: 4682, efectivo_a_rendir: 0 });

if (fallas) { console.log(`\n${fallas} caso(s) fallaron`); process.exit(1); }
console.log('\nTodos los casos OK');

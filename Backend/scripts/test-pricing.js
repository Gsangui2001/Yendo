// Casos de validación de la lógica de precios (los del spec del producto).
// Tarifas vigentes: comercio $3.000 hasta 5 km + $1.100/km extra;
//                   particular $3.500 hasta 5 km + $1.000/km extra.
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

// CASO REAL: a San José son ~10 km y tiene que dar $8.500
caso('Comercio 10km (San José) = $8.500',
  calcularPrecio({ tipo: 'comercio', distancia_km: 10, metodo_pago: 'efectivo' }),
  { precio_envio: 8500, ganancia_yendo: 1530, ganancia_cadete: 6970, total_cliente: 8500, efectivo_a_rendir: 1530 });

// Comercio 8 km sin recargo ni propina: 3000 + 3*1100
caso('Comercio 8km simple',
  calcularPrecio({ tipo: 'comercio', distancia_km: 8, metodo_pago: 'efectivo' }),
  { precio_envio: 6300, ganancia_yendo: 1134, ganancia_cadete: 5166, total_cadete: 5166, total_cliente: 6300, efectivo_a_rendir: 1134, monto_a_depositar_cadete: 0 });

// Comercio 8 km con lluvia activa (+$500 una vez)
caso('Comercio 8km + lluvia',
  calcularPrecio({ tipo: 'comercio', distancia_km: 8, config: { recargo_lluvia_activo: true } }),
  { precio_envio: 6800, ganancia_yendo: 1224, ganancia_cadete: 5576, recargo_clima_feriado: 500 });

// Lluvia + feriado activos: el recargo se cobra UNA vez
caso('Recargo no se duplica',
  calcularPrecio({ tipo: 'comercio', distancia_km: 8, config: { recargo_lluvia_activo: true, recargo_feriado_activo: true } }),
  { precio_envio: 6800, recargo_clima_feriado: 500 });

// Comercio 8 km + lluvia + propina $500 (la propina es 100% del cadete)
caso('Comercio 8km + lluvia + propina (efectivo)',
  calcularPrecio({ tipo: 'comercio', distancia_km: 8, propina_cadete: 500, metodo_pago: 'efectivo', config: { recargo_lluvia_activo: true } }),
  { total_cliente: 7300, ganancia_yendo: 1224, total_cadete: 6076, efectivo_a_rendir: 1224, monto_a_depositar_cadete: 0 });

// Mismo caso online: Yendo deposita al cadete
caso('Comercio 8km + lluvia + propina (online)',
  calcularPrecio({ tipo: 'comercio', distancia_km: 8, propina_cadete: 500, metodo_pago: 'online', config: { recargo_lluvia_activo: true } }),
  { total_cliente: 7300, efectivo_a_rendir: 0, monto_a_depositar_cadete: 6076 });

// Privado 4 km (dentro de los 5 incluidos)
caso('Privado 4km',
  calcularPrecio({ tipo: 'particular', distancia_km: 4 }),
  { precio_envio: 3500, ganancia_yendo: 630, ganancia_cadete: 2870 });

// Privado 8 km: 3500 + 3*1000
caso('Privado 8km',
  calcularPrecio({ tipo: 'particular', distancia_km: 8 }),
  { precio_envio: 6500, ganancia_yendo: 1170, ganancia_cadete: 5330 });

// Privado 10 km: 3500 + 5*1000 = $8.500
caso('Privado 10km = $8.500',
  calcularPrecio({ tipo: 'particular', distancia_km: 10 }),
  { precio_envio: 8500, ganancia_yendo: 1530, ganancia_cadete: 6970 });

// Propina con transferencia
caso('Comercio 8km + propina (transferencia)',
  calcularPrecio({ tipo: 'comercio', distancia_km: 8, propina_cadete: 500, metodo_pago: 'transferencia' }),
  { precio_envio: 6300, total_cliente: 6800, ganancia_yendo: 1134, total_cadete: 5666, monto_a_depositar_cadete: 5666, efectivo_a_rendir: 0 });

if (fallas) { console.log(`\n${fallas} caso(s) fallaron`); process.exit(1); }
console.log('\nTodos los casos OK');

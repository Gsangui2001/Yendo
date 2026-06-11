// Siembra datos de prueba realistas para que la beta no se vea vacía.
//
// USO (desde la carpeta Backend, requiere .env con SUPABASE_SERVICE_KEY):
//   node scripts/seed-demo.js
//
// Qué hace:
//   1. Borra los pedidos demo anteriores (los marcados con [DEMO]).
//   2. Crea ~15 pedidos repartidos entre comercios y privados existentes:
//      entregados (hoy / esta semana / este mes), en camino, asignados,
//      pendientes en broadcast y 1 cancelado. Con split 82/18 real.
//   3. Recalcula viajes y ganancias de cada cadete a partir de TODOS sus
//      pedidos entregados (reales + demo), así los contadores cierran.
//
// Idempotente: correrlo de nuevo reemplaza los pedidos demo, no los duplica.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY en Backend/.env');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

const MARCA = '[DEMO]';
const ZONAS = [
  { value: 'ciudad_colon',      label: 'Ciudad de Colón',   precio: 3000 },
  { value: 'barrio_ombu',       label: 'Barrio Ombú',       precio: 3500 },
  { value: 'barrio_artalaz',    label: 'Barrio Artalaz',    precio: 5000 },
  { value: 'barrio_los_bretes', label: 'Barrio Los Bretes', precio: 6000 },
];
const DIRECCIONES = [
  '12 de Abril 384', 'Belgrano 152', 'Maipú 220', 'Alejo Peyret 95',
  'San Martín 441', 'Urquiza 310', 'Paso 178', 'Bolívar 533',
];

const azar = (arr) => arr[Math.floor(Math.random() * arr.length)];
const haceHoras = (h) => new Date(Date.now() - h * 3600_000).toISOString();
const haceDias  = (d) => haceHoras(d * 24);

function baseOrden({ comercio, cliente, zona, estado, creado, cadeteId }) {
  const o = {
    tipo: 'comercio',
    prioridad: 'alta',
    es_particular: false,
    estado,
    comercio_id: comercio.id,
    cliente_id: cliente?.id ?? null,
    cliente_nombre: `${MARCA} ${cliente?.nombre ?? 'Cliente de prueba'}`,
    direccion: cliente?.direccion ?? azar(DIRECCIONES),
    zona: zona.value,
    zona_label: zona.label,
    precio: zona.precio,
    metodo_pago: azar(['efectivo', 'transferencia']),
    creado_en: creado,
    rechazos: [],
  };
  if (estado === 'entregada') {
    o.cadete_id = cadeteId;
    o.asignada_en = creado;
    o.entregada_en = new Date(new Date(creado).getTime() + 25 * 60_000).toISOString();
    o.ganancia_cadete = Math.round(zona.precio * 0.82 * 100) / 100;
    o.ganancia_yendo  = Math.round(zona.precio * 0.18 * 100) / 100;
  }
  if (estado === 'en_camino' || estado === 'asignada') {
    o.cadete_id = cadeteId;
    o.asignada_en = creado;
  }
  if (estado === 'pendiente') {
    o.broadcast_en = creado; // visible para cadetes de la zona
  }
  return o;
}

async function main() {
  // ── Datos existentes ──────────────────────────────────────────────────
  const [{ data: comercios }, { data: cadetes }] = await Promise.all([
    supabase.from('comercios').select('id, nombre, activo').eq('activo', true),
    supabase.from('cadetes').select('id, nombre, zona').eq('activo', true),
  ]);
  if (!comercios?.length) { console.error('No hay comercios activos. Creá al menos uno desde el admin.'); process.exit(1); }
  if (!cadetes?.length)   { console.error('No hay cadetes activos. Creá al menos uno desde el admin.'); process.exit(1); }

  const { data: clientes } = await supabase.from('clientes').select('id, nombre, direccion, comercio_id');
  const clientesDe = (cid) => (clientes ?? []).filter((c) => c.comercio_id === cid);

  // ── 1) Limpiar demo anterior ──────────────────────────────────────────
  const { error: delError } = await supabase.from('ordenes').delete().like('cliente_nombre', `${MARCA}%`);
  if (delError) throw delError;
  const { error: delError2 } = await supabase.from('ordenes').delete().like('descripcion', `${MARCA}%`);
  if (delError2) throw delError2;
  console.log('Pedidos demo anteriores eliminados.');

  // ── 2) Crear pedidos ─────────────────────────────────────────────────
  const ordenes = [];
  const cadeteRR = (i) => cadetes[i % cadetes.length].id;
  let i = 0;
  for (const comercio of comercios) {
    const cli = clientesDe(comercio.id);
    const cliente = () => (cli.length ? azar(cli) : null);
    // Entregados: 2 hoy, 2 esta semana, 2 este mes
    for (const creado of [haceHoras(2), haceHoras(5), haceDias(2), haceDias(4), haceDias(12), haceDias(20)]) {
      ordenes.push(baseOrden({ comercio, cliente: cliente(), zona: azar(ZONAS), estado: 'entregada', creado, cadeteId: cadeteRR(i++) }));
    }
    // 1 en camino + 1 asignado + 1 pendiente
    ordenes.push(baseOrden({ comercio, cliente: cliente(), zona: azar(ZONAS), estado: 'en_camino', creado: haceHoras(0.4), cadeteId: cadeteRR(i++) }));
    ordenes.push(baseOrden({ comercio, cliente: cliente(), zona: azar(ZONAS), estado: 'asignada',  creado: haceHoras(0.2), cadeteId: cadeteRR(i++) }));
    ordenes.push(baseOrden({ comercio, cliente: cliente(), zona: azar(ZONAS), estado: 'pendiente', creado: haceHoras(0.1) }));
  }
  // 1 cancelado para que el filtro tenga de todo
  ordenes.push(baseOrden({ comercio: comercios[0], cliente: null, zona: azar(ZONAS), estado: 'cancelada', creado: haceDias(1) }));

  // Pedidos de PARTICULAR para privado@yendo.com (tracking del privado)
  const { data: lista } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const privado = lista?.users?.find((u) => u.email === 'privado@yendo.com');
  if (privado) {
    const particular = (estado, creado, cadeteId, descripcion) => {
      const zona = azar(ZONAS);
      const o = {
        tipo: 'particular',
        prioridad: 'baja',
        es_particular: true,
        estado,
        solicitante_id: privado.id,
        descripcion: `${MARCA} ${descripcion}`,
        origen: azar(DIRECCIONES),
        destino: azar(DIRECCIONES),
        direccion: null,
        zona: zona.value,
        zona_label: zona.label,
        precio: zona.precio + 500,
        metodo_pago: 'efectivo',
        creado_en: creado,
        rechazos: [],
      };
      if (estado === 'entregada') {
        o.cadete_id = cadeteId;
        o.asignada_en = creado;
        o.entregada_en = new Date(new Date(creado).getTime() + 30 * 60_000).toISOString();
        o.ganancia_cadete = Math.round(o.precio * 0.82 * 100) / 100;
        o.ganancia_yendo  = Math.round(o.precio * 0.18 * 100) / 100;
      }
      if (estado === 'en_camino') { o.cadete_id = cadeteId; o.asignada_en = creado; }
      return o;
    };
    ordenes.push(particular('entregada', haceDias(3), cadeteRR(i++), 'Documentos al estudio contable'));
    ordenes.push(particular('entregada', haceDias(8), cadeteRR(i++), 'Compra de farmacia'));
    ordenes.push(particular('en_camino', haceHoras(0.3), cadeteRR(i++), 'Paquete para mamá'));
    console.log('Pedidos de particular agregados para privado@yendo.com.');
  } else {
    console.log('privado@yendo.com no existe: salteo pedidos de particular.');
  }

  const { error: insError } = await supabase.from('ordenes').insert(ordenes);
  if (insError) throw insError;
  console.log(`${ordenes.length} pedidos demo creados (${comercios.length} comercios, ${cadetes.length} cadetes).`);

  // ── 3) Recalcular contadores de cadetes desde sus entregas reales ─────
  const hoy = new Date().toISOString().slice(0, 10);
  const hace7 = haceDias(7);
  const hace30 = haceDias(30);
  for (const cadete of cadetes) {
    const { data: propias } = await supabase
      .from('ordenes')
      .select('precio, ganancia_cadete, entregada_en')
      .eq('cadete_id', cadete.id)
      .eq('estado', 'entregada');
    const lista = propias ?? [];
    const gan = (o) => Number(o.ganancia_cadete ?? (Number(o.precio) || 0) * 0.82);
    const deHoy    = lista.filter((o) => o.entregada_en?.startsWith(hoy));
    const deSemana = lista.filter((o) => o.entregada_en >= hace7);
    const deMes    = lista.filter((o) => o.entregada_en >= hace30);
    await supabase.from('cadetes').update({
      viajes_hoy:       deHoy.length,
      viajes_semana:    deSemana.length,
      viajes_mes:       deMes.length,
      ganancias_hoy:    deHoy.reduce((s, o) => s + gan(o), 0),
      ganancias_semana: deSemana.reduce((s, o) => s + gan(o), 0),
      ganancias_mes:    deMes.reduce((s, o) => s + gan(o), 0),
      ultima_entrega_en: lista.map((o) => o.entregada_en).sort().at(-1) ?? null,
    }).eq('id', cadete.id);
    console.log(`  ${cadete.nombre}: ${deMes.length} viajes/mes recalculados.`);
  }

  console.log('Listo. Abrí localhost:5173 y mirá los dashboards con datos.');
}

main().catch((err) => { console.error('Error:', err.message ?? err); process.exit(1); });

import { useEffect, useRef } from 'react';
import L from 'leaflet';

const COLON = [-32.2239, -58.1442];

function hasGps(cadete) {
  return cadete?.ubicacion_lat != null && cadete?.ubicacion_lng != null;
}

function iconoPorEstado(estado) {
  const colores = { disponible: '#22C55E', en_viaje: '#3B82F6', offline: '#9CA3AF' };
  const color = colores[estado] ?? colores.offline;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
      <circle cx="16" cy="16" r="14" fill="${color}" stroke="white" stroke-width="2"/>
      <text x="16" y="21" text-anchor="middle" font-size="14">YD</text>
      <polygon points="16,38 10,28 22,28" fill="${color}"/>
    </svg>`;

  return L.divIcon({
    html: svg,
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -40],
    className: '',
  });
}

export function AdminMap({ cadetes = [], ordenes = [] }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const activos = ordenes.filter(o => ['pendiente', 'asignada', 'en_camino'].includes(o.estado));
  const conGPS = cadetes.filter(hasGps);

  useEffect(() => {
    if (!containerRef.current) return;

    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current, {
        center: COLON,
        zoom: 13,
        scrollWheelZoom: true,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
      }).addTo(mapRef.current);
      layerRef.current = L.layerGroup().addTo(mapRef.current);
    }

    const map = mapRef.current;
    const layer = layerRef.current;
    layer.clearLayers();

    conGPS.forEach(c => {
      L.marker([c.ubicacion_lat, c.ubicacion_lng], { icon: iconoPorEstado(c.estado) })
        .bindPopup(`
          <strong>${c.nombre ?? 'Cadete'}</strong><br/>
          ${c.telefono ?? 'Sin telefono'}<br/>
          Estado: ${c.estado ?? 'offline'}<br/>
          Viajes hoy: ${c.viajes_hoy ?? 0}
        `)
        .addTo(layer);
    });

    setTimeout(() => map.invalidateSize(), 0);
    if (conGPS.length > 1) {
      map.fitBounds(L.latLngBounds(conGPS.map(c => [c.ubicacion_lat, c.ubicacion_lng])), { padding: [40, 40], maxZoom: 15 });
    } else if (conGPS.length === 1) {
      map.setView([conGPS[0].ubicacion_lat, conGPS[0].ubicacion_lng], 14);
    } else {
      map.setView(COLON, 13);
    }

    return () => layer.clearLayers();
  }, [cadetes]);

  useEffect(() => () => {
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      layerRef.current = null;
    }
  }, []);

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
      <div ref={containerRef} style={{ height: 420, width: '100%' }} />

      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-4 text-xs text-gray-600">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />Disponible ({cadetes.filter(c => c.estado === 'disponible').length})</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />En viaje ({cadetes.filter(c => c.estado === 'en_viaje').length})</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" />Offline ({cadetes.filter(c => c.estado === 'offline').length})</span>
        <span className="ml-auto text-gray-400">{conGPS.length}/{cadetes.length} con GPS activo</span>
      </div>

      {activos.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 mb-2">PEDIDOS ACTIVOS ({activos.length})</p>
          <div className="space-y-1">
            {activos.slice(0, 5).map(o => (
              <div key={o.id} className="flex items-center justify-between text-xs">
                <span className="text-gray-700 truncate max-w-[180px]">{o.cliente_nombre ?? o.descripcion ?? 'Pedido'}</span>
                <span className={[
                  'px-1.5 py-0.5 rounded text-xs font-medium',
                  o.estado === 'pendiente' ? 'bg-amber-100 text-amber-700'
                    : o.estado === 'en_camino' ? 'bg-blue-100 text-blue-700'
                      : 'bg-green-100 text-green-700',
                ].join(' ')}>
                  {o.estado}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

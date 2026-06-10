import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';

const COLON = [-32.2239, -58.1442];

const ZONA_COORDS = {
  ciudad_colon: [-32.2239, -58.1442],
  barrio_ombu: [-32.2156, -58.1515],
  barrio_artalaz: [-32.2046, -58.1317],
  barrio_los_bretes: [-32.2363, -58.1592],
  san_jose: [-32.2136, -58.2188],
  el_brillante: [-32.1859, -58.2033],
  pueblo_liebig: [-32.1569, -58.1914],
};

const ESTADO_LABEL = {
  pendiente: 'Buscando cadete',
  asignada: 'Cadete asignado',
  en_camino: 'En camino',
  entregada: 'Entregado',
  cancelada: 'Cancelado',
};

function hasGps(item) {
  return item?.ubicacion_lat != null && item?.ubicacion_lng != null;
}

function orderOrigin(order) {
  if (order?.origen_lat != null && order?.origen_lng != null) return [order.origen_lat, order.origen_lng];
  return COLON;
}

function orderDestination(order) {
  if (order?.destino_lat != null && order?.destino_lng != null) return [order.destino_lat, order.destino_lng];
  return ZONA_COORDS[order?.zona] ?? COLON;
}

function mapIcon({ color = '#22C55E', label = 'YD' }) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
      <filter id="s" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="4" stdDeviation="3" flood-opacity="0.22"/>
      </filter>
      <path filter="url(#s)" d="M18 42s14-11.2 14-24A14 14 0 1 0 4 18c0 12.8 14 24 14 24z" fill="${color}" stroke="white" stroke-width="2"/>
      <text x="18" y="23" text-anchor="middle" font-size="11" font-family="Arial" font-weight="700" fill="white">${label}</text>
    </svg>`;

  return L.divIcon({
    html: svg,
    iconSize: [36, 44],
    iconAnchor: [18, 44],
    popupAnchor: [0, -42],
    className: '',
  });
}

function popup(title, detail) {
  return `<strong>${title}</strong><br/>${detail ?? ''}`;
}

export function TrackingMap({ order, cadete, cadetes = [], height = 360, compact = false }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  const origin = useMemo(() => orderOrigin(order), [order]);
  const destination = useMemo(() => orderDestination(order), [order]);
  const cadetePoint = hasGps(cadete) ? [cadete.ubicacion_lat, cadete.ubicacion_lng] : null;
  const cadetesConGps = cadetes.filter(hasGps);
  const estado = order?.estado ?? 'pendiente';

  useEffect(() => {
    if (!containerRef.current) return;

    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current, {
        center: destination,
        zoom: 13,
        scrollWheelZoom: !compact,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
      }).addTo(mapRef.current);
      layerRef.current = L.layerGroup().addTo(mapRef.current);
    }

    const map = mapRef.current;
    const layer = layerRef.current;
    layer.clearLayers();

    const route = cadetePoint ? [cadetePoint, destination] : [origin, destination];
    const points = cadetePoint
      ? [cadetePoint, destination]
      : [origin, destination, ...cadetesConGps.map(c => [c.ubicacion_lat, c.ubicacion_lng])];

    L.polyline(route, {
      color: '#22C55E',
      weight: 5,
      opacity: 0.8,
      dashArray: estado === 'pendiente' ? '8 10' : undefined,
    }).addTo(layer);

    L.marker(origin, { icon: mapIcon({ color: '#7C3AED', label: 'OR' }) })
      .bindPopup(popup('Origen', order?.origen ?? order?.comercio_nombre ?? 'Comercio'))
      .addTo(layer);

    L.marker(destination, { icon: mapIcon({ color: '#16A34A', label: 'DE' }) })
      .bindPopup(popup('Destino', order?.destino ?? order?.direccion ?? order?.zona_label ?? 'Destino del pedido'))
      .addTo(layer);

    if (cadetePoint) {
      L.marker(cadetePoint, { icon: mapIcon({ color: '#2563EB', label: 'CA' }) })
        .bindPopup(popup(cadete?.nombre ?? 'Cadete', `${cadete?.telefono ?? 'Sin telefono cargado'}<br/>${cadete?.estado ?? 'en viaje'}`))
        .addTo(layer);
    } else {
      cadetesConGps.forEach(c => {
        L.marker([c.ubicacion_lat, c.ubicacion_lng], {
          icon: mapIcon({ color: c.estado === 'disponible' ? '#22C55E' : '#3B82F6', label: 'CA' }),
        })
          .bindPopup(popup(c.nombre, c.estado))
          .addTo(layer);
      });
    }

    setTimeout(() => map.invalidateSize(), 0);
    const valid = points.filter(Boolean);
    if (valid.length > 1) map.fitBounds(L.latLngBounds(valid), { padding: [34, 34], maxZoom: 15 });
    else map.setView(valid[0] ?? COLON, valid.length ? 14 : 13);

    return () => {
      layer.clearLayers();
    };
  }, [origin, destination, cadetePoint, cadetesConGps, estado, order, cadete, compact]);

  useEffect(() => () => {
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      layerRef.current = null;
    }
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div ref={containerRef} style={{ height, width: '100%' }} />
      <div className="border-t border-gray-100 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-gray-900">{ESTADO_LABEL[estado] ?? estado}</p>
            <p className="text-xs text-gray-500">
              {cadete?.nombre ? `Cadete: ${cadete.nombre}` : 'Ruta estimada hasta tener GPS del cadete'}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
            <span className="h-2.5 w-2.5 rounded-full bg-purple-600" /> Origen
            <span className="h-2.5 w-2.5 rounded-full bg-green-600" /> Destino
            <span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Cadete
          </div>
        </div>
      </div>
    </div>
  );
}

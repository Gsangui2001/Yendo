import { lazy, Suspense } from 'react';

// Carga diferida del mapa: Leaflet (~150 kB) queda fuera del bundle principal
// y solo se baja cuando realmente se muestra un mapa. Mantiene la misma API
// que TrackingMap (mismo named export), así que los consumidores solo cambian
// la ruta del import.
const TrackingMapInner = lazy(() =>
  import('./TrackingMap').then((m) => ({ default: m.TrackingMap }))
);

export function TrackingMap(props) {
  const height = props.height ?? 360;
  return (
    <Suspense
      fallback={
        <div
          className="flex items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 text-sm font-medium text-gray-400"
          style={{ height }}
        >
          Cargando mapa…
        </div>
      }
    >
      <TrackingMapInner {...props} />
    </Suspense>
  );
}

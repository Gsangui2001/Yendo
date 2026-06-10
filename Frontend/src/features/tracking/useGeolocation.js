import { useEffect, useRef } from 'react';
import { apiFetch } from '../../lib/api';

const THROTTLE_MS = 5000; // actualizar GPS cada 5 segundos máximo

/**
 * Transmite la ubicación GPS del cadete al backend mientras esté activo.
 * Se desuscribe automáticamente cuando activo=false o el componente desmonta.
 *
 * @param {string|null} cadeteId  - UUID del cadete
 * @param {boolean}     activo    - true cuando el cadete está disponible o en_viaje
 */
export function useGeolocation(cadeteId, activo) {
  const lastSentRef = useRef(0);
  const watchIdRef  = useRef(null);

  useEffect(() => {
    if (!activo || !cadeteId) return;

    if (!navigator.geolocation) {
      console.warn('[GPS] navigator.geolocation no disponible');
      return;
    }

    function onPosition({ coords }) {
      const now = Date.now();
      if (now - lastSentRef.current < THROTTLE_MS) return;
      lastSentRef.current = now;

      apiFetch(`/api/cadetes/${cadeteId}/ubicacion`, {
        method: 'PUT',
        body: JSON.stringify({ lat: coords.latitude, lng: coords.longitude }),
      }).catch(() => {}); // fallo silencioso — no interrumpir la app
    }

    function onError(err) {
      console.warn('[GPS] Error:', err.message);
    }

    watchIdRef.current = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      maximumAge:         THROTTLE_MS,
      timeout:            10000,
    });

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [cadeteId, activo]);
}

import { supabase } from './supabaseClient';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export async function apiFetch(path, options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const headers = new Headers(options.headers || {});

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  return fetch(url, { ...options, headers });
}

// Extrae un mensaje de error claro de una respuesta no-ok del backend.
// Soporta { error } y { errores: [...] }, con fallback al status.
export async function readApiError(res) {
  try {
    const data = await res.json();
    if (data?.error) return data.error;
    if (Array.isArray(data?.errores) && data.errores.length) return data.errores.join(', ');
  } catch {
    /* respuesta sin JSON */
  }
  return `Error ${res.status}. Probá de nuevo.`;
}

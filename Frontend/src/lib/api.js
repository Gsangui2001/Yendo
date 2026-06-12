import { supabase } from './supabaseClient';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

// Evita que múltiples requests en paralelo disparen varias redirecciones
let redirigiendoLogin = false;

function irALogin() {
  if (redirigiendoLogin) return;
  redirigiendoLogin = true;
  supabase.auth.signOut().catch(() => {}).finally(() => {
    window.location.assign('/login?sesion=vencida');
  });
}

// Sesión vigente: si el token está por vencer (o vencido), intenta refrescar
// UNA vez antes de pegarle al backend.
async function sesionVigente() {
  let { data: { session } } = await supabase.auth.getSession();
  const vence = session?.expires_at ? session.expires_at * 1000 : 0;
  if (session && vence - Date.now() < 30_000) {
    const { data } = await supabase.auth.refreshSession();
    if (data?.session) session = data.session;
  }
  return session;
}

export async function apiFetch(path, options = {}) {
  const session = await sesionVigente();
  const headers = new Headers(options.headers || {});

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  let res = await fetch(url, { ...options, headers });

  // 401 del backend: refrescar sesión y reintentar una vez. Si sigue 401,
  // la sesión murió de verdad: mensaje claro y a loguearse de nuevo.
  if (res.status === 401) {
    const { data } = await supabase.auth.refreshSession();
    if (data?.session?.access_token) {
      headers.set('Authorization', `Bearer ${data.session.access_token}`);
      res = await fetch(url, { ...options, headers });
    }
    if (res.status === 401) irALogin();
  }

  return res;
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

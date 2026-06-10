import { supabase } from '../lib/supabaseAdmin.js';

export async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';

  if (!token) {
    return res.status(401).json({ error: 'Falta token de autenticacion' });
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) {
    return res.status(401).json({ error: 'Sesion invalida o vencida' });
  }

  const { data: perfil, error: perfilError } = await supabase
    .from('perfiles')
    .select('id, rol, nombre')
    .eq('id', authData.user.id)
    .single();

  if (perfilError || !perfil) {
    return res.status(403).json({ error: 'Perfil no encontrado' });
  }

  req.user = authData.user;
  req.perfil = perfil;
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.perfil?.rol)) {
      return res.status(403).json({ error: 'No tenes permisos para esta accion' });
    }
    next();
  };
}

export function isAdmin(req) {
  return req.perfil?.rol === 'admin';
}

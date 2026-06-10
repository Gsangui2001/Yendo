import { Router } from 'express';
import { supabase } from '../lib/supabaseAdmin.js';
import { authenticate, isAdmin, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

async function puedeGestionarComercio(req, comercioId) {
  if (isAdmin(req)) return true;
  if (req.perfil?.rol !== 'comercio') return false;

  const { data } = await supabase
    .from('comercios')
    .select('id, owner_id, activo')
    .eq('id', comercioId)
    .single();

  return Boolean(data && data.owner_id === req.user.id && data.activo);
}

router.post('/', requireRole('comercio', 'admin'), async (req, res) => {
  const { comercio_id, nombre, telefono, direccion, zona } = req.body;

  if (!comercio_id || !nombre?.trim()) {
    return res.status(400).json({ error: 'comercio_id y nombre son requeridos' });
  }

  if (!(await puedeGestionarComercio(req, comercio_id))) {
    return res.status(403).json({ error: 'No podes crear clientes para este comercio' });
  }

  const { data, error } = await supabase
    .from('clientes')
    .insert({
      comercio_id,
      nombre: nombre.trim(),
      telefono: telefono?.trim() || null,
      direccion: direccion?.trim() || null,
      zona: zona || null,
    })
    .select()
    .single();

  if (error) {
    console.error('[POST /api/clientes]', error.message);
    return res.status(500).json({ error: 'No se pudo crear el cliente' });
  }

  return res.status(201).json(data);
});

router.delete('/:id', requireRole('comercio', 'admin'), async (req, res) => {
  const { id } = req.params;

  const { data: cliente, error: buscarError } = await supabase
    .from('clientes')
    .select('id, comercio_id')
    .eq('id', id)
    .single();

  if (buscarError || !cliente) {
    return res.status(404).json({ error: 'Cliente no encontrado' });
  }

  if (!(await puedeGestionarComercio(req, cliente.comercio_id))) {
    return res.status(403).json({ error: 'No podes eliminar clientes de este comercio' });
  }

  const { error } = await supabase.from('clientes').delete().eq('id', id);
  if (error) {
    console.error('[DELETE /api/clientes/:id]', error.message);
    return res.status(500).json({ error: 'No se pudo eliminar el cliente' });
  }

  return res.status(204).send();
});

export default router;

import { Router } from 'express';
import { supabase } from '../lib/supabaseAdmin.js';
import { authenticate, isAdmin, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.post('/', requireRole('privado', 'admin'), async (req, res) => {
  const { usuario_id, nombre, direccion } = req.body;
  const userId = isAdmin(req) ? usuario_id : req.user.id;

  if (!userId || !nombre?.trim() || !direccion?.trim()) {
    return res.status(400).json({ error: 'usuario_id, nombre y direccion son requeridos' });
  }

  if (!isAdmin(req) && usuario_id && usuario_id !== req.user.id) {
    return res.status(403).json({ error: 'No podes crear direcciones para otro usuario' });
  }

  const { data, error } = await supabase
    .from('direcciones')
    .insert({
      usuario_id: userId,
      nombre: nombre.trim(),
      direccion: direccion.trim(),
    })
    .select()
    .single();

  if (error) {
    console.error('[POST /api/direcciones]', error.message);
    return res.status(500).json({ error: 'No se pudo crear la direccion' });
  }

  return res.status(201).json(data);
});

router.delete('/:id', requireRole('privado', 'admin'), async (req, res) => {
  const { id } = req.params;

  const { data: direccion, error: buscarError } = await supabase
    .from('direcciones')
    .select('id, usuario_id')
    .eq('id', id)
    .single();

  if (buscarError || !direccion) {
    return res.status(404).json({ error: 'Direccion no encontrada' });
  }

  if (!isAdmin(req) && direccion.usuario_id !== req.user.id) {
    return res.status(403).json({ error: 'No podes eliminar direcciones de otro usuario' });
  }

  const { error } = await supabase.from('direcciones').delete().eq('id', id);
  if (error) {
    console.error('[DELETE /api/direcciones/:id]', error.message);
    return res.status(500).json({ error: 'No se pudo eliminar la direccion' });
  }

  return res.status(204).send();
});

export default router;

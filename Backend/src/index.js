import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

import ordenesRouter from '../routes/ordenes.js';
import cadetesRouter from '../routes/cadetes.js';
import adminRouter   from '../routes/admin.js';

// ── Supabase ───────────────────────────────────────────────────────────────
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

// ── Express ────────────────────────────────────────────────────────────────
const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

// ── Rutas ──────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/ordenes', ordenesRouter);
app.use('/api/cadetes', cadetesRouter);
app.use('/api/admin',   adminRouter);

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(3001, () => {
  console.log('Servidor corriendo en puerto 3001');
});

import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import ordenesRouter from '../routes/ordenes.js';
import cadetesRouter from '../routes/cadetes.js';
import adminRouter   from '../routes/admin.js';

const PORT = Number(process.env.PORT || 3001);
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY en el entorno del backend.');
}

// ── Express ────────────────────────────────────────────────────────────────
const app = express();

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Origen no permitido por CORS: ${origin}`));
  },
}));
app.use(express.json());

// ── Rutas ──────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/ordenes', ordenesRouter);
app.use('/api/cadetes', cadetesRouter);
app.use('/api/admin',   adminRouter);

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

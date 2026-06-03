import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import ordenesRouter from './routes/ordenes.js';
import cadetesRouter from './routes/cadetes.js';

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

// ── Rutas ──────────────────────────────────────────────────────────────────
app.use('/api/ordenes', ordenesRouter);
app.use('/api/cadetes', cadetesRouter);

// ── Health check ───────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Yendo backend corriendo en http://localhost:${PORT}`);
});

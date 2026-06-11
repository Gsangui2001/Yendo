import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import ordenesRouter from '../routes/ordenes.js';
import cadetesRouter from '../routes/cadetes.js';
import adminRouter   from '../routes/admin.js';
import clientesRouter from '../routes/clientes.js';
import direccionesRouter from '../routes/direcciones.js';
import preciosRouter from '../routes/precios.js';

const PORT = Number(process.env.PORT || 3001);
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// El entorno local de desarrollo siempre puede pegarle al API (loopback no
// es alcanzable desde afuera, no debilita producción).
for (const dev of ['http://localhost:5173', 'http://127.0.0.1:5173']) {
  if (!allowedOrigins.includes(dev)) allowedOrigins.push(dev);
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY en el entorno del backend.');
}

// ── Express ────────────────────────────────────────────────────────────────
const app = express();

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    // Origen desconocido: responder sin headers CORS (el navegador bloquea
    // solo); lanzar un Error acá devolvía 500 con stack trace en el log.
    return callback(null, false);
  },
}));
app.use(express.json({ limit: '100kb' }));

// Tope general: 300 requests por IP cada 5 minutos (el GPS del cadete manda
// 1 cada 5s = 60 por 5min, queda holgado). Escrituras intensas: tope aparte.
app.use(rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes, esperá unos minutos.' },
}));

// ── Rutas ──────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/ordenes', ordenesRouter);
app.use('/api/cadetes', cadetesRouter);
app.use('/api/admin',   adminRouter);
app.use('/api/clientes', clientesRouter);
app.use('/api/direcciones', direccionesRouter);
app.use('/api/precios', preciosRouter);

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

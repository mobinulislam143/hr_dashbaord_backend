import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import authRoutes      from './routes/auth.routes';
import dashboardRoutes from './routes/dashboard.routes';
import applicantRoutes from './routes/applicant.routes';
import repRoutes       from './routes/rep.routes';
import calendarRoutes  from './routes/calendar.routes';
import emailRoutes     from './routes/email.routes';
import { startScheduler } from './lib/scheduler';

const app  = express();
const PORT = process.env.PORT || 5000;

// ─── Allowed origins ─────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  "https://omirahr-dashboard.vercel.app",
  "https://www.omirahr-dashboard.vercel.app",
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

// ─── CORS (must be FIRST, before any routes) ─────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, mobile apps)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin "${origin}" not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400, // Preflight cache: 24 hours
}));

// Handle preflight for ALL routes
app.options('*', cors());

// ─── Security ────────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// ─── Rate limiting ───────────────────────────────────────────────────────────
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 30,
  message: { success: false, message: 'Too many auth requests, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use('/api', rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));

// ─── Logging ─────────────────────────────────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Omira Recruiting API',
    environment: process.env.NODE_ENV,
  });
});

// ─── API routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/applicants', applicantRoutes);
app.use('/api/reps',      repRoutes);
app.use('/api/calendar',  calendarRoutes);
app.use('/api/email',     emailRoutes);

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  // CORS errors
  if (err.message?.startsWith('CORS:')) {
    return res.status(403).json({ success: false, message: err.message });
  }
  console.error('[ERROR]', err.message);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n🚀  Omira API  →  http://localhost:${PORT}`);
  console.log(`❤️   Health     →  http://localhost:${PORT}/health`);
  console.log(`🌐  CORS        →  ${ALLOWED_ORIGINS.join(', ')}`);
  console.log(`📦  Env         →  ${process.env.NODE_ENV}\n`);
  startScheduler();
});

export default app;

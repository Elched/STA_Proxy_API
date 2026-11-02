import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './server/apiRouter.ts';
import { proxyRouter } from './server/proxyRouter.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const isProduction = process.env.NODE_ENV === 'production';

  // Disable x-powered-by to prevent framework fingerprinting
  app.disable('x-powered-by');

  // Request JSON body parsing with strict size limit to prevent payload flooding DoS
  app.use(express.json({ limit: '2mb' }));

  // Security Headers Middleware (Modern 2026 Standards: no deprecated X-XSS-Protection)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  // CORS Headers for API calls
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key, X-Correlation-ID, X-STA-Proxy-Key');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Dedicated Healthcheck endpoints for Docker, Kubernetes, and load balancers
  app.get(['/health', '/healthz'], (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      service: 'thales-sta-proxy',
      version: '1.0.0',
    });
  });

  // In-memory sliding-window rate limiter for brute-force & denial-of-service defense
  const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
  const RATE_LIMIT_MAX = 300; // max requests per window
  const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window

  // Clean stale rate limit entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap.entries()) {
      if (entry.resetAt < now) rateLimitMap.delete(ip);
    }
  }, 5 * 60 * 1000);

  const rateLimiter = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const rawForwarded = req.headers['x-forwarded-for'];
    const clientIp = (typeof rawForwarded === 'string' ? rawForwarded.split(',')[0].trim() : (Array.isArray(rawForwarded) ? rawForwarded[0].trim() : null)) || req.socket.remoteAddress || '127.0.0.1';
    const now = Date.now();
    let record = rateLimitMap.get(clientIp);

    if (!record || record.resetAt < now) {
      record = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
      rateLimitMap.set(clientIp, record);
    } else {
      record.count++;
    }

    const remaining = Math.max(0, RATE_LIMIT_MAX - record.count);
    const resetSec = Math.ceil((record.resetAt - now) / 1000);

    res.setHeader('RateLimit-Limit', RATE_LIMIT_MAX.toString());
    res.setHeader('RateLimit-Remaining', remaining.toString());
    res.setHeader('RateLimit-Reset', resetSec.toString());

    if (record.count > RATE_LIMIT_MAX) {
      return res.status(429).json({
        error: 'Too Many Requests',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this IP address, please try again later.',
        retryAfterSeconds: resetSec,
      });
    }

    next();
  };

  app.use('/proxy', rateLimiter);

  // Mount API Proxy Engine (all calls to /proxy/*)
  app.use('/proxy', proxyRouter);

  // Mount Admin Management Endpoints
  app.use('/api', apiRouter);

  // Mount Vite or Static Frontend
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[STA-API-Proxy] Server listening on http://0.0.0.0:${PORT}`);
    console.log(`[STA-API-Proxy] Proxy gateway active at /proxy/api/v1/*`);
    console.log(`[STA-API-Proxy] Admin endpoints active at /api/*`);
  });

  // Graceful shutdown handling for container runtimes
  const shutdown = () => {
    console.log('[STA-API-Proxy] Received shutdown signal. Closing HTTP server...');
    server.close(() => {
      console.log('[STA-API-Proxy] HTTP server closed gracefully.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer().catch(err => {
  console.error('[STA-API-Proxy] Fatal server startup error:', err);
  process.exit(1);
});

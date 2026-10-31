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

  // Request JSON body parsing with strict size limit to prevent payload flooding DoS
  app.use(express.json({ limit: '2mb' }));

  // Security Headers Middleware
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  // CORS Headers for API calls
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key, X-Correlation-ID');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

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

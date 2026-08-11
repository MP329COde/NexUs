import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';

import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { ensureBootstrapAdmin } from './store/usersStore.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import router from './routes/index.js';

ensureBootstrapAdmin();

const app = express();

app.use(helmet());
app.use(cors({ origin: env.frontendOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/status/health' } }));

// Protège les routes sensibles (auth, écriture de config) contre le bruteforce/abus,
// sans limiter les endpoints de lecture appelés en polling par le dashboard.
const strictLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth/login', strictLimiter);
app.use('/api/settings', strictLimiter);

app.use('/api', router);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.port, () => {
  logger.info(`Nexus Console API démarrée sur http://localhost:${env.port}`);
});

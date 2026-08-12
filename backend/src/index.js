import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';

import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { ensureBootstrapAdmin } from './store/usersStore.js';
import { scheduleDailyBackups } from './services/backupService.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { banlistGuard } from './middleware/banlist.js';
import { trafficLogger } from './middleware/trafficLogger.js';
import router from './routes/index.js';

ensureBootstrapAdmin();
scheduleDailyBackups();

const app = express();

// Nécessaire pour que req.secure reflète le X-Forwarded-Proto envoyé par un
// reverse proxy en amont (nginx du conteneur frontend, Traefik/HAProxy externe)
// plutôt que la connexion brute vers ce process Node (voir cookies de session).
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: env.frontendOrigin, credentials: true }));
// Coupe les IP bannies (Cybersécurité → IPs bannies) avant tout le reste.
app.use(banlistGuard);
// Alimente le pare-feu applicatif (Réseaux → Pare-feu) : trafic temps réel
// et blocage automatique. Placé après banlistGuard pour ne pas comptabiliser
// une requête déjà coupée, et avant express.json() car il ne touche pas au corps.
app.use(trafficLogger);
// 10 Mo plutôt que le défaut 1 Mo : suffisant pour l'import d'une sauvegarde
// SQLite (POST /api/backups/import) sans avoir à relever la limite par route
// (un express.json() déclaré après celui-ci sur une route donnée est un
// no-op : le corps est déjà consommé par ce middleware global).
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/status/health' } }));

// Protège les routes sensibles (auth, écriture de config) contre le bruteforce/abus,
// sans limiter les endpoints de lecture appelés en polling par le dashboard.
const strictLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth/login', strictLimiter);
app.use('/api/auth/password', strictLimiter);
app.use('/api/setup', strictLimiter);
app.use('/api/settings', strictLimiter);
app.use('/api/hosts', strictLimiter);
app.use('/api/backups', strictLimiter);
app.use('/api/identity', strictLimiter);
app.use('/api/security/banlist', strictLimiter);
app.use('/api/vault', strictLimiter);

// Un scan nmap est coûteux (jusqu'à 2 min, charge CPU/réseau) : limite bien
// plus stricte que le reste pour empêcher d'en déclencher en rafale.
const scanLimiter = rateLimit({ windowMs: 10 * 60_000, max: 5, standardHeaders: true, legacyHeaders: false });
app.use('/api/security/scans', scanLimiter);

app.use('/api', router);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.port, () => {
  logger.info(`Nexus Console API démarrée sur http://localhost:${env.port}`);
});

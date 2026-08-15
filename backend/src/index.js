import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';

import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { ensureBootstrapAdmin } from './store/usersStore.js';
import { runMigrations } from './db/migrate.js';
import { recoverInterruptedJobs } from './services/jobService.js';
import { scheduleDailyBackups } from './services/backupService.js';
import { scheduleHourlyStatusSnapshot } from './services/statusHistoryService.js';
import { scheduleCriticalHostsRefresh } from './services/hostMetricsService.js';
import { scheduleInfraLoadSampling } from './services/infraLoadService.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { banlistGuard } from './middleware/banlist.js';
import { trafficLogger } from './middleware/trafficLogger.js';
import router from './routes/index.js';

await runMigrations();
await recoverInterruptedJobs();
ensureBootstrapAdmin();
scheduleDailyBackups();
scheduleHourlyStatusSnapshot();
scheduleCriticalHostsRefresh();
scheduleInfraLoadSampling();

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
// { verify } capture le corps brut avant parsing JSON, sur toutes les
// routes — nécessaire pour vérifier la signature HMAC-SHA256 des webhooks
// GitHub (X-Hub-Signature-256, voir routes/webhooks.routes.js), qui porte
// sur les octets exacts envoyés et non sur une reconstruction JSON.stringify
// potentiellement différente (ordre des clés, espaces...).
app.use(express.json({ limit: '10mb', verify: (req, res, buf) => { req.rawBody = buf; } }));
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
// Le terminal sécurisé exécute des actions Kubernetes réelles (scale,
// restart, delete, exec, apply — voir services/terminalService.js) : au
// moins aussi sensible que le coffre-fort ou la gestion des hôtes, ne
// doit pas rester sans limite alors que toutes les autres routes
// destructrices le sont. /api/kubernetes et /api/proxmox exposent les
// mêmes catégories d'action (scale/restart/rollback/purge/delete un pod,
// démarrer/arrêter/réinitialiser une VM/LXC) directement, sans passer par
// le terminal — protéger uniquement ce dernier aurait laissé la porte
// dérobée grande ouverte par la route directe.
app.use('/api/terminal', strictLimiter);
app.use('/api/kubernetes', strictLimiter);
app.use('/api/proxmox', strictLimiter);

// Un scan nmap est coûteux (jusqu'à 2 min, charge CPU/réseau) : limite bien
// plus stricte que le reste pour empêcher d'en déclencher en rafale.
const scanLimiter = rateLimit({ windowMs: 10 * 60_000, max: 5, standardHeaders: true, legacyHeaders: false });
app.use('/api/security/scans', scanLimiter);

// Point d'entrée public (pas de session, pas de compte derrière la requête
// pour appliquer les limites globales par utilisateur) : limite par IP pour
// empêcher un tiers de bombarder l'endpoint en tentant de deviner un secret
// de webhook par force brute (timingSafeEqual empêche la fuite par timing,
// pas le volume de tentatives).
const webhookLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
app.use('/api/webhooks', webhookLimiter);

// Une installation d'outil déclenche une connexion SSH + un script potentiellement
// long : même logique que scanLimiter, pour empêcher d'en déclencher en rafale
// depuis l'écran d'installation de l'assistant de configuration initiale.
const provisionLimiter = rateLimit({ windowMs: 10 * 60_000, max: 10, standardHeaders: true, legacyHeaders: false });
app.use('/api/setup/provision', provisionLimiter);

app.use('/api', router);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.port, () => {
  logger.info(`Nexus Console API démarrée sur http://localhost:${env.port}`);
});

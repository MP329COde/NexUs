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
import { scheduleVaultRotation } from './services/vaultRotationService.js';
import { scheduleDailySecretLeakScan } from './services/secretLeakScanService.js';
import { scheduleHourlyTrivyScan } from './services/scheduledTrivyScanService.js';
import { scheduleClusterHealthChecks } from './services/kubernetesAlertService.js';
import { scheduleHourlyPreviewCleanup } from './services/previewEnvironmentCleanupService.js';
import { scheduleWazuhAlertChecks } from './services/wazuhAlertNotificationService.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { banlistGuard } from './middleware/banlist.js';
import { trafficLogger } from './middleware/trafficLogger.js';
import { csrfProtection } from './middleware/auth.js';
import router from './routes/index.js';
import { beginStep, markReady } from './services/startupStatusService.js';
import { pool } from './db/pool.js';
import { integrations } from './services/integrationRegistry.js';
import { listTlsIntegrationKeys, diagnoseIntegration } from './services/tlsDiagnosticsService.js';
import dns from 'node:dns/promises';

// Chaque étape de démarrage est chronométrée et son issue mémorisée pour
// GET /api/system/status/startup (voir startupStatusService.js) — c'est le
// minimum viable demandé au Lot A7, complété au Lot D9 avec les étapes
// listées ci-dessous (connexion DB, config, intégrations, certificats,
// réseau) pour couvrir l'écran de bootstrap dédié.
async function runStep(name, fn) {
  const step = beginStep(name);
  try {
    await fn();
    step.ok();
  } catch (err) {
    step.fail(err);
    throw err;
  }
}

// Étape non bloquante : un échec ici ne doit jamais empêcher le reste du
// démarrage (contrairement à runStep ci-dessus) — utilisée pour des
// vérifications de diagnostic (intégrations, certificats, réseau) dont le
// résultat doit être visible sur l'écran de bootstrap sans jamais faire
// planter le process pour autant.
async function runOptionalStep(name, fn) {
  const step = beginStep(name);
  try {
    const detail = await fn();
    step.ok(detail);
  } catch (err) {
    step.degraded({ message: err?.message || String(err) });
  }
}

// Chargement/validation de la configuration (env.js est déjà importé et
// évalué avant ce point — cette étape ne fait donc que vérifier après coup
// que les variables structurantes sont dans un état cohérent, honnêtement:
// elle ne "recharge" rien, dotenv/config a déjà fait son travail à l'import).
await runStep('configLoad', () => {
  if (!env.jwtSecret) throw new Error('JWT_SECRET manquant');
  if (env.jwtSecret === 'dev-only-insecure-secret-change-me') {
    // Ne bloque pas le démarrage (comportement historique de dev conservé),
    // mais reste tracé dans les logs — pas un throw pour ne pas casser cet
    // environnement de développement partagé.
    logger.warn('JWT_SECRET utilise la valeur de développement par défaut — à changer en production.');
  }
});

// Connexion DB : rendue explicite (elle était jusqu'ici implicite dans la
// première requête de runMigrations). Absence de DATABASE_URL = mode
// dégradé documenté (socle organisations/projets désactivé), pas un échec.
await runStep('dbConnection', async () => {
  if (!pool) return; // ok() avec detail resterait plus honnête mais l'API reste simple ici
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
});

await runStep('migrations', runMigrations);
await runStep('recoverInterruptedJobs', recoverInterruptedJobs);
await runStep('ensureBootstrapAdmin', () => ensureBootstrapAdmin());
await runStep('schedulers', () => {
  scheduleDailyBackups();
  scheduleHourlyStatusSnapshot();
  scheduleCriticalHostsRefresh();
  scheduleInfraLoadSampling();
  scheduleVaultRotation();
  scheduleDailySecretLeakScan();
  scheduleHourlyTrivyScan();
  scheduleClusterHealthChecks();
  scheduleHourlyPreviewCleanup();
  scheduleWazuhAlertChecks();
});

// Initialisation plugins (Lot D8) : PAS instrumentée ici volontairement.
// backend/src/services/plugins/pluginRegistry.js n'a aucune fonction de
// bootstrap appelée au démarrage du process (pas d'"init" chargeant les
// plugins actifs en mémoire) — chaque route (routes/plugins.routes.js)
// interroge la table `plugins` en base à la demande via listPlugins()/
// getPlugin(). Il n'y a donc rien de réel à chronométrer ici : ajouter une
// étape "pluginsInit" qui ne ferait qu'un listPlugins() de complaisance
// inventerait une étape de démarrage qui n'existe pas dans le code du Lot
// D8. Si le Lot D8 gagne un jour un vrai chargement en mémoire au boot
// (ex: instancier des workers par plugin actif), une étape runStep()
// dédiée devra être ajoutée ici à ce moment-là.

// Vérification intégrations : statut de chaque intégration configurée
// (integrationRegistry.js), sans bloquer le démarrage — une intégration en
// panne au boot ne doit jamais empêcher NexUs de démarrer.
await runOptionalStep('integrationsCheck', async () => {
  const entries = await Promise.all(Object.entries(integrations).map(async ([key, def]) => {
    try {
      const status = await def.service.getStatus();
      return { key, label: def.label, ...status };
    } catch (err) {
      return { key, label: def.label, configured: true, ok: false, message: err.message };
    }
  }));
  const configured = entries.filter((e) => e.configured);
  const failing = configured.filter((e) => !e.ok);
  if (failing.length > 0) throw new Error(`${failing.length}/${configured.length} intégration(s) configurée(s) en échec: ${failing.map((f) => f.key).join(', ')}`);
  return { configuredCount: configured.length, entries: entries.map((e) => ({ key: e.key, configured: e.configured, ok: e.ok })) };
});

// Vérification certificats : réutilise le diagnostic TLS du Lot B4
// (tlsDiagnosticsService.js) plutôt que d'en dupliquer la logique.
await runOptionalStep('certificatesCheck', async () => {
  const results = await Promise.all(listTlsIntegrationKeys().map(async (key) => {
    try {
      const diag = await diagnoseIntegration(key);
      return { key, configured: diag.configured, ok: diag.configured ? diag.ok !== false : true };
    } catch (err) {
      return { key, configured: false, ok: true, error: err.message };
    }
  }));
  const failing = results.filter((r) => r.configured && !r.ok);
  if (failing.length > 0) throw new Error(`Certificat(s) TLS en échec: ${failing.map((f) => f.key).join(', ')}`);
  return { checked: results.length, entries: results };
});

// Vérification réseau : connectivité de base sortante (résolution DNS
// publique) — ne peut pas vérifier "tout le réseau", seulement un signal
// simple que le process a une résolution DNS/sortie réseau fonctionnelle.
await runOptionalStep('networkCheck', async () => {
  const start = Date.now();
  await dns.lookup('github.com');
  return { dnsLookupMs: Date.now() - start };
});

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
// Une instance PAR route (voir makeScanLimiter ci-dessous pour la même
// remarque) : une seule instance partagée sur 13 chemins ferait cumuler tout
// le polling dashboard (hosts, kubernetes, proxmox...) dans un seul budget de
// 30 req/min, épuisé avant même d'ouvrir Paramètres → Plateforme/Identité —
// c'est précisément ce qui provoquait des 429 sur ces deux pages.
const makeStrictLimiter = () => rateLimit({ windowMs: 60_000, max: env.strictRateLimitMax, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth/login', makeStrictLimiter());
app.use('/api/auth/webauthn', makeStrictLimiter());
app.use('/api/auth/password', makeStrictLimiter());
app.use('/api/setup', makeStrictLimiter());
app.use('/api/settings', makeStrictLimiter());
app.use('/api/hosts', makeStrictLimiter());
app.use('/api/backups', makeStrictLimiter());
app.use('/api/identity', makeStrictLimiter());
app.use('/api/security/banlist', makeStrictLimiter());
app.use('/api/vault', makeStrictLimiter());
// Le terminal sécurisé exécute des actions Kubernetes réelles (scale,
// restart, delete, exec, apply — voir services/terminalService.js) : au
// moins aussi sensible que le coffre-fort ou la gestion des hôtes, ne
// doit pas rester sans limite alors que toutes les autres routes
// destructrices le sont. /api/kubernetes et /api/proxmox exposent les
// mêmes catégories d'action (scale/restart/rollback/purge/delete un pod,
// démarrer/arrêter/réinitialiser une VM/LXC) directement, sans passer par
// le terminal — protéger uniquement ce dernier aurait laissé la porte
// dérobée grande ouverte par la route directe.
app.use('/api/terminal', makeStrictLimiter());
app.use('/api/kubernetes', makeStrictLimiter());
app.use('/api/proxmox', makeStrictLimiter());

// Chaque type de scan coûteux (nmap, Trivy, Semgrep) a sa PROPRE instance de
// limiteur : express-rate-limit compte par store, donc réutiliser la même
// instance sur plusieurs chemins revient à leur faire partager un seul
// budget de 5 requêtes/10 min pour les trois combinés — lancer quelques
// scans Trivy épuisait alors aussi le quota nmap et Semgrep. Un plafond
// dédié par outil est ce qui était réellement voulu par le commentaire
// d'origine ("empêche d'en déclencher en rafale" — par outil, pas au total).
const makeScanLimiter = () => rateLimit({ windowMs: 10 * 60_000, max: 5, standardHeaders: true, legacyHeaders: false });
app.use('/api/security/scans', makeScanLimiter());
// POST uniquement : la lecture de l'historique (GET, y compris le
// run-scheduled déclenché en arrière-plan) ne doit pas partager le même
// budget que le déclenchement d'un scan Trivy coûteux — même raisonnement
// que code-scans/iac-scans/sbom ci-dessous.
const imageScanLimiter = makeScanLimiter();
app.use('/api/image-scans', (req, res, next) => (req.method === 'POST' ? imageScanLimiter(req, res, next) : next()));
// POST uniquement pour le scan de code : la lecture de l'historique (GET) ne
// doit pas être bridée par la même limite que le déclenchement d'un scan
// coûteux, sinon consulter des résultats déjà calculés devient impossible
// pendant 10 min après quelques scans.
const codeScanLimiter = makeScanLimiter();
app.use('/api/code-scans', (req, res, next) => (req.method === 'POST' ? codeScanLimiter(req, res, next) : next()));
const iacScanLimiter = makeScanLimiter();
app.use('/api/iac-scans', (req, res, next) => (req.method === 'POST' ? iacScanLimiter(req, res, next) : next()));
const sbomLimiter = makeScanLimiter();
app.use('/api/sbom', (req, res, next) => (req.method === 'POST' ? sbomLimiter(req, res, next) : next()));
const signaturesLimiter = makeScanLimiter();
app.use('/api/signatures', (req, res, next) => (req.method === 'POST' ? signaturesLimiter(req, res, next) : next()));

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

// Double-submit CSRF : seules les requêtes authentifiées par cookie de
// session sont concernées (voir middleware/auth.js#csrfProtection) — les
// webhooks signés HMAC (routes/webhooks.routes.js) n'envoient jamais ce
// cookie et ne sont donc pas affectés.
app.use('/api', csrfProtection, router);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.port, () => {
  markReady();
  logger.info(`Nexus Console API démarrée sur http://localhost:${env.port}`);
});

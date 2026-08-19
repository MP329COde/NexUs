import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT || 4000),
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me',
  masterKey: process.env.NEXUS_MASTER_KEY || null,
  // Volontairement sans valeur par défaut : s'ils sont absents, aucun compte n'est
  // créé automatiquement et la console affiche l'assistant de première configuration
  // (voir routes/setup.routes.js) plutôt qu'un compte admin/mot de passe devinable.
  adminEmail: process.env.ADMIN_EMAIL || null,
  adminPassword: process.env.ADMIN_PASSWORD || null,
  // Socle relationnel (organisations, équipes, projets, environnements — voir
  // db/). Absent = ces fonctionnalités restent désactivées proprement plutôt
  // que de planter (voir db/pool.js#requirePool) ; le reste de la console
  // (intégrations, coffre-fort, terminal...) continue de fonctionner sur
  // l'ancien store JSON/SQLite sans dépendre de cette variable.
  databaseUrl: process.env.DATABASE_URL || null,
  // Plafond des limiteurs stricts (auth/setup...), voir index.js#makeStrictLimiter.
  // 30 req/min en production (protection bruteforce). La suite Playwright
  // Postgres partage UN SEUL backend jetable entre des dizaines de fichiers
  // *.spec.js, chacun avec son propre login/setup — un plafond de test plus
  // large (STRICT_RATE_LIMIT_MAX) évite des 429 qui ne reflètent aucune
  // vraie tentative de bruteforce, seulement le volume de la suite elle-même.
  strictRateLimitMax: Number(process.env.STRICT_RATE_LIMIT_MAX || 30)
};

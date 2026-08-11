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
  isProd: process.env.NODE_ENV === 'production'
};

import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT || 4000),
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me',
  masterKey: process.env.NEXUS_MASTER_KEY || null,
  adminEmail: process.env.ADMIN_EMAIL || 'admin@homelab.local',
  adminPassword: process.env.ADMIN_PASSWORD || 'changeme',
  isProd: process.env.NODE_ENV === 'production'
};

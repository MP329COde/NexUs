import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '.pw-data-pg');

// Variante Postgres de playwright.config.js : exerce le socle relationnel
// (RBAC projet, incidents, changements, jobs) que la suite par défaut ne
// peut pas couvrir (DATABASE_URL y est volontairement absent — voir
// tests/e2e/setup.spec.js). Nécessite une base jetable déjà migrée :
//
//   docker run --rm -d -p 5434:5432 -e POSTGRES_PASSWORD=x -e POSTGRES_DB=nexus postgres:16-alpine
//   DATABASE_URL=postgres://postgres:x@localhost:5434/nexus node ../backend/src/db/migrate.js
//   DATABASE_URL=postgres://postgres:x@localhost:5434/nexus npx playwright test -c playwright.postgres.config.js
//
// Ignoré proprement (voir tests/e2e-postgres/rbac.spec.js) si DATABASE_URL
// n'est pas défini dans l'environnement qui lance cette commande.
export default defineConfig({
  testDir: './tests/e2e-postgres',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5198',
    trace: 'retain-on-failure'
  },
  webServer: [
    {
      command: 'node ../backend/src/index.js',
      cwd: __dirname,
      env: {
        NEXUS_DATA_DIR: dataDir,
        DATABASE_URL: process.env.DATABASE_URL || '',
        PORT: '4056',
        FRONTEND_ORIGIN: 'http://localhost:5198',
        JWT_SECRET: 'e2e-pg-test-secret',
        ADMIN_EMAIL: '',
        ADMIN_PASSWORD: '',
        // Un seul backend jetable partagé par toute la suite (dizaines de
        // fichiers *.spec.js, chacun avec son propre setup/login) — le
        // plafond de production (30/min) déclenche des 429 qui ne reflètent
        // aucune attaque, seulement le volume de la suite elle-même.
        STRICT_RATE_LIMIT_MAX: '500'
      },
      url: 'http://localhost:4056/api/status/health',
      reuseExistingServer: false,
      stdout: 'pipe'
    },
    {
      command: 'npx vite --port 5198 --strictPort',
      cwd: __dirname,
      env: { NEXUS_API_PROXY_TARGET: 'http://localhost:4056' },
      url: 'http://localhost:5198',
      reuseExistingServer: false,
      stdout: 'pipe'
    }
  ]
});

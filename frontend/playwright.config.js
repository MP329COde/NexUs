import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Répertoire de données jetable : chaque exécution de la suite repart d'une
// console sans utilisateur (needsSetup: true), sans jamais toucher aux
// données de développement réelles (backend/data).
const dataDir = path.join(__dirname, '.pw-data');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    trace: 'retain-on-failure'
  },
  webServer: [
    {
      command: 'node ../backend/src/index.js',
      cwd: __dirname,
      env: {
        NEXUS_DATA_DIR: dataDir,
        PORT: '4055',
        FRONTEND_ORIGIN: 'http://localhost:5199',
        JWT_SECRET: 'e2e-test-secret',
        ADMIN_EMAIL: '',
        ADMIN_PASSWORD: ''
      },
      url: 'http://localhost:4055/api/status/health',
      reuseExistingServer: false,
      stdout: 'pipe'
    },
    {
      command: 'npx vite --port 5199 --strictPort',
      cwd: __dirname,
      env: { NEXUS_API_PROXY_TARGET: 'http://localhost:4055' },
      url: 'http://localhost:5199',
      reuseExistingServer: false,
      stdout: 'pipe'
    }
  ]
});

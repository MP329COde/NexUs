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
  // Un seul worker, explicitement : plusieurs fichiers de test partagent le
  // même backend jetable et le même compte admin créé par setup.spec.js
  // (voir smokeNavigation.spec.js) — sans ce réglage, Playwright peut lancer
  // les fichiers dans des workers séparés en parallèle par défaut, et un
  // fichier qui suppose l'admin déjà créé échouerait de façon non
  // déterministe selon l'ordre d'exécution réel.
  workers: 1,
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

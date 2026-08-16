import { rotateDueSecrets } from '../store/vaultStore.js';
import { logger } from '../utils/logger.js';

// Vérifie toutes les 30s si une entrée a dépassé son échéance de rotation
// (rotationMinutes est borné à 2-5 min, donc un intervalle de contrôle de
// 30s reste assez fin pour rester dans l'ordre de grandeur configuré).
const CHECK_INTERVAL_MS = 30_000;

export function scheduleVaultRotation() {
  const run = () => {
    try {
      const rotated = rotateDueSecrets();
      if (rotated > 0) logger.info(`Rotation automatique : ${rotated} secret(s) régénéré(s).`);
    } catch (err) {
      logger.error({ err }, 'Échec de la rotation automatique des secrets');
    }
    setTimeout(run, CHECK_INTERVAL_MS);
  };
  run();
}

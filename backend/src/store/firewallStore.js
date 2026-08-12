import { readStore, writeStore } from './jsonStore.js';

// Réglages du blocage automatique : combien de requêtes en échec (401/403/429)
// depuis la même IP, sur quelle fenêtre glissante, avant bannissement auto.
const DEFAULTS = { autoBlockEnabled: false, threshold: 8, windowMs: 120_000 };

export function getFirewallSettings() {
  const data = readStore('firewall') || {};
  return {
    autoBlockEnabled: typeof data.autoBlockEnabled === 'boolean' ? data.autoBlockEnabled : DEFAULTS.autoBlockEnabled,
    threshold: Number.isInteger(data.threshold) && data.threshold >= 3 && data.threshold <= 100 ? data.threshold : DEFAULTS.threshold,
    windowMs: DEFAULTS.windowMs
  };
}

export function setAutoBlockEnabled(enabled) {
  const data = readStore('firewall') || {};
  writeStore('firewall', { ...data, autoBlockEnabled: Boolean(enabled) });
  return getFirewallSettings();
}

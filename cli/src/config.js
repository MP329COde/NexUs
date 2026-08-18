import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Config locale du CLI (~/.nexus/config.json) : URL de la console + jeton
// de session réémis en Authorization: Bearer (voir apiClient.js) — jamais
// un second mécanisme d'auth, le même JWT que le cookie de session
// navigateur (middleware/auth.js#requireAuth accepte déjà les deux).
// chmod 600 : le jeton donne un accès complet au compte, comme un mot de
// passe en clair sur disque.
export function configDir(home = os.homedir()) {
  return path.join(home, '.nexus');
}

export function configPath(home) {
  return path.join(configDir(home), 'config.json');
}

export function loadConfig(home) {
  try {
    const raw = fs.readFileSync(configPath(home), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveConfig(config, home) {
  const dir = configDir(home);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = configPath(home);
  fs.writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
  fs.chmodSync(file, 0o600); // umask peut affaiblir le mode passé à writeFileSync
}

export function clearConfig(home) {
  try {
    fs.unlinkSync(configPath(home));
    return true;
  } catch {
    return false;
  }
}

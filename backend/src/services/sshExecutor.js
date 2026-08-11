import { Client } from 'ssh2';
import { getConsoleKeypair } from '../utils/sshKeypair.js';
import { IntegrationError } from './integrations/httpClient.js';

// Exécute un script (toujours issu du catalogue fermé, jamais de saisie libre —
// voir services/agentCatalog.js) sur un hôte via la clé privée dédiée à la
// console. Aucun mot de passe/secret par hôte n'est stocké côté backend.
export function runScript(host, script, { timeoutMs = 90_000 } = {}) {
  return new Promise((resolve, reject) => {
    const { privateKey } = getConsoleKeypair();
    const conn = new Client();
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      conn.end();
      reject(new IntegrationError(`Délai dépassé (${Math.round(timeoutMs / 1000)}s) en exécutant le script sur ${host.address}`, { status: 504 }));
    }, timeoutMs);

    function finish(fn) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    }

    conn.on('ready', () => {
      conn.exec(script, (err, stream) => {
        if (err) return finish(() => { conn.end(); reject(new IntegrationError(err.message, { status: 502 })); });
        stream
          .on('close', (code) => finish(() => { conn.end(); resolve({ exitCode: code, stdout, stderr, ok: code === 0 }); }))
          .on('data', (data) => { stdout += data.toString(); })
          .stderr.on('data', (data) => { stderr += data.toString(); });
      });
    }).on('error', (err) => {
      finish(() => reject(new IntegrationError(`Connexion SSH impossible vers ${host.address}: ${err.message}`, { status: 502 })));
    }).connect({
      host: host.address,
      port: host.port || 22,
      username: host.sshUser || 'root',
      privateKey,
      readyTimeout: 15_000
    });
  });
}

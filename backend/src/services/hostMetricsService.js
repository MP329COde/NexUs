import net from 'node:net';
import { Client } from 'ssh2';
import { getConsoleKeypair } from '../utils/sshKeypair.js';
import * as store from '../store/hostsStore.js';

const REFRESH_MS = 30_000;
const TCP_TIMEOUT_MS = 2_500;
const SSH_TIMEOUT_MS = 6_000;

// Lit CPU %, RAM % et uptime via /proc (Linux uniquement) : deux échantillons
// de /proc/stat à 250ms d'intervalle pour calculer une charge CPU instantanée,
// plus /proc/meminfo et /proc/uptime en une seule commande distante.
const STATS_SCRIPT = `
read a b c d e f g h < /proc/stat; t1=$((b+c+d+e+f+g+h)); i1=$e
sleep 0.25
read a b c d e f g h < /proc/stat; t2=$((b+c+d+e+f+g+h)); i2=$e
dt=$((t2-t1)); di=$((i2-i1))
cpu=$(( dt > 0 ? (100*(dt-di))/dt : 0 ))
mt=$(awk '/MemTotal/{print $2}' /proc/meminfo)
ma=$(awk '/MemAvailable/{print $2}' /proc/meminfo)
ram=$(( mt > 0 ? (100*(mt-ma))/mt : 0 ))
up=$(awk '{print int($1)}' /proc/uptime)
echo "CPU=$cpu RAM=$ram UPTIME=$up"
`.trim();

function probeTcp(address, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(TCP_TIMEOUT_MS);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port || 22, address);
  });
}

function readStats(host) {
  return new Promise((resolve) => {
    const { privateKey } = getConsoleKeypair();
    const conn = new Client();
    let stdout = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      conn.end();
      resolve(null);
    }, SSH_TIMEOUT_MS);

    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    }

    conn.on('ready', () => {
      conn.exec(STATS_SCRIPT, (err, stream) => {
        if (err) return finish(null);
        stream
          .on('close', () => {
            conn.end();
            const m = /CPU=(\d+) RAM=(\d+) UPTIME=(\d+)/.exec(stdout);
            finish(m ? { cpuPct: Number(m[1]), ramPct: Number(m[2]), uptimeSeconds: Number(m[3]) } : null);
          })
          .on('data', (data) => { stdout += data.toString(); })
          .stderr.on('data', () => {});
      });
    }).on('error', () => finish(null))
      .connect({ host: host.address, port: host.port || 22, username: host.sshUser || 'root', privateKey, readyTimeout: SSH_TIMEOUT_MS });
  });
}

let cache = { at: null, byId: {} };

async function refresh() {
  const critical = store.listHosts().filter((h) => h.critical);
  const results = await Promise.all(critical.map(async (h) => {
    const reachable = await probeTcp(h.address, h.port);
    const stats = reachable ? await readStats(h) : null;
    return [h.id, { reachable, ...stats }];
  }));
  cache = { at: new Date().toISOString(), byId: Object.fromEntries(results) };
}

export function getCriticalHostsSnapshot() {
  const critical = store.listHosts().filter((h) => h.critical);
  return {
    generatedAt: cache.at,
    items: critical.map((h) => ({
      id: h.id,
      name: h.name,
      role: h.role || '',
      address: h.address,
      ...(cache.byId[h.id] || { reachable: null })
    }))
  };
}

// Rafraîchissement planifié (pas à chaque requête) pour ne pas déclencher une
// connexion SSH vers chaque hôte critique à chaque chargement de la page
// d'accueil : suit le même principe que scheduleHourlyStatusSnapshot.
export function scheduleCriticalHostsRefresh() {
  const run = () => { refresh().catch(() => {}); setTimeout(run, REFRESH_MS); };
  run();
}

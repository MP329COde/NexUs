import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { integrations } from '../services/integrationRegistry.js';
import { getServiceHistory } from '../services/statusHistoryService.js';
import { list as listProxies } from '../services/proxyService.js';
import { getSamples, getWorkloadCounts } from '../services/infraLoadService.js';
import * as kubernetesService from '../services/integrations/kubernetesService.js';

const router = Router();

// Sonde de vie publique (aucune authentification) pour Docker/systemd/le
// reverse proxy : répond dès que le process Express écoute, sans dépendre
// d'aucune intégration externe. Doit rester avant router.use(requireAuth).
router.get('/health', (req, res) => {
  res.json({ ok: true, status: 'healthy', uptimeSeconds: Math.round(process.uptime()) });
});

router.use(requireAuth);

// Vue d'ensemble consommée par le dashboard "Vue générale": interroge toutes
// les intégrations en parallèle et tolère les échecs individuels (une intégration
// en panne ne doit jamais casser l'affichage des autres).
router.get('/overview', asyncHandler(async (req, res) => {
  const entries = await Promise.all(Object.entries(integrations).map(async ([key, def]) => {
    const startedAt = Date.now();
    try {
      const status = await def.service.getStatus();
      return { key, label: def.label, domain: def.domain, latencyMs: Date.now() - startedAt, ...status };
    } catch (err) {
      return { key, label: def.label, domain: def.domain, configured: true, ok: false, message: err.message, latencyMs: Date.now() - startedAt };
    }
  }));

  const configured = entries.filter((e) => e.configured);
  const healthy = configured.filter((e) => e.ok);
  const score = configured.length ? Math.round((healthy.length / configured.length) * 100) : 0;

  res.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    score,
    integrations: entries
  });
}));

// Disponibilité 24h par service marqué "important" (proxy critique) : une
// ligne par service dans le widget de l'accueil, nom du service à gauche des
// 24 points. Alimentée par recordServiceSnapshot() dans statusHistoryService.js.
router.get('/services', asyncHandler(async (req, res) => {
  const critical = listProxies().filter((p) => p.critical);
  const history = getServiceHistory();
  const now = Date.now();

  const items = critical.map((p) => {
    const hourly = [];
    for (let h = 23; h >= 0; h--) {
      const bucketStart = now - (h + 1) * 60 * 60 * 1000;
      const bucketEnd = now - h * 60 * 60 * 1000;
      const inBucket = history.filter((s) => {
        const t = new Date(s.ts).getTime();
        return t >= bucketStart && t < bucketEnd && s.services && Object.prototype.hasOwnProperty.call(s.services, p.id);
      });
      const last = inBucket[inBucket.length - 1] || null;
      hourly.push(last ? { ok: last.services[p.id] } : null);
    }
    return { id: p.id, name: p.name, domain: p.domain, hourly };
  });

  res.json({ ok: true, items });
}));

// Charge CPU/RAM agrégée des nœuds Proxmox en ligne, échantillonnée toutes les
// 30s en mémoire (voir services/infraLoadService.js) : alimente le graphe
// "Charge de l'infrastructure" de l'accueil. Vide (et donc "Non configuré")
// tant que Proxmox n'est pas configuré.
router.get('/infra-load', (req, res) => {
  res.json({ ok: true, samples: getSamples() });
});

// Répartition des charges (VM/LXC Proxmox, pods Kubernetes) pour le donut de
// l'accueil. Docker n'a pas d'intégration dans la console : toujours null.
router.get('/workloads', asyncHandler(async (req, res) => {
  const workloads = await getWorkloadCounts();
  let pods = null;
  try {
    pods = (await kubernetesService.listPods()).length;
  } catch {
    // Kubernetes non configuré : pods reste null
  }
  res.json({ ok: true, ...workloads, pods });
}));

export default router;

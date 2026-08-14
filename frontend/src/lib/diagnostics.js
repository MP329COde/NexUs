// Moteur de diagnostic à seuils fixes — pas de machine learning, des règles
// lisibles et vérifiables sur des données réelles (disponibilité des pods,
// redémarrages, usage CPU/mémoire vs limites déclarées). Chaque règle produit
// un finding { severity, title, detections, cause, recommendation } ou rien
// si le seuil n'est pas atteint. Volontairement conservateur : en l'absence
// de métriques (metrics-server non installé), les règles CPU/mémoire sont
// simplement ignorées plutôt que de deviner.

function parseCpu(q) {
  if (!q) return null;
  if (q.endsWith('n')) return parseFloat(q) / 1e9;
  if (q.endsWith('m')) return parseFloat(q) / 1000;
  return parseFloat(q);
}

function parseMemory(q) {
  if (!q) return null;
  const units = { Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4, K: 1e3, M: 1e6, G: 1e9, T: 1e12 };
  const match = q.match(/^([\d.]+)([A-Za-z]*)$/);
  if (!match) return null;
  const [, num, unit] = match;
  return parseFloat(num) * (units[unit] || 1);
}

function formatMemory(bytes) {
  if (bytes >= 1024 ** 3) return `${Math.round((bytes / 1024 ** 3) * 10) / 10}Gi`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)}Mi`;
  return `${Math.round(bytes / 1024)}Ki`;
}

export function runDiagnostics({ deploymentName, replicas, ready, limits, pods, metrics }) {
  const findings = [];
  const detections = [];

  detections.push({ label: 'Pods', value: `${ready} / ${replicas} disponibles`, warn: ready < replicas });

  if (ready < replicas) {
    findings.push({
      severity: replicas > 0 && ready / replicas < 0.5 ? 'crit' : 'warn',
      title: `${deploymentName} : disponibilité réduite`,
      cause: `${replicas - ready} pod(s) sur ${replicas} ne sont pas prêts.`,
      recommendation: 'Consultez les événements et les logs des pods concernés (Command Center → pod → Voir les événements) pour identifier la cause (image manquante, sonde de disponibilité en échec, ressources insuffisantes...).'
    });
  }

  const totalRestarts = pods.reduce((s, p) => s + p.restarts, 0);
  const oldestStart = pods.map((p) => p.startedAt).filter(Boolean).sort()[0];
  const hoursUp = oldestStart ? Math.max(0.25, (Date.now() - new Date(oldestStart).getTime()) / 3_600_000) : null;
  const restartRatePerHour = hoursUp ? totalRestarts / hoursUp : null;
  detections.push({ label: 'Redémarrages', value: `${totalRestarts} cumulés${restartRatePerHour !== null ? ` (~${Math.round(restartRatePerHour * 10) / 10}/h)` : ''}`, warn: totalRestarts > 5 });

  if (totalRestarts > 5 && restartRatePerHour !== null && restartRatePerHour > 1) {
    findings.push({
      severity: restartRatePerHour > 5 ? 'crit' : 'warn',
      title: `${deploymentName} : redémarrages fréquents`,
      cause: `~${Math.round(restartRatePerHour * 10) / 10} redémarrage(s) par heure sur l'ensemble des pods — évoque un crash en boucle (CrashLoopBackOff) plutôt qu'un incident isolé.`,
      recommendation: 'Vérifiez les logs du conteneur juste avant un redémarrage et la sonde "liveness" (délai trop court, dépendance externe indisponible au démarrage...).'
    });
  }

  if (metrics && metrics.length > 0) {
    for (const limit of limits) {
      const memLimitBytes = parseMemory(limit.memory);
      const cpuLimitCores = parseCpu(limit.cpu);
      const usages = metrics
        .map((m) => m.containers.find((c) => c.name === limit.name))
        .filter(Boolean);
      if (usages.length === 0) continue;

      if (memLimitBytes) {
        const maxUsage = Math.max(...usages.map((u) => parseMemory(u.memory) || 0));
        const pct = Math.round((maxUsage / memLimitBytes) * 100);
        detections.push({ label: `Mémoire (${limit.name})`, value: `${pct}% de ${limit.memory}`, warn: pct > 80 });
        if (pct > 80) {
          findings.push({
            severity: pct > 95 ? 'crit' : 'warn',
            title: `${deploymentName} : pression mémoire sur "${limit.name}"`,
            cause: `Le conteneur utilise ${pct}% de sa limite mémoire (${limit.memory}).`,
            recommendation: `Augmenter la limite mémoire du conteneur "${limit.name}" (actuellement ${limit.memory} → envisager ${formatMemory(memLimitBytes * 2)}), ou investiguer une fuite mémoire si la croissance est continue.`
          });
        }
      }
      if (cpuLimitCores) {
        const maxUsage = Math.max(...usages.map((u) => parseCpu(u.cpu) || 0));
        const pct = Math.round((maxUsage / cpuLimitCores) * 100);
        detections.push({ label: `CPU (${limit.name})`, value: `${pct}% de ${limit.cpu}`, warn: pct > 80 });
        if (pct > 80) {
          findings.push({
            severity: pct > 95 ? 'crit' : 'warn',
            title: `${deploymentName} : pression CPU sur "${limit.name}"`,
            cause: `Le conteneur utilise ${pct}% de sa limite CPU (${limit.cpu}).`,
            recommendation: `Augmenter la limite CPU du conteneur "${limit.name}", ou ajouter des réplicas (scale) si la charge est répartie plutôt que concentrée sur un pod.`
          });
        }
      }
    }
  } else {
    detections.push({ label: 'Métriques CPU/mémoire', value: 'indisponibles (metrics-server non installé)', warn: false });
  }

  return { detections, findings };
}

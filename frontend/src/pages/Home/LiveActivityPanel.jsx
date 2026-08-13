import Panel from '../../components/ui/Panel.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';

const ACTION_LABELS = {
  'auth.login': 'Connexion', 'auth.login.failed': 'Échec de connexion', 'auth.onboarding.completed': 'Compte finalisé',
  'user.create': 'Utilisateur créé', 'user.update': 'Utilisateur modifié', 'user.delete': 'Utilisateur supprimé',
  'proxy.create': 'Proxy créé', 'proxy.update': 'Proxy modifié', 'proxy.apply': 'Proxy appliqué', 'proxy.delete': 'Proxy supprimé',
  'proxy.attach_frontend': 'Proxy rattaché à un frontend',
  'host.create': 'Hôte ajouté', 'host.update': 'Hôte modifié', 'host.delete': 'Hôte retiré', 'host.agent.install': 'Agent installé',
  'settings.integration.save': 'Intégration configurée', 'backup.create': 'Sauvegarde créée', 'backup.delete': 'Sauvegarde supprimée',
  'backup.import': 'Sauvegarde importée', 'backup.restore': 'Base restaurée',
  'group.create': 'Groupe créé', 'group.update': 'Groupe modifié', 'group.delete': 'Groupe supprimé',
  'inventory.create': 'Actif ajouté', 'inventory.update': 'Actif modifié', 'inventory.delete': 'Actif retiré',
  'kubernetes.deployment.scaled': 'Deployment redimensionné', 'kubernetes.pod.deleted': 'Pod supprimé',
  'security.ip.banned': 'IP bannie', 'security.ip.unbanned': 'IP débannie', 'security.scan.run': 'Scan réseau lancé',
  'security.firewall.autoblock': 'Blocage automatique déclenché',
  'vault.create': 'Secret ajouté', 'vault.delete': 'Secret supprimé', 'vault.reveal': 'Secret révélé',
  'volume.create': 'Volume ajouté', 'volume.delete': 'Volume retiré',
  'identity.update': 'Connexion & identité modifiées', 'git.mirror.enabled': 'Miroir Git activé', 'git.review.approved': 'Revue approuvée',
  'setup.provision.start': 'Provisionnement démarré'
};

function toneForAction(action) {
  if (action.startsWith('security.') || action.includes('delete') || action === 'auth.login.failed') return 'crit';
  if (action.includes('backup') || action.includes('create') || action === 'auth.login') return 'ok';
  return 'info';
}

// "Activité en direct" : fusionne le journal d'audit (actions administratives
// et opérationnelles — voir auditService.js) et les sauvegardes créées, triés
// par horodatage, rafraîchis fréquemment pour un rendu "live". Réservé aux
// administrateurs comme le journal et les sauvegardes eux-mêmes.
export default function LiveActivityPanel() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const audit = useApi(() => (isAdmin ? api.get('/audit?limit=10') : Promise.resolve(null)), [isAdmin], { pollMs: 10000 });
  const backups = useApi(() => (isAdmin ? api.get('/backups') : Promise.resolve(null)), [isAdmin], { pollMs: 30000 });

  if (!isAdmin) {
    return (
      <Panel title="Activité en direct" sub="Derniers événements du parc" span={4}>
        <div style={{ padding: 30, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>Réservé aux administrateurs</div>
      </Panel>
    );
  }

  const auditEvents = (audit.data?.items || []).map((e) => ({
    id: `audit-${e.id}`,
    label: ACTION_LABELS[e.action] || e.action,
    source: e.action.split('.')[0],
    at: e.at,
    tone: toneForAction(e.action)
  }));
  const backupEvents = (backups.data?.items || []).slice(0, 3).map((b) => ({
    id: `backup-${b.file}`,
    label: 'Sauvegarde créée',
    source: 'backup',
    at: b.createdAt,
    tone: 'ok'
  }));

  const events = [...auditEvents, ...backupEvents]
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 8);

  return (
    <Panel title="Activité en direct" sub="Derniers événements du parc" span={4}>
      {events.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>Aucun événement récent</div>
      ) : (
        <div style={{ padding: 6 }}>
          {events.map((e) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '8px 10px' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: `var(--tone-${e.tone}-dot)`, flex: 'none', marginTop: 4 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{e.label}</div>
                <div className="mono faint" style={{ fontSize: 10.5, marginTop: 1 }}>{e.source} · {relativeTime(e.at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function relativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

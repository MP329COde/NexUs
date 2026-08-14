import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';

const ACTION_LABELS = {
  'auth.login': 'Connexion',
  'auth.login.failed': 'Échec de connexion',
  'auth.password.changed': 'Mot de passe changé',
  'setup.completed': 'Configuration initiale',
  'user.create': 'Utilisateur créé',
  'user.update': 'Utilisateur modifié',
  'user.delete': 'Utilisateur supprimé',
  'proxy.create': 'Proxy créé',
  'proxy.update': 'Proxy modifié',
  'proxy.delete': 'Proxy supprimé',
  'proxy.apply': 'Proxy appliqué',
  'host.create': 'Hôte ajouté',
  'host.update': 'Hôte modifié',
  'host.delete': 'Hôte retiré',
  'host.agent.install': 'Agent installé',
  'settings.integration.save': 'Intégration configurée',
  'backup.create': 'Sauvegarde créée',
  'backup.import': 'Sauvegarde importée',
  'backup.restore': 'Base restaurée',
  'backup.delete': 'Sauvegarde supprimée',
  'group.create': 'Groupe créé',
  'group.update': 'Groupe modifié',
  'group.delete': 'Groupe supprimé',
  'inventory.create': 'Actif ajouté',
  'inventory.update': 'Actif modifié',
  'inventory.delete': 'Actif retiré',
  'identity.update': 'Politique de connexion modifiée',
  'security.ip.banned': 'IP bannie',
  'security.ip.unbanned': 'IP débannie',
  'security.scan.run': 'Scan réseau lancé',
  'security.firewall.autoblock': 'Blocage automatique modifié',
  'volume.create': 'Volume ajouté',
  'volume.delete': 'Volume retiré',
  'vault.create': 'Secret ajouté',
  'vault.update': 'Secret modifié',
  'vault.delete': 'Secret supprimé',
  'vault.reveal': 'Secret révélé',
  'project.create': 'Projet créé',
  'project.update': 'Projet modifié',
  'project.delete': 'Projet supprimé',
  'kubernetes.deployment.restarted': 'Deployment redémarré',
  'kubernetes.deployment.scaled': 'Deployment mis à l\'échelle',
  'kubernetes.deployment.rolledback': 'Deployment restauré (rollback)',
  'kubernetes.deployment.purged': 'Deployment purgé',
  'kubernetes.pod.deleted': 'Pod supprimé',
  'argocd.application.synced': 'Application synchronisée',
  'argocd.application.rolledback': 'Application restaurée (rollback)',
  'proxmox.vm.action': 'Action VM/LXC',
  'certmanager.certificate.renewed': 'Certificat renouvelé',
  'pipeline.retried': 'Pipeline relancé'
};

const ACTION_ICON = [
  [/^kubernetes\./, 'k8s'],
  [/^argocd\./, 'sync'],
  [/^proxmox\./, 'inf'],
  [/^certmanager\./, 'certificate'],
  [/^pipeline\./, 'refresh'],
  [/^vault\./, 'lock'],
  [/^security\./, 'shield'],
  [/^backup\./, 'server'],
  [/^project\./, 'folder'],
  [/^auth\./, 'users'],
  [/^user\./, 'users']
];
function iconFor(action) {
  return ACTION_ICON.find(([re]) => re.test(action))?.[1] || 'terminal';
}

function toneFor(action) {
  if (action.endsWith('.failed')) return 'crit';
  if (/purge|delete|banned|rolledback|restore/.test(action)) return 'crit';
  if (/restart|scale|renew|retried|reveal|action/.test(action)) return 'warn';
  return 'mut';
}

// Journal d'audit servant de centre d'actions : toute opération qui modifie
// un système réel (Kubernetes, Argo CD, Proxmox, cert-manager, forges Git,
// coffre-fort, pare-feu...) passe par logAudit() côté backend — cette page
// en est la vue unifiée, avec qui a fait quoi, quand, et depuis quelle IP.
export default function AuditPanel() {
  const { data } = useApi(() => api.get('/audit'), [], { pollMs: 15000 });

  return (
    <Panel title="Journal d'audit — centre d'actions" sub="Chaque action qui modifie un système réel, les 200 dernières" span={12}>
      <DataTable
        columns={['Action', 'Auteur', 'Détails', 'IP', 'Date']}
        rows={data?.items}
        emptyTitle="Aucune action journalisée"
        renderRow={(e) => (
          <tr key={e.id}>
            <td>
              <span className={`badge badge-${toneFor(e.action)}`}>
                <Icon name={iconFor(e.action)} size={11} />{ACTION_LABELS[e.action] || e.action}
              </span>
            </td>
            <td className="mono muted">{e.actorEmail || '—'}</td>
            <td className="mono faint" style={{ fontSize: 11.5, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>{Object.keys(e.meta || {}).length ? JSON.stringify(e.meta) : '—'}</td>
            <td className="mono faint">{e.ip || '—'}</td>
            <td className="mono faint">{new Date(e.at).toLocaleString('fr-FR')}</td>
          </tr>
        )}
      />
    </Panel>
  );
}

import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
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
  'backup.delete': 'Sauvegarde supprimée'
};

function toneFor(action) {
  if (action.endsWith('.failed')) return 'crit';
  if (action.includes('delete') || action === 'backup.restore') return 'warn';
  return 'mut';
}

export default function AuditPanel() {
  const { data } = useApi(() => api.get('/audit'), [], { pollMs: 15000 });

  return (
    <Panel title="Journal d'audit" sub="Actions administratives sensibles, les 200 dernières" span={12}>
      <DataTable
        columns={['Action', 'Auteur', 'Détails', 'Date']}
        rows={data?.items}
        emptyTitle="Aucune action journalisée"
        renderRow={(e) => (
          <tr key={e.id}>
            <td><span className={`badge badge-${toneFor(e.action)}`}><span className="dot" />{ACTION_LABELS[e.action] || e.action}</span></td>
            <td className="mono muted">{e.actorEmail || '—'}</td>
            <td className="mono faint" style={{ fontSize: 11.5, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>{Object.keys(e.meta || {}).length ? JSON.stringify(e.meta) : '—'}</td>
            <td className="mono faint">{new Date(e.at).toLocaleString('fr-FR')}</td>
          </tr>
        )}
      />
    </Panel>
  );
}

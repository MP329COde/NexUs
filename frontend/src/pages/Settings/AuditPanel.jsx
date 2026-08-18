import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import './AuditPanel.css';

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
  'pipeline.retried': 'Pipeline relancé',
  'manifest.change.proposed': 'Modification de manifest proposée (MR/PR)',
  'terminal.command': 'Commande Terminal sécurisé',
  'user.terminal_tier.update': 'Palier Terminal modifié',
  // Internal Developer Platform : organisations, équipes, wiki, catalogue
  // logiciel, scaffolder, blueprints d'environnement — voir routes/{organizations,
  // teams,wiki,catalog,environmentBlueprints}.routes.js.
  'organization.create': 'Organisation créée',
  'organization.update': 'Organisation modifiée',
  'organization.delete': 'Organisation supprimée',
  'organization.member.add': "Membre ajouté à l'organisation",
  'organization.member.role': "Rôle d'organisation modifié",
  'organization.member.remove': "Membre retiré de l'organisation",
  'team.create': 'Équipe créée',
  'team.delete': 'Équipe supprimée',
  'team.member.role': "Rôle d'équipe modifié",
  'team.member.remove': "Membre retiré de l'équipe",
  'wiki.page.create': 'Page de wiki créée',
  'wiki.page.update': 'Page de wiki modifiée',
  'wiki.page.delete': 'Page de wiki supprimée',
  'catalog.component.create': 'Composant ajouté au catalogue',
  'catalog.component.update': 'Composant du catalogue modifié',
  'catalog.component.delete': 'Composant retiré du catalogue',
  'catalog.component.import.create': 'Composant importé (service.yaml)',
  'catalog.component.import.update': 'Composant mis à jour (service.yaml)',
  'catalog.scaffold': 'Service généré depuis un template',
  'environment_blueprint.create': "Blueprint d'environnement créé",
  'environment_blueprint.update': "Blueprint d'environnement modifié",
  'environment_blueprint.delete': "Blueprint d'environnement supprimé",
  'project.environment.create': 'Environnement créé',
  'project.environment.link': 'Environnement lié à Argo CD',
  'project.environment.promote': 'Environnement promu'
};

const ACTION_ICON = [
  [/^catalog\.scaffold/, 'cube'],
  [/^catalog\./, 'box'],
  [/^environment_blueprint\./, 'layers'],
  [/^organization\./, 'users'],
  [/^team\./, 'users'],
  [/^wiki\./, 'book'],
  [/^kubernetes\./, 'k8s'],
  [/^argocd\./, 'sync'],
  [/^proxmox\./, 'inf'],
  [/^certmanager\./, 'certificate'],
  [/^pipeline\./, 'refresh'],
  [/^manifest\./, 'gitBranch'],
  [/^terminal\./, 'terminal'],
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
  const [q, setQ] = useState('');
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (since) params.set('since', new Date(since).toISOString());
  if (until) params.set('until', new Date(until).toISOString());
  const query = params.toString();
  const { data } = useApi(() => api.get(`/audit${query ? `?${query}` : ''}`), [query], { pollMs: 15000 });

  return (
    <Panel
      title="Journal d'audit — centre d'actions"
      sub={`Chaque action qui modifie un système réel${query ? ' — filtré' : ', les 200 dernières'}`}
      span={12}
      actions={(
        <div className="audit-filters">
          <input className="input audit-filter-input" placeholder="Rechercher (action, auteur, IP...)" value={q} onChange={(e) => setQ(e.target.value)} />
          <input className="input audit-filter-date" type="date" value={since} onChange={(e) => setSince(e.target.value)} title="Depuis" />
          <input className="input audit-filter-date" type="date" value={until} onChange={(e) => setUntil(e.target.value)} title="Jusqu'à" />
          <a
            className="btn-outline audit-export-btn"
            href={`/api/audit/export.csv${query ? `?${query}` : ''}`}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="externalLink" size={12} />Exporter CSV
          </a>
        </div>
      )}
    >
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
            <td className="mono faint audit-cell-meta">{Object.keys(e.meta || {}).length ? JSON.stringify(e.meta) : '—'}</td>
            <td className="mono faint">{e.ip || '—'}</td>
            <td className="mono faint">{new Date(e.at).toLocaleString('fr-FR')}</td>
          </tr>
        )}
      />
    </Panel>
  );
}

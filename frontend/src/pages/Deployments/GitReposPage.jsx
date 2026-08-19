import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import Modal from '../../components/ui/Modal.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import ManifestExplorerModal from './ManifestExplorerModal.jsx';
import RepoStructureModal from './RepoStructureModal.jsx';
import './GitReposPage.css';

const ROLE_LABELS = {
  framework: 'Framework de base', service: 'Service applicatif', library: 'Bibliothèque',
  template: 'Template de démarrage', infra: 'Infrastructure as Code', docs: 'Documentation'
};
const ROLE_ICON = { framework: 'layers', service: 'server', library: 'box', template: 'folder', infra: 'inf', docs: 'book' };
const PROVIDER_ICON = { gitlab: 'gitlab', github: 'github' };
const VISIBILITY_TONE = { public: 'ok', internal: 'info', private: 'mut' };
const VISIBILITY_LABEL = { public: 'Public', internal: 'Interne', private: 'Privé' };

function cloneScript(repo) {
  const url = repo.webUrl ? `${repo.webUrl}.git` : `<url-du-dépôt>.git`;
  const dir = repo.name;
  switch (repo.role) {
    case 'framework':
    case 'template':
      return `git clone ${url} ${dir}\ncd ${dir}\nnpm install\ncp .env.example .env 2>/dev/null || true\nnpm run dev`;
    case 'library':
      return `git clone ${url} ${dir}\ncd ${dir}\nnpm install\nnpm run build\nnpm link`;
    case 'service':
      return `git clone ${url} ${dir}\ncd ${dir}\ndocker compose up -d`;
    case 'infra':
      return `git clone ${url} ${dir}\ncd ${dir}\nterraform init\nterraform plan`;
    case 'docs':
      return `git clone ${url} ${dir}`;
    default:
      return `git clone ${url} ${dir}`;
  }
}

// "Dépôts Git" : liste réelle GitLab + GitHub (voir GET /repos), enrichie
// d'étiquettes posées manuellement (rôle du dépôt) qui déclenchent une
// suggestion de script de clonage/usage adaptée. Aucun dépôt n'est fabriqué.
export default function GitReposPage() {
  const { data, reload } = useApi(() => api.get('/repos'), []);
  const notify = useNotify();
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [scriptFor, setScriptFor] = useState(null);
  const [exploring, setExploring] = useState(null);
  const [structuring, setStructuring] = useState(null);
  const [generatingCiFor, setGeneratingCiFor] = useState(null);

  const items = data?.items || [];
  const q = filter.trim().toLowerCase();
  const filtered = q ? items.filter((r) => r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q)) : items;

  const tagged = items.filter((r) => r.role).length;
  const privateCount = items.filter((r) => r.visibility === 'private').length;
  const providers = new Set(items.map((r) => r.provider)).size;

  async function saveMeta(repo, role, tagsText) {
    const tags = tagsText.split(',').map((t) => t.trim()).filter(Boolean);
    try {
      await api.put(`/repos/meta/${encodeURIComponent(repo.key)}`, { role: role || null, tags });
      notify('Étiquettes enregistrées', { type: 'ok' });
      setEditing(null);
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  return (
    <>
      <PageHeader title="Dépôts Git" sub="Dépôts hébergés sur les forges configurées (GitLab, GitHub)." />

      <div className="repos-kpi-grid">
        <KpiCard label="Dépôts" value={items.length} tint="#3B82F6" note={providers > 0 ? `${providers} forge(s) connectée(s)` : 'Aucune forge configurée'} />
        <KpiCard label="Étiquetés" value={tagged} unit={`/ ${items.length || 0}`} tint="#8B5CF6" />
        <KpiCard label="Privés" value={privateCount} tint="#F59E0B" />
      </div>

      <Panel
        title="Dépôts"
        sub="Triés par activité"
        span={12}
        actions={<input className="input repos-filter-input" placeholder="Filtrer…" value={filter} onChange={(e) => setFilter(e.target.value)} />}
      >
        {filtered.length === 0 ? (
          <div className="repos-empty">
            {items.length === 0 ? 'Aucune forge configurée (GitLab/GitHub) — voir Paramètres → Intégrations' : 'Aucun dépôt ne correspond au filtre'}
          </div>
        ) : (
          <div className="repos-table-wrap">
            <table className="repos-table">
              <thead>
                <tr>
                  {['Dépôt', 'Fournisseur', 'Visibilité', 'Branche par défaut', 'Rôle', 'Dernière activité', 'Actions'].map((c) => (
                    <th key={c} className="repos-table-head">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.key} className="repos-table-row">
                    <td className="repos-table-cell repos-cell-name">
                      <Link to={`/deployments/repos/${encodeURIComponent(r.key)}`}>{r.name}</Link>
                      <div className="faint mono repos-cell-path">{r.path}</div>
                    </td>
                    <td className="repos-table-cell">
                      <span className="repos-provider">
                        <Icon name={PROVIDER_ICON[r.provider] || 'gitBranch'} size={13} className="repos-provider-icon" />{r.provider}
                      </span>
                    </td>
                    <td className="repos-table-cell"><span className={`badge badge-${VISIBILITY_TONE[r.visibility]}`}><span className="dot" />{VISIBILITY_LABEL[r.visibility]}</span></td>
                    <td className="repos-table-cell mono muted">{r.defaultBranch}</td>
                    <td className="repos-table-cell">{r.role ? <span className="badge badge-vio"><Icon name={ROLE_ICON[r.role] || 'box'} size={11} />{ROLE_LABELS[r.role]}</span> : <span className="faint">—</span>}</td>
                    <td className="repos-table-cell repos-cell-date">{r.lastActivity ? new Date(r.lastActivity).toLocaleDateString('fr-FR') : '—'}</td>
                    <td className="repos-table-cell">
                      <div className="repos-row-actions">
                        <a href={r.webUrl} target="_blank" rel="noreferrer" className="btn-outline repos-action-btn repos-action-btn-link">
                          <Icon name="externalLink" size={12} />Ouvrir
                        </a>
                        <span className="btn-outline repos-action-btn" onClick={() => setEditing({ key: r.key, name: r.name, role: r.role || '', tags: (r.tags || []).join(', ') })}>
                          <Icon name="edit" size={12} />Étiqueter
                        </span>
                        {r.role && (
                          <span className="btn-outline repos-action-btn" onClick={() => setScriptFor(r)}>
                            <Icon name="terminal" size={12} />Script
                          </span>
                        )}
                        <span className="btn-outline repos-action-btn" onClick={() => setExploring(r)}>
                          <Icon name="folder" size={12} />Manifests
                        </span>
                        <span className="btn-outline repos-action-btn" onClick={() => setStructuring(r)}>
                          <Icon name="layers" size={12} />Structure
                        </span>
                        {r.provider === 'github' && (
                          <span className="btn-outline repos-action-btn" onClick={() => setGeneratingCiFor(r)}>
                            <Icon name="sync" size={12} />Générer CI
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {editing && (
        <Modal title={`Étiqueter « ${editing.name} »`} sub="Rôle du dépôt et étiquettes libres" onClose={() => setEditing(null)} width={460}>
          <div className="repos-modal-form">
            <div>
              <label className="repos-form-label">Rôle</label>
              <select className="input" value={editing.role} onChange={(e) => setEditing((s) => ({ ...s, role: e.target.value }))}>
                <option value="">Aucun rôle</option>
                {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="repos-form-label">Étiquettes</label>
              <input className="input" placeholder="étiquettes séparées par des virgules" value={editing.tags} onChange={(e) => setEditing((s) => ({ ...s, tags: e.target.value }))} />
            </div>
            <div className="repos-form-actions">
              <span className="btn-outline" onClick={() => setEditing(null)}>Annuler</span>
              <button className="btn" onClick={() => saveMeta({ key: editing.key }, editing.role, editing.tags)}>Enregistrer</button>
            </div>
          </div>
        </Modal>
      )}

      {scriptFor && (
        <ScriptModal repo={scriptFor} onClose={() => setScriptFor(null)} />
      )}

      {exploring && (
        <ManifestExplorerModal repo={exploring} onClose={() => setExploring(null)} />
      )}

      {structuring && (
        <RepoStructureModal repo={structuring} onClose={() => setStructuring(null)} />
      )}

      {generatingCiFor && (
        <GenerateCiModal repo={generatingCiFor} onClose={() => setGeneratingCiFor(null)} />
      )}
    </>
  );
}

function GenerateCiModal({ repo, onClose }) {
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function generate() {
    setBusy(true);
    try {
      const res = await api.post(`/repos/${encodeURIComponent(repo.key)}/workflows/generate-ci`, { baseBranch: repo.defaultBranch });
      setResult(res.pullRequest);
      notify('Pull request de workflow créée', { type: 'ok' });
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Générer un workflow GitHub Actions" sub={repo.name} onClose={onClose} width={480}>
      {result ? (
        <div className="repos-generate-result">
          <div className="repos-generate-result-text">Pull request ouverte avec un workflow CI (lint/test/build + SAST Semgrep + SCA Trivy + scan de secrets GitGuardian).</div>
          <a href={result.webUrl} target="_blank" rel="noreferrer" className="btn repos-generate-pr-link">Ouvrir la pull request #{result.number}</a>
        </div>
      ) : (
        <div className="repos-generate-intro">
          <div className="repos-generate-desc">
            Crée <code className="mono">.github/workflows/ci.yml</code> à partir de la stack détectée du dépôt (lint/test/build) avec des jobs de sécurité prêts à l'emploi (Semgrep, Trivy, GitGuardian — vraies actions GitHub, à activer en ajoutant <code className="mono">GITGUARDIAN_API_KEY</code> aux secrets du dépôt) et ouvre une pull request. Rien n'est appliqué directement sur la branche par défaut.
          </div>
          <button className="btn" disabled={busy} onClick={generate}>{busy ? 'Génération…' : 'Générer et ouvrir la pull request'}</button>
        </div>
      )}
    </Modal>
  );
}

function ScriptModal({ repo, onClose }) {
  const notify = useNotify();
  async function copy() {
    await navigator.clipboard.writeText(cloneScript(repo));
    notify('Script copié dans le presse-papiers', { type: 'ok' });
  }
  return (
    <Modal
      title={`${ROLE_LABELS[repo.role]} — utilisation recommandée`}
      sub={repo.name}
      onClose={onClose}
      width={560}
      actions={(
        <span className="btn repos-script-copy-btn" onClick={copy}>
          <Icon name="copy" size={13} />Copier le script
        </span>
      )}
    >
      <pre className="mono repos-script-pre">{cloneScript(repo)}</pre>
    </Modal>
  );
}

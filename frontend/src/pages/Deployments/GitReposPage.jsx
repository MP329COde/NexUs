import { useState } from 'react';
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 16 }}>
        <KpiCard label="Dépôts" value={items.length} tint="#3B82F6" note={providers > 0 ? `${providers} forge(s) connectée(s)` : 'Aucune forge configurée'} />
        <KpiCard label="Étiquetés" value={tagged} unit={`/ ${items.length || 0}`} tint="#8B5CF6" />
        <KpiCard label="Privés" value={privateCount} tint="#F59E0B" />
      </div>

      <Panel
        title="Dépôts"
        sub="Triés par activité"
        span={12}
        actions={<input className="input" placeholder="Filtrer…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ height: 30, fontSize: 12.5, width: 180 }} />}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>
            {items.length === 0 ? 'Aucune forge configurée (GitLab/GitHub) — voir Paramètres → Intégrations' : 'Aucun dépôt ne correspond au filtre'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr>
                  {['Dépôt', 'Fournisseur', 'Visibilité', 'Branche par défaut', 'Rôle', 'Dernière activité', 'Actions'].map((c) => (
                    <th key={c} style={{ textAlign: 'left', padding: '8px 16px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-faint)', borderBottom: '1px solid var(--border-soft)' }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.key} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 600 }}>{r.name}<div className="faint mono" style={{ fontSize: 10.5, fontWeight: 400 }}>{r.path}</div></td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, textTransform: 'capitalize' }}>
                        <Icon name={PROVIDER_ICON[r.provider] || 'gitBranch'} size={13} style={{ color: 'var(--text-faint)' }} />{r.provider}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px' }}><span className={`badge badge-${VISIBILITY_TONE[r.visibility]}`}><span className="dot" />{VISIBILITY_LABEL[r.visibility]}</span></td>
                    <td style={{ padding: '10px 16px' }} className="mono muted">{r.defaultBranch}</td>
                    <td style={{ padding: '10px 16px' }}>{r.role ? <span className="badge badge-vio"><Icon name={ROLE_ICON[r.role] || 'box'} size={11} />{ROLE_LABELS[r.role]}</span> : <span className="faint">—</span>}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-faint)' }}>{r.lastActivity ? new Date(r.lastActivity).toLocaleDateString('fr-FR') : '—'}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <a href={r.webUrl} target="_blank" rel="noreferrer" className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}>
                          <Icon name="externalLink" size={12} />Ouvrir
                        </a>
                        <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setEditing({ key: r.key, name: r.name, role: r.role || '', tags: (r.tags || []).join(', ') })}>
                          <Icon name="edit" size={12} />Étiqueter
                        </span>
                        {r.role && (
                          <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setScriptFor(r)}>
                            <Icon name="terminal" size={12} />Script
                          </span>
                        )}
                        <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setExploring(r)}>
                          <Icon name="folder" size={12} />Manifests
                        </span>
                        <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setStructuring(r)}>
                          <Icon name="layers" size={12} />Structure
                        </span>
                        {r.provider === 'github' && (
                          <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setGeneratingCiFor(r)}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: 'var(--text-muted)' }}>Rôle</label>
              <select className="input" value={editing.role} onChange={(e) => setEditing((s) => ({ ...s, role: e.target.value }))}>
                <option value="">Aucun rôle</option>
                {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: 'var(--text-muted)' }}>Étiquettes</label>
              <input className="input" placeholder="étiquettes séparées par des virgules" value={editing.tags} onChange={(e) => setEditing((s) => ({ ...s, tags: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12.5 }}>Pull request ouverte avec un workflow CI (lint/test/build + SAST Semgrep + SCA Trivy + scan de secrets GitGuardian).</div>
          <a href={result.webUrl} target="_blank" rel="noreferrer" className="btn" style={{ textDecoration: 'none', textAlign: 'center' }}>Ouvrir la pull request #{result.number}</a>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
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
        <span className="btn" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={copy}>
          <Icon name="copy" size={13} />Copier le script
        </span>
      )}
    >
      <pre className="mono" style={{ margin: 0, padding: '10px 12px', borderRadius: 8, background: 'var(--surface-2, var(--bg))', fontSize: 12, overflowX: 'auto' }}>{cloneScript(repo)}</pre>
    </Modal>
  );
}

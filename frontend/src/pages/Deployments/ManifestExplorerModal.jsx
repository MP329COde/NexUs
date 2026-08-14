import { useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import YamlView from '../../components/ui/YamlView.jsx';
import DiffView from '../../components/ui/DiffView.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import { lintYaml } from '../../lib/yamlLint.js';
import { hasChanges, diffLines } from '../../lib/textDiff.js';

const TABS = [
  { id: 'edit', label: 'Modifier' },
  { id: 'preview', label: 'Aperçu' },
  { id: 'diff', label: 'Diff' }
];

// Workflow GitOps complet : parcourir → ouvrir un fichier → modifier →
// valider (YAML) → comparer → committer → ouvrir une MR/PR. Rien n'est
// appliqué au cluster depuis ici — seule une MR/PR est créée, qui suit
// ensuite le circuit normal (CI, revue, merge, puis Argo CD/sync).
export default function ManifestExplorerModal({ repo, onClose }) {
  const [path, setPath] = useState('');
  const [selectedFile, setSelectedFile] = useState(null); // { path, content, sha }
  const [edited, setEdited] = useState('');
  const [tab, setTab] = useState('edit');
  const [proposeOpen, setProposeOpen] = useState(false);
  const notify = useNotify();

  const tree = useApi(() => api.get(`/repos/${encodeURIComponent(repo.key)}/tree?path=${encodeURIComponent(path)}&ref=${encodeURIComponent(repo.defaultBranch)}`), [path]);

  async function openFile(item) {
    if (item.type === 'dir') { setPath(item.path); return; }
    try {
      const res = await api.get(`/repos/${encodeURIComponent(repo.key)}/file?path=${encodeURIComponent(item.path)}&ref=${encodeURIComponent(repo.defaultBranch)}`);
      setSelectedFile({ path: item.path, ...res.file });
      setEdited(res.file.content);
      setTab('edit');
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  const items = tree.data?.items || [];
  const dirs = items.filter((i) => i.type === 'dir');
  const files = items.filter((i) => i.type === 'file');
  const lintIssues = selectedFile ? lintYaml(edited) : [];
  const changed = selectedFile ? hasChanges(diffLines(selectedFile.content, edited)) : false;
  const isYaml = /\.ya?ml$/i.test(selectedFile?.path || '');

  return (
    <Modal title="Explorateur de manifests" sub={`${repo.name} · ${repo.defaultBranch}`} onClose={onClose} width={760}>
      <div style={{ display: 'flex', gap: 16, minHeight: 360 }}>
        <div style={{ width: 220, flex: 'none', borderRight: '1px solid var(--border-soft)', paddingRight: 12, overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 11.5 }}>
            {path && (
              <span className="btn-outline" style={{ height: 22, padding: '0 7px', fontSize: 11 }} onClick={() => setPath(path.split('/').slice(0, -1).join('/'))}>
                <Icon name="chevronDown" size={11} style={{ transform: 'rotate(90deg)' }} />
              </span>
            )}
            <span className="mono faint" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>/{path}</span>
          </div>
          {tree.loading && <div className="faint" style={{ fontSize: 12 }}>Chargement…</div>}
          {tree.error && <div style={{ fontSize: 11.5, color: 'var(--tone-crit-fg)' }}>{tree.error}</div>}
          {dirs.map((d) => (
            <div key={d.path} onClick={() => openFile(d)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', fontSize: 12.5, cursor: 'pointer', borderRadius: 6 }}>
              <Icon name="folder" size={13} style={{ color: 'var(--text-faint)' }} />{d.name}
            </div>
          ))}
          {files.map((f) => (
            <div
              key={f.path}
              onClick={() => openFile(f)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', fontSize: 12.5, cursor: 'pointer', borderRadius: 6, background: selectedFile?.path === f.path ? 'var(--primary-soft)' : 'transparent', color: selectedFile?.path === f.path ? 'var(--primary)' : 'inherit' }}
            >
              <Icon name="edit" size={12} style={{ color: 'var(--text-faint)' }} />{f.name}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {!selectedFile ? (
            <div className="faint" style={{ fontSize: 12.5, textAlign: 'center', padding: 30 }}>Sélectionnez un fichier à gauche</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, borderBottom: '1px solid var(--border-soft)' }}>
                {TABS.map((t) => (
                  <div key={t.id} onClick={() => setTab(t.id)} style={{ padding: '6px 4px', marginRight: 12, fontSize: 12, fontWeight: tab === t.id ? 600 : 500, color: tab === t.id ? 'var(--primary)' : 'var(--text-muted)', borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent', cursor: 'pointer' }}>
                    {t.label}
                  </div>
                ))}
                <div style={{ flex: 1 }} />
                {changed && <span className="badge badge-warn" style={{ alignSelf: 'center' }}>Modifié</span>}
              </div>

              {tab === 'edit' && (
                <textarea
                  className="input mono"
                  value={edited}
                  onChange={(e) => setEdited(e.target.value)}
                  spellCheck={false}
                  style={{ flex: 1, minHeight: 260, resize: 'vertical', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre' }}
                />
              )}
              {tab === 'preview' && (
                <div style={{ flex: 1, overflow: 'auto', border: '1px solid var(--border-soft)', borderRadius: 8, padding: 10 }}>
                  <YamlView text={edited} />
                </div>
              )}
              {tab === 'diff' && (
                <div style={{ flex: 1, overflow: 'auto', border: '1px solid var(--border-soft)', borderRadius: 8, padding: 10 }}>
                  <DiffView oldText={selectedFile.content} newText={edited} context={3} />
                </div>
              )}

              {isYaml && lintIssues.length > 0 && (
                <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: 'var(--tone-warn-soft, var(--primary-soft))' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--tone-warn-fg)', marginBottom: 4 }}>
                    <Icon name="alertTriangle" size={13} />Validation YAML — {lintIssues.length} point(s)
                  </div>
                  {lintIssues.map((issue, i) => (
                    <div key={i} className="mono" style={{ fontSize: 11, color: 'var(--tone-warn-fg)' }}>L{issue.line} · {issue.message}</div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <span
                  className="btn"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: changed ? 'pointer' : 'not-allowed', opacity: changed ? 1 : .5 }}
                  onClick={() => changed && setProposeOpen(true)}
                >
                  <Icon name="gitBranch" size={13} />Proposer la modification (MR/PR)
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {proposeOpen && (
        <ProposeChangeModal
          repo={repo}
          file={selectedFile}
          content={edited}
          onClose={() => setProposeOpen(false)}
          onDone={onClose}
        />
      )}
    </Modal>
  );
}

function ProposeChangeModal({ repo, file, content, onClose, onDone }) {
  const notify = useNotify();
  const [message, setMessage] = useState(`Modifie ${file.path}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post(`/repos/${encodeURIComponent(repo.key)}/propose-change`, {
        path: file.path, content, baseBranch: repo.defaultBranch, sha: file.sha, message, title: message
      });
      setResult(res.mergeRequest);
      notify('Merge/Pull request créée', { type: 'ok' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Proposer la modification" sub={`${repo.name} → ${file.path}`} onClose={result ? onDone : onClose} width={420}>
      {result ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12.5 }}>Merge/Pull request créée avec succès.</div>
          {result.webUrl && (
            <a href={result.webUrl} target="_blank" rel="noreferrer" className="btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', width: 'fit-content' }}>
              <Icon name="externalLink" size={13} />Ouvrir sur la forge
            </a>
          )}
          <div className="faint" style={{ fontSize: 11.5 }}>Suite : revue, CI, merge, puis synchronisation Argo CD (voir GitOps Diff sur la fiche de déploiement).</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <span className="btn" onClick={onDone}>Fermer</span>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: 'var(--text-muted)' }}>Message de commit / titre de la MR</label>
            <input className="input" required value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <div className="faint" style={{ fontSize: 11.5 }}>
            Crée une branche depuis <span className="mono">{repo.defaultBranch}</span>, y committe le fichier modifié, puis ouvre une merge/pull request vers <span className="mono">{repo.defaultBranch}</span>.
          </div>
          {error && <div style={{ fontSize: 12.5, color: 'var(--tone-crit-fg)' }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <span className="btn-outline" onClick={onClose}>Annuler</span>
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Création…' : 'Créer la MR/PR'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

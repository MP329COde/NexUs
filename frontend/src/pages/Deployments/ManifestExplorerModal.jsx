import { useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import Tabs from '../../components/ui/Tabs.jsx';
import LoadingState from '../../components/ui/LoadingState.jsx';
import YamlView from '../../components/ui/YamlView.jsx';
import DiffView from '../../components/ui/DiffView.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import { lintYaml } from '../../lib/yamlLint.js';
import { hasChanges, diffLines } from '../../lib/textDiff.js';
import './ManifestExplorerModal.css';

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
      <div className="mem-body">
        <div className="mem-tree">
          <div className="mem-tree-path-row">
            {path && (
              <span className="btn-outline mem-tree-up-btn" onClick={() => setPath(path.split('/').slice(0, -1).join('/'))}>
                <Icon name="chevronDown" size={11} className="mem-tree-up-icon" />
              </span>
            )}
            <span className="mono faint mem-tree-path">/{path}</span>
          </div>
          {tree.loading && <LoadingState className="mem-tree-loading" />}
          {tree.error && <div className="mem-tree-error">{tree.error}</div>}
          {dirs.map((d) => (
            <div key={d.path} onClick={() => openFile(d)} className="mem-tree-item">
              <Icon name="folder" size={13} className="mem-tree-item-icon" />{d.name}
            </div>
          ))}
          {files.map((f) => (
            <div
              key={f.path}
              onClick={() => openFile(f)}
              className={`mem-tree-item${selectedFile?.path === f.path ? ' mem-tree-item-active' : ''}`}
            >
              <Icon name="edit" size={12} className="mem-tree-item-icon" />{f.name}
            </div>
          ))}
        </div>

        <div className="mem-content">
          {!selectedFile ? (
            <div className="faint mem-content-empty">Sélectionnez un fichier à gauche</div>
          ) : (
            <>
              <Tabs
                tabs={TABS}
                active={tab}
                onChange={setTab}
                className="mem-tabs"
                right={changed && <span className="badge badge-warn mem-changed-badge">Modifié</span>}
              />

              {tab === 'edit' && (
                <textarea
                  className="input mono mem-editor"
                  value={edited}
                  onChange={(e) => setEdited(e.target.value)}
                  spellCheck={false}
                />
              )}
              {tab === 'preview' && (
                <div className="mem-view-box">
                  <YamlView text={edited} />
                </div>
              )}
              {tab === 'diff' && (
                <div className="mem-view-box">
                  <DiffView oldText={selectedFile.content} newText={edited} context={3} />
                </div>
              )}

              {isYaml && lintIssues.length > 0 && (
                <div className="mem-lint">
                  <div className="mem-lint-head">
                    <Icon name="alertTriangle" size={13} />Validation YAML — {lintIssues.length} point(s)
                  </div>
                  {lintIssues.map((issue, i) => (
                    <div key={i} className="mono mem-lint-issue">L{issue.line} · {issue.message}</div>
                  ))}
                </div>
              )}

              <div className="mem-propose-row">
                <span
                  className={`btn mem-propose-btn${changed ? '' : ' mem-propose-btn-disabled'}`}
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
        <div className="pcm-result">
          <div className="pcm-result-text">Merge/Pull request créée avec succès.</div>
          {result.webUrl && (
            <a href={result.webUrl} target="_blank" rel="noreferrer" className="btn-outline pcm-result-link">
              <Icon name="externalLink" size={13} />Ouvrir sur la forge
            </a>
          )}
          <div className="faint pcm-result-note">Suite : revue, CI, merge, puis synchronisation Argo CD (voir GitOps Diff sur la fiche de déploiement).</div>
          <div className="pcm-result-close-row">
            <span className="btn" onClick={onDone}>Fermer</span>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="pcm-form">
          <div>
            <label className="pcm-field-label">Message de commit / titre de la MR</label>
            <input className="input" required value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <div className="faint pcm-form-note">
            Crée une branche depuis <span className="mono">{repo.defaultBranch}</span>, y committe le fichier modifié, puis ouvre une merge/pull request vers <span className="mono">{repo.defaultBranch}</span>.
          </div>
          {error && <div className="pcm-form-error">{error}</div>}
          <div className="pcm-form-actions">
            <span className="btn-outline" onClick={onClose}>Annuler</span>
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Création…' : 'Créer la MR/PR'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

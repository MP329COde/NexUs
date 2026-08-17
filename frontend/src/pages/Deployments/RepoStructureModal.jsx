import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import './RepoStructureModal.css';

// Structure de développement d'un dépôt : stack détectée, présence de CI et
// de Docker Compose, scripts npm éventuels — tout lu en direct sur la
// branche par défaut du dépôt (GET /repos/:key/structure), rien de préconfiguré.
export default function RepoStructureModal({ repo, onClose }) {
  const { data, loading, error } = useApi(() => api.get(`/repos/${encodeURIComponent(repo.key)}/structure?ref=${encodeURIComponent(repo.defaultBranch)}`), []);
  const s = data?.structure;

  return (
    <Modal title="Structure de développement" sub={`${repo.name} · ${repo.defaultBranch}`} onClose={onClose} width={640}>
      {loading && <div className="faint rsm-loading">Analyse de l'arborescence…</div>}
      {error && <div className="rsm-error">{error}</div>}
      {s && (
        <div className="rsm-body">
          <div>
            <div className="rsm-section-title">Stack détectée</div>
            {s.stack.length === 0 ? (
              <div className="faint rsm-empty">Aucun fichier de stack reconnu à la racine du dépôt.</div>
            ) : (
              <div className="rsm-stack-badges">
                {s.stack.map((label) => <span key={label} className="badge badge-vio">{label}</span>)}
                {s.packageManager && <span className="badge badge-info">Gestionnaire : {s.packageManager}</span>}
              </div>
            )}
          </div>

          <div className="rsm-flags-row">
            <div className="rsm-flag">
              <Icon name={s.hasCI ? 'check' : 'xCircle'} size={14} style={{ color: s.hasCI ? 'var(--tone-ok-fg)' : 'var(--text-faint)' }} />
              Pipeline CI {s.hasCI ? 'détecté' : 'absent'}
            </div>
            <div className="rsm-flag">
              <Icon name={s.dockerCompose ? 'check' : 'xCircle'} size={14} style={{ color: s.dockerCompose ? 'var(--tone-ok-fg)' : 'var(--text-faint)' }} />
              Docker Compose {s.dockerCompose ? 'détecté' : 'absent'}
            </div>
          </div>

          {s.packageJson && (
            <div>
              <div className="rsm-section-title">package.json</div>
              <div className="rsm-pkg-summary">
                {s.packageJson.name && <>« {s.packageJson.name} » — </>}
                {s.packageJson.dependenciesCount} dépendance(s), {s.packageJson.devDependenciesCount} dépendance(s) de dev
              </div>
              {Object.keys(s.packageJson.scripts).length > 0 && (
                <pre className="mono rsm-scripts-pre">
                  {Object.entries(s.packageJson.scripts).map(([name, cmd]) => `${name}: ${cmd}`).join('\n')}
                </pre>
              )}
            </div>
          )}

          <div>
            <div className="rsm-section-title">Racine du dépôt</div>
            <div className="rsm-root-list">
              {s.root.map((item) => (
                <div key={item.path} className="rsm-root-item">
                  <Icon name={item.type === 'dir' ? 'folder' : 'box'} size={13} className="rsm-root-item-icon" />
                  <span className={item.type === 'dir' ? '' : 'mono'}>{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

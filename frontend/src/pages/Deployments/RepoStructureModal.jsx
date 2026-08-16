import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';

// Structure de développement d'un dépôt : stack détectée, présence de CI et
// de Docker Compose, scripts npm éventuels — tout lu en direct sur la
// branche par défaut du dépôt (GET /repos/:key/structure), rien de préconfiguré.
export default function RepoStructureModal({ repo, onClose }) {
  const { data, loading, error } = useApi(() => api.get(`/repos/${encodeURIComponent(repo.key)}/structure?ref=${encodeURIComponent(repo.defaultBranch)}`), []);
  const s = data?.structure;

  return (
    <Modal title="Structure de développement" sub={`${repo.name} · ${repo.defaultBranch}`} onClose={onClose} width={640}>
      {loading && <div className="faint" style={{ fontSize: 12.5 }}>Analyse de l'arborescence…</div>}
      {error && <div style={{ fontSize: 12.5, color: 'var(--tone-crit-fg)' }}>{error}</div>}
      {s && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-faint)', marginBottom: 8 }}>Stack détectée</div>
            {s.stack.length === 0 ? (
              <div className="faint" style={{ fontSize: 12.5 }}>Aucun fichier de stack reconnu à la racine du dépôt.</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {s.stack.map((label) => <span key={label} className="badge badge-vio">{label}</span>)}
                {s.packageManager && <span className="badge badge-info">Gestionnaire : {s.packageManager}</span>}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}>
              <Icon name={s.hasCI ? 'check' : 'xCircle'} size={14} style={{ color: s.hasCI ? 'var(--tone-ok-fg)' : 'var(--text-faint)' }} />
              Pipeline CI {s.hasCI ? 'détecté' : 'absent'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}>
              <Icon name={s.dockerCompose ? 'check' : 'xCircle'} size={14} style={{ color: s.dockerCompose ? 'var(--tone-ok-fg)' : 'var(--text-faint)' }} />
              Docker Compose {s.dockerCompose ? 'détecté' : 'absent'}
            </div>
          </div>

          {s.packageJson && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-faint)', marginBottom: 8 }}>package.json</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 8 }}>
                {s.packageJson.name && <>« {s.packageJson.name} » — </>}
                {s.packageJson.dependenciesCount} dépendance(s), {s.packageJson.devDependenciesCount} dépendance(s) de dev
              </div>
              {Object.keys(s.packageJson.scripts).length > 0 && (
                <pre className="mono" style={{ margin: 0, padding: '10px 12px', borderRadius: 8, background: 'var(--surface-2, var(--bg))', fontSize: 12, overflowX: 'auto' }}>
                  {Object.entries(s.packageJson.scripts).map(([name, cmd]) => `${name}: ${cmd}`).join('\n')}
                </pre>
              )}
            </div>
          )}

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-faint)', marginBottom: 8 }}>Racine du dépôt</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {s.root.map((item) => (
                <div key={item.path} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, padding: '3px 0' }}>
                  <Icon name={item.type === 'dir' ? 'folder' : 'box'} size={13} style={{ color: 'var(--text-faint)' }} />
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

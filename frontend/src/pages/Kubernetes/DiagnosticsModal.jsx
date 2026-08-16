import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { runDiagnostics } from '../../lib/diagnostics.js';

// Diagnostic automatique : agrège des signaux réels déjà présents dans le
// cluster (pods prêts, redémarrages, usage vs limites) et applique des
// règles à seuils fixes (lib/diagnostics.js) — pas de détection magique,
// juste ce qu'un administrateur vérifierait à la main, dans l'ordre.
export default function DiagnosticsModal({ namespace, name, onClose }) {
  const { data, loading, error } = useApi(() => api.get(`/kubernetes/deployments/${namespace}/${name}/diagnostics`), [namespace, name]);
  const { data: linkData } = useApi(() => api.get(`/kubernetes/deployments/${namespace}/${name}/links`), [namespace, name]);

  const result = data ? runDiagnostics({ deploymentName: name, ...data }) : null;
  const worst = result?.findings.some((f) => f.severity === 'crit') ? 'crit' : result?.findings.length ? 'warn' : 'ok';
  const link = linkData?.link;
  const gitWebUrl = link?.gitProvider === 'github' && link.githubOwner && link.githubRepo
    ? `https://github.com/${link.githubOwner}/${link.githubRepo}`
    : null;

  return (
    <Modal
      title={(
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name={worst === 'ok' ? 'check' : 'alertTriangle'} size={16} style={{ color: `var(--tone-${worst}-fg)` }} />
          {name}
        </span>
      )}
      sub={`${namespace} · diagnostic automatique`}
      onClose={onClose}
      width={520}
    >
      {loading && <div className="faint" style={{ fontSize: 12.5 }}>Analyse en cours…</div>}
      {error && <div style={{ fontSize: 12.5, color: 'var(--tone-crit-fg)' }}>{error}</div>}

      {link && (link.argocdWebUrl || gitWebUrl) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {gitWebUrl && (
            <a href={gitWebUrl} target="_blank" rel="noreferrer" className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}>
              <Icon name="gitBranch" size={12} />Dépôt Git
            </a>
          )}
          {link.argocdWebUrl && (
            <a href={link.argocdWebUrl} target="_blank" rel="noreferrer" className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}>
              <Icon name="argocd" size={12} />Application Argo CD
            </a>
          )}
        </div>
      )}

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <SectionTitle>Détection</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {result.detections.map((d, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span className="faint">{d.label}</span>
                  <span className="mono" style={{ color: d.warn ? 'var(--tone-warn-fg)' : 'inherit', fontWeight: d.warn ? 600 : 500 }}>{d.value}</span>
                </div>
              ))}
            </div>
          </div>

          {result.findings.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, borderRadius: 8, background: 'var(--tone-ok-soft, var(--primary-soft))', fontSize: 12.5, color: 'var(--tone-ok-fg)' }}>
              <Icon name="check" size={15} />Aucune anomalie détectée sur les signaux disponibles.
            </div>
          ) : (
            result.findings.map((f, i) => (
              <div key={i}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span className={`badge badge-${f.severity}`}><span className="dot" />{f.severity === 'crit' ? 'Critique' : 'Avertissement'}</span>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <SectionTitle>Cause probable</SectionTitle>
                  <div style={{ fontSize: 12.5 }}>{f.cause}</div>
                </div>
                <div>
                  <SectionTitle>Recommandation</SectionTitle>
                  <div style={{ fontSize: 12.5, padding: 10, borderRadius: 8, background: 'var(--surface-2, var(--bg))' }}>{f.recommendation}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </Modal>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-faintest)', marginBottom: 6, borderBottom: '1px solid var(--border-soft)', paddingBottom: 4 }}>
      {children}
    </div>
  );
}

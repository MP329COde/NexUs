import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { runDiagnostics } from '../../lib/diagnostics.js';
import './DiagnosticsModal.css';

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
        <span className="diag-title">
          <Icon name={worst === 'ok' ? 'check' : 'alertTriangle'} size={16} style={{ color: `var(--tone-${worst}-fg)` }} />
          {name}
        </span>
      )}
      sub={`${namespace} · diagnostic automatique`}
      onClose={onClose}
      width={520}
    >
      {loading && <div className="faint diag-loading">Analyse en cours…</div>}
      {error && <div className="diag-error">{error}</div>}

      {link && (link.argocdWebUrl || gitWebUrl) && (
        <div className="diag-links">
          {gitWebUrl && (
            <a href={gitWebUrl} target="_blank" rel="noreferrer" className="btn-outline diag-link-btn">
              <Icon name="gitBranch" size={12} />Dépôt Git
            </a>
          )}
          {link.argocdWebUrl && (
            <a href={link.argocdWebUrl} target="_blank" rel="noreferrer" className="btn-outline diag-link-btn">
              <Icon name="argocd" size={12} />Application Argo CD
            </a>
          )}
        </div>
      )}

      {result && (
        <div className="diag-body">
          <div>
            <SectionTitle>Détection</SectionTitle>
            <div className="diag-detections">
              {result.detections.map((d, i) => (
                <div key={i} className="diag-detection-row">
                  <span className="faint">{d.label}</span>
                  <span className={`mono ${d.warn ? 'diag-detection-value-warn' : 'diag-detection-value'}`}>{d.value}</span>
                </div>
              ))}
            </div>
          </div>

          {result.findings.length === 0 ? (
            <div className="diag-ok-banner">
              <Icon name="check" size={15} />Aucune anomalie détectée sur les signaux disponibles.
            </div>
          ) : (
            result.findings.map((f, i) => (
              <div key={i}>
                <div className="diag-finding-head">
                  <span className={`badge badge-${f.severity}`}><span className="dot" />{f.severity === 'crit' ? 'Critique' : 'Avertissement'}</span>
                </div>
                <div className="diag-finding-cause">
                  <SectionTitle>Cause probable</SectionTitle>
                  <div className="diag-finding-cause-text">{f.cause}</div>
                </div>
                <div>
                  <SectionTitle>Recommandation</SectionTitle>
                  <div className="diag-finding-recommendation">{f.recommendation}</div>
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
    <div className="diag-section-title">
      {children}
    </div>
  );
}

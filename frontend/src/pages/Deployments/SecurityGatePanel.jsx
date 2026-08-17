import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import './ScanPanels.css';

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString('fr-FR') : null;
}

// Décision calculée à partir des VRAIS derniers scans (Semgrep, Checkov,
// OWASP ZAP) déjà affichés plus haut sur cette page — plus une maquette
// à chiffres fixes. Chaque outil a sa propre échelle de sévérité (Semgrep :
// ERROR/WARNING/INFO, ZAP : High/Medium/Low, Checkov : pas de sévérité,
// juste des vérifications échouées) : on ne les fusionne pas en une fausse
// taxonomie "Critical/High/Medium" commune, on affiche et bloque sur le
// vrai signal de chaque outil, honnêtement.
export default function SecurityGatePanel() {
  const codeScans = useApi(() => api.get('/code-scans'), []);
  const iacScans = useApi(() => api.get('/iac-scans'), []);
  const dastScans = useApi(() => api.get('/dast-scans'), []);

  const loading = codeScans.loading || iacScans.loading || dastScans.loading;
  const lastCode = codeScans.data?.items?.[0] || null;
  const lastIac = iacScans.data?.items?.[0] || null;
  const lastDast = dastScans.data?.items?.[0] || null;

  const semgrepErrors = lastCode?.counts?.ERROR ?? 0;
  const zapHigh = lastDast?.counts?.High ?? 0;
  const checkovFailed = lastIac?.total ?? 0;

  const noScanYet = !lastCode && !lastIac && !lastDast;
  const blocked = semgrepErrors > 0 || zapHigh > 0;

  return (
    <Panel title="Security Gate" sub="Décision calculée à partir des derniers scans réels lancés ci-dessus" span={12}>
      <div className="scp-gate-body">
        {noScanYet ? (
          <div className="faint scp-gate-rule">
            Aucun scan encore lancé — la décision reste indisponible tant que Semgrep, Checkov ou OWASP ZAP n'ont pas tourné au moins une fois (voir les panneaux ci-dessus).
          </div>
        ) : (
          <>
            <div className="scp-gate-counts">
              <span>Semgrep — ERROR : <strong className="mono">{lastCode ? semgrepErrors : '—'}</strong></span>
              <span>ZAP — High : <strong className="mono">{lastDast ? zapHigh : '—'}</strong></span>
              <span>Checkov — échecs : <strong className="mono">{lastIac ? checkovFailed : '—'}</strong></span>
            </div>
            <div className={`scp-gate-verdict${blocked ? ' scp-gate-verdict-blocked' : ''}`}>
              <Icon name={blocked ? 'xCircle' : 'check'} size={15} />
              {blocked
                ? 'Déploiement bloqué — au moins une erreur Semgrep ou une alerte ZAP à risque élevé sur le dernier scan'
                : 'Déploiement autorisé — aucune erreur Semgrep ni alerte ZAP à risque élevé sur les derniers scans disponibles'}
            </div>
            <div className="faint scp-gate-rule">
              Règle : bloque si le dernier scan Semgrep contient au moins une erreur (ERROR) ou si le dernier scan OWASP ZAP contient au moins une alerte à risque élevé (High). Checkov (IaC) est affiché à titre informatif — pas encore un critère bloquant.
              {lastCode && ` Dernier scan Semgrep : ${formatDate(lastCode.scannedAt)}.`}
              {lastDast && ` Dernier scan ZAP : ${formatDate(lastDast.scannedAt)}.`}
            </div>
          </>
        )}
        {loading && <div className="faint scp-gate-rule">Chargement des derniers scans…</div>}
      </div>
    </Panel>
  );
}

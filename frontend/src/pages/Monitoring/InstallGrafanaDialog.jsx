import { useState } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import '../Infrastructure/InstallAgentDialog.css';

// Réutilise le catalogue de services (serviceCatalog.js, même script que
// l'assistant de première installation) sur un hôte déjà géré depuis
// Infrastructure → Hôtes & agents, plutôt que de dupliquer la logique
// d'installation : voir routes/hosts.routes.js POST /:id/services/:serviceId/install.
export default function InstallGrafanaDialog({ onClose, onInstalled }) {
  const hosts = useApi(() => api.get('/hosts'), []);
  const [hostId, setHostId] = useState(null);
  const [script, setScript] = useState(null);
  const [scriptError, setScriptError] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const notify = useNotify();

  const host = hosts.data?.items?.find((h) => h.id === hostId);

  async function pickHost(h) {
    setHostId(h.id);
    setScript(null);
    setScriptError(null);
    setResult(null);
    try {
      const res = await api.get(`/hosts/services/grafana/preview?address=${encodeURIComponent(h.address)}`);
      setScript(res.script);
    } catch (err) {
      setScriptError(err.message);
    }
  }

  async function install() {
    setBusy(true);
    try {
      const res = await api.post(`/hosts/${hostId}/services/grafana/install`, {});
      setResult(res.result);
      if (res.result.ok) {
        notify(`Grafana installé sur ${host.name} (port ${res.port || 3000})`, { type: 'ok' });
        onInstalled();
      } else {
        notify(`Échec de l'installation (code ${res.result.exitCode})`, { type: 'crit' });
      }
    } catch (err) {
      notify(err.message, { type: 'crit', title: 'Connexion SSH échouée' });
      setResult({ ok: false, stdout: '', stderr: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="iad-overlay" onClick={onClose}>
      <div className="card iad-card" onClick={(e) => e.stopPropagation()}>
        <div className="iad-title">Installer Grafana automatiquement</div>
        <div className="faint iad-subtitle">
          Choisissez un hôte déjà géré (Infrastructure → Hôtes & agents) : un conteneur Docker Grafana officiel y sera installé via la clé SSH de la console, exactement comme lors de l'assistant de première installation.
        </div>

        {!hostId && (
          <div className="iad-catalog">
            {(hosts.data?.items?.length ?? 0) === 0 && (
              <div className="faint">
                Aucun hôte géré pour l'instant. Ajoutez-en un depuis{' '}
                <a href="/infrastructure/hosts">Infrastructure → Hôtes &amp; agents</a>, puis revenez ici.
              </div>
            )}
            {hosts.data?.items?.map((h) => (
              <div key={h.id} className="btn-outline iad-catalog-item" onClick={() => pickHost(h)}>
                <div className="iad-catalog-item-label">{h.name}</div>
                <div className="faint iad-catalog-item-desc">{h.address}:{h.port} · {h.role || 'rôle non défini'}</div>
              </div>
            ))}
          </div>
        )}

        {hostId && !result && (
          <>
            <div className="iad-script-label">Script qui sera exécuté sur {host?.name} :</div>
            {scriptError
              ? <div className="iad-script-error">{scriptError}</div>
              : (
                <pre className="mono iad-script-pre">{script || 'Chargement…'}</pre>
              )}
            <div className="iad-actions">
              <span className="btn-outline" onClick={() => setHostId(null)}>Retour</span>
              <button className="btn" onClick={install} disabled={busy || !script}>{busy ? 'Installation…' : "Confirmer l'installation"}</button>
            </div>
          </>
        )}

        {result && (
          <>
            <div className={`badge badge-${result.ok ? 'ok' : 'crit'} iad-result-badge`}>
              <span className="dot" />{result.ok ? 'Installation réussie' : "Échec de l'installation"}
            </div>
            {result.ok && (
              <div className="faint" style={{ marginBottom: 10 }}>
                Grafana écoute maintenant sur <span className="mono">http://{host?.address}:3000</span>. Créez-y un compte de service (Administration → Service accounts) puis renseignez l'URL et la clé API dans Paramètres → Grafana pour terminer le branchement.
              </div>
            )}
            {result.stdout && <pre className="mono iad-result-stdout">{result.stdout}</pre>}
            {result.stderr && <pre className="mono iad-result-stderr">{result.stderr}</pre>}
            <div className="iad-actions-single">
              <span className="btn-outline" onClick={onClose}>Fermer</span>
            </div>
          </>
        )}

        {!hostId && (
          <div className="iad-actions-single">
            <span className="btn-outline" onClick={onClose}>Annuler</span>
          </div>
        )}
      </div>
    </div>
  );
}

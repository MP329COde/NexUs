import { useState } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import '../Infrastructure/InstallAgentDialog.css';

// Lot D4 (Groupe D) — l'app n'impose plus de créer/choisir une machine SSH
// pour installer un outil : cette modale interroge GET
// /hosts/services/install-targets pour savoir, honnêtement, ce qui est
// réellement disponible dans CET environnement (hôte(s) déjà géré(s),
// cluster(s) Kubernetes configuré(s), Proxmox) et ne propose que les cibles
// réellement fonctionnelles — jamais une option qui échouerait faute
// d'intégration configurée. Voir routes/hosts.routes.js POST
// /hosts/services/:serviceId/install (cible explicite {type,...}).
export default function InstallGrafanaDialog({ onClose, onInstalled }) {
  const serviceId = 'grafana';
  const targets = useApi(() => api.get('/hosts/services/install-targets'), []);
  const [targetType, setTargetType] = useState(null); // 'ssh-host' | 'kubernetes'
  const [hostId, setHostId] = useState(null);
  const [clusterId, setClusterId] = useState(null);
  const [script, setScript] = useState(null);
  const [scriptError, setScriptError] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const notify = useNotify();

  const hosts = targets.data?.sshHost?.hosts || [];
  const clusters = targets.data?.kubernetes?.clusters || [];
  const host = hosts.find((h) => h.id === hostId);

  async function pickHost(h) {
    setHostId(h.id);
    setScript(null);
    setScriptError(null);
    setResult(null);
    try {
      const res = await api.get(`/hosts/services/${serviceId}/preview?address=${encodeURIComponent(h.address)}`);
      setScript(res.script);
    } catch (err) {
      setScriptError(err.message);
    }
  }

  async function installOnHost() {
    setBusy(true);
    try {
      const res = await api.post(`/hosts/services/${serviceId}/install`, { target: { type: 'ssh-host', hostId } });
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

  async function installOnKubernetes(cId) {
    setClusterId(cId);
    setBusy(true);
    try {
      const res = await api.post(`/hosts/services/${serviceId}/install`, { target: { type: 'kubernetes', clusterId: cId } });
      setResult(res.result);
      notify('Grafana déployé sur le cluster Kubernetes (Deployment + Service)', { type: 'ok' });
      onInstalled();
    } catch (err) {
      notify(err.message, { type: 'crit', title: 'Déploiement Kubernetes échoué' });
      setResult({ ok: false, stdout: '', stderr: err.message });
    } finally {
      setBusy(false);
    }
  }

  const step = result ? 'result' : targetType === 'ssh-host' ? (hostId ? 'ssh-confirm' : 'ssh-pick') : targetType === 'kubernetes' ? 'k8s-pick' : 'target';

  return (
    <div className="iad-overlay" onClick={onClose}>
      <div className="card iad-card" onClick={(e) => e.stopPropagation()}>
        <div className="iad-title">Installer Grafana automatiquement</div>

        {step === 'target' && (
          <>
            <div className="faint iad-subtitle">
              Choisissez où installer Grafana. Seules les cibles réellement configurées dans cet environnement sont proposées.
            </div>
            {targets.loading && <div className="faint">Chargement des cibles disponibles…</div>}
            {!targets.loading && (
              <div className="iad-catalog">
                <div className="btn-outline iad-catalog-item" onClick={() => setTargetType('ssh-host')}>
                  <div className="iad-catalog-item-label">Hôte déjà géré (SSH)</div>
                  <div className="faint iad-catalog-item-desc">
                    {hosts.length > 0 ? `${hosts.length} hôte(s) disponible(s), ou ajout d'une nouvelle machine par adresse` : "Aucun hôte géré pour l'instant — vous pourrez en ajouter un ou saisir une adresse directement"}
                  </div>
                </div>
                <div
                  className={`btn-outline iad-catalog-item${clusters.length === 0 ? ' disabled' : ''}`}
                  onClick={() => clusters.length > 0 && setTargetType('kubernetes')}
                  style={clusters.length === 0 ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                >
                  <div className="iad-catalog-item-label">Cluster Kubernetes</div>
                  <div className="faint iad-catalog-item-desc">
                    {clusters.length > 0 ? `Déployer sur : ${clusters.map((c) => c.name).join(', ')}` : 'Aucun cluster Kubernetes configuré (Paramètres → Kubernetes)'}
                  </div>
                </div>
                <div className="btn-outline iad-catalog-item" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                  <div className="iad-catalog-item-label">Proxmox (VM/LXC dédiée)</div>
                  <div className="faint iad-catalog-item-desc">
                    {targets.data?.proxmox?.reason || 'Indisponible'}
                  </div>
                </div>
              </div>
            )}
            <div className="iad-actions-single">
              <span className="btn-outline" onClick={onClose}>Annuler</span>
            </div>
          </>
        )}

        {step === 'ssh-pick' && (
          <>
            <div className="faint iad-subtitle">
              Choisissez un hôte déjà géré (Infrastructure → Hôtes & agents) : un conteneur Docker Grafana officiel y sera installé via la clé SSH de la console.
            </div>
            <div className="iad-catalog">
              {hosts.length === 0 && (
                <div className="faint">
                  Aucun hôte géré pour l'instant. Ajoutez-en un depuis{' '}
                  <a href="/infrastructure/hosts">Infrastructure → Hôtes &amp; agents</a>, puis revenez ici.
                </div>
              )}
              {hosts.map((h) => (
                <div key={h.id} className="btn-outline iad-catalog-item" onClick={() => pickHost(h)}>
                  <div className="iad-catalog-item-label">{h.name}</div>
                  <div className="faint iad-catalog-item-desc">{h.address}</div>
                </div>
              ))}
            </div>
            <div className="iad-actions-single">
              <span className="btn-outline" onClick={() => setTargetType(null)}>Retour</span>
            </div>
          </>
        )}

        {step === 'ssh-confirm' && (
          <>
            <div className="iad-script-label">Script qui sera exécuté sur {host?.name} :</div>
            {scriptError
              ? <div className="iad-script-error">{scriptError}</div>
              : (
                <pre className="mono iad-script-pre">{script || 'Chargement…'}</pre>
              )}
            <div className="iad-actions">
              <span className="btn-outline" onClick={() => setHostId(null)}>Retour</span>
              <button className="btn" onClick={installOnHost} disabled={busy || !script}>{busy ? 'Installation…' : "Confirmer l'installation"}</button>
            </div>
          </>
        )}

        {step === 'k8s-pick' && (
          <>
            <div className="faint iad-subtitle">
              Choisissez le cluster Kubernetes où déployer Grafana (Deployment + Service, image officielle). Les volumes ne sont pas persistés pour l'instant — voir todo.md.
            </div>
            <div className="iad-catalog">
              {clusters.map((c) => (
                <div key={c.id} className="btn-outline iad-catalog-item" onClick={() => installOnKubernetes(c.id)}>
                  <div className="iad-catalog-item-label">{c.name}</div>
                </div>
              ))}
            </div>
            <div className="iad-actions-single">
              <span className="btn-outline" onClick={() => !busy && setTargetType(null)}>Retour</span>
            </div>
          </>
        )}

        {step === 'result' && (
          <>
            <div className={`badge badge-${result.ok ? 'ok' : 'crit'} iad-result-badge`}>
              <span className="dot" />{result.ok ? 'Installation réussie' : "Échec de l'installation"}
            </div>
            {result.ok && targetType === 'ssh-host' && (
              <div className="faint" style={{ marginBottom: 10 }}>
                Grafana écoute maintenant sur <span className="mono">http://{host?.address}:3000</span>. Créez-y un compte de service (Administration → Service accounts) puis renseignez l'URL et la clé API dans Paramètres → Grafana pour terminer le branchement.
              </div>
            )}
            {result.ok && targetType === 'kubernetes' && (
              <div className="faint" style={{ marginBottom: 10 }}>
                Grafana a été déployé sur le cluster (Deployment + Service ClusterIP). Renseignez l'URL du service (via un Ingress ou un port-forward) et la clé API dans Paramètres → Grafana pour terminer le branchement.
              </div>
            )}
            {result.stdout && <pre className="mono iad-result-stdout">{result.stdout}</pre>}
            {result.stderr && <pre className="mono iad-result-stderr">{result.stderr}</pre>}
            <div className="iad-actions-single">
              <span className="btn-outline" onClick={onClose}>Fermer</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './InstallAgentDialog.css';

const STATUS_LABEL = {
  up_to_date: { text: 'À jour', tone: 'ok' },
  update_available: { text: 'Nouvelle version disponible', tone: 'warn' },
  not_installed: { text: 'Conteneur introuvable sur l\'hôte', tone: 'crit' },
  error: { text: 'Vérification non disponible', tone: 'crit' }
};

// Lot D3 (Groupe D) — liste des services du catalogue installés sur un hôte,
// avec vérification de version et mise à jour contrôlée (SSH), gated par le
// réglage global d'autorisation (policy.globalEnabled, désactivé par défaut).
export default function HostServicesDialog({ host, policy, onClose }) {
  const services = useApi(() => api.get(`/hosts/${host.id}/services`), [host.id]);
  const [busyId, setBusyId] = useState(null);
  const notify = useNotify();

  async function checkUpdate(serviceId) {
    setBusyId(serviceId);
    try {
      const res = await api.post(`/hosts/${host.id}/services/${serviceId}/check-update`, {});
      const label = STATUS_LABEL[res.status]?.text || res.status;
      notify(`${serviceId} : ${label}`, { type: res.status === 'error' ? 'crit' : 'ok' });
      services.reload();
    } catch (err) {
      notify(err.message, { type: 'crit', title: 'Vérification échouée' });
    } finally {
      setBusyId(null);
    }
  }

  async function update(serviceId) {
    if (!confirm(`Mettre à jour ${serviceId} sur ${host.name} ? Le conteneur sera arrêté puis recréé avec la nouvelle image (courte interruption).`)) return;
    setBusyId(serviceId);
    try {
      const res = await api.post(`/hosts/${host.id}/services/${serviceId}/update`, {});
      if (res.result.ok) notify(`${serviceId} mis à jour sur ${host.name}`, { type: 'ok' });
      else notify(`Échec de la mise à jour (code ${res.result.exitCode})`, { type: 'crit' });
      services.reload();
    } catch (err) {
      notify(err.message, { type: 'crit', title: 'Mise à jour échouée' });
    } finally {
      setBusyId(null);
    }
  }

  const updateAllowed = Boolean(policy?.globalEnabled);

  return (
    <div className="iad-overlay" onClick={onClose}>
      <div className="card iad-card" onClick={(e) => e.stopPropagation()}>
        <div className="iad-title">Services installés sur {host.name}</div>
        <div className="faint iad-subtitle">
          {updateAllowed
            ? 'Mises à jour autorisées (réglage global activé) — confirmation demandée à chaque action.'
            : "Mises à jour désactivées : activez le réglage \"Autoriser les mises à jour de services\" ci-dessus pour débloquer le bouton Mettre à jour."}
        </div>

        {!services.data?.items?.length && (
          <div className="faint" style={{ padding: '16px 4px' }}>
            Aucun service du catalogue installé sur cet hôte via NexUs.
          </div>
        )}

        {services.data?.items?.map((s) => {
          const st = s.lastCheckStatus ? STATUS_LABEL[s.lastCheckStatus] : null;
          return (
            <div key={s.serviceId} className="infra-row-actions" style={{ justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-soft)' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{s.label}</div>
                <div className="faint" style={{ fontSize: 12 }}>
                  {st ? <span className={`badge badge-${st.tone}`}><span className="dot" />{st.text}</span> : 'Jamais vérifié'}
                  {s.lastCheckDetail ? ` — ${s.lastCheckDetail}` : ''}
                </div>
              </div>
              <div className="infra-row-actions">
                <span className="btn-outline infra-action-btn" onClick={() => busyId ? null : checkUpdate(s.serviceId)}>
                  {busyId === s.serviceId ? '…' : 'Vérifier la version'}
                </span>
                <button
                  className="btn infra-action-btn"
                  disabled={!updateAllowed || busyId !== null || s.lastCheckStatus !== 'update_available'}
                  title={!updateAllowed ? 'Autorisation requise dans Paramètres' : (s.lastCheckStatus !== 'update_available' ? 'Vérifiez d\'abord la version' : '')}
                  onClick={() => update(s.serviceId)}
                >
                  Mettre à jour
                </button>
              </div>
            </div>
          );
        })}

        <div className="iad-actions-single">
          <span className="btn-outline" onClick={onClose}>Fermer</span>
        </div>
      </div>
    </div>
  );
}

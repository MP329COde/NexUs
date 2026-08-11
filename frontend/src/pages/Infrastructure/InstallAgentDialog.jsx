import { useState } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

export default function InstallAgentDialog({ host, onClose, onInstalled }) {
  const catalog = useApi(() => api.get('/hosts/agents/catalog'), []);
  const [agentId, setAgentId] = useState(null);
  const [script, setScript] = useState(null);
  const [scriptError, setScriptError] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const notify = useNotify();

  async function preview(id) {
    setAgentId(id);
    setScript(null);
    setScriptError(null);
    setResult(null);
    try {
      const res = await api.get(`/hosts/agents/${id}/preview`);
      setScript(res.script);
    } catch (err) {
      setScriptError(err.message);
    }
  }

  async function install() {
    setBusy(true);
    try {
      const res = await api.post(`/hosts/${host.id}/agents/${agentId}/install`, {});
      setResult(res.result);
      if (res.result.ok) notify(`Agent ${agentId} installé sur ${host.name}`, { type: 'ok' });
      else notify(`Échec de l'installation (code ${res.result.exitCode})`, { type: 'crit' });
      onInstalled();
    } catch (err) {
      notify(err.message, { type: 'crit', title: 'Connexion SSH échouée' });
      setResult({ ok: false, stdout: '', stderr: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onClose}>
      <div className="card" style={{ width: 560, maxHeight: '80vh', overflowY: 'auto', padding: 22 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Installer un agent sur {host.name}</div>
        <div className="faint" style={{ fontSize: 12, marginBottom: 16 }}>{host.address}:{host.port} · utilisateur {host.sshUser}</div>

        {!agentId && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {catalog.data?.items.map((a) => (
              <div key={a.id} className="btn-outline" style={{ height: 'auto', padding: 12, textAlign: 'left', display: 'block' }} onClick={() => preview(a.id)}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{a.label}</div>
                <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>{a.description}</div>
              </div>
            ))}
          </div>
        )}

        {agentId && !result && (
          <>
            <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 6 }}>Script qui sera exécuté sur l'hôte :</div>
            {scriptError
              ? <div style={{ fontSize: 12.5, color: 'var(--tone-crit-fg)' }}>{scriptError}</div>
              : (
                <pre className="mono" style={{ fontSize: 11, background: 'var(--border-soft)', padding: 12, borderRadius: 8, overflowX: 'auto', maxHeight: 260 }}>{script || 'Chargement…'}</pre>
              )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <span className="btn-outline" onClick={() => setAgentId(null)}>Retour</span>
              <button className="btn" onClick={install} disabled={busy || !script}>{busy ? 'Installation…' : "Confirmer l'installation"}</button>
            </div>
          </>
        )}

        {result && (
          <>
            <div className={`badge badge-${result.ok ? 'ok' : 'crit'}`} style={{ marginBottom: 10 }}>
              <span className="dot" />{result.ok ? 'Installation réussie' : 'Échec de l\'installation'}
            </div>
            {result.stdout && <pre className="mono" style={{ fontSize: 11, background: 'var(--border-soft)', padding: 12, borderRadius: 8, overflowX: 'auto', maxHeight: 200 }}>{result.stdout}</pre>}
            {result.stderr && <pre className="mono" style={{ fontSize: 11, color: 'var(--tone-crit-fg)', background: 'var(--tone-crit-bg)', padding: 12, borderRadius: 8, overflowX: 'auto', maxHeight: 160, marginTop: 8 }}>{result.stderr}</pre>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <span className="btn-outline" onClick={onClose}>Fermer</span>
            </div>
          </>
        )}

        {!agentId && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <span className="btn-outline" onClick={onClose}>Annuler</span>
          </div>
        )}
      </div>
    </div>
  );
}

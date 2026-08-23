import { useEffect, useState } from 'react';
import Icon from '../../components/ui/Icon.jsx';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './AttachFrontendDialog.css';
import './FrontendDetailDialog.css';

// Édition visuelle d'un frontend HAProxy existant : bindings/listeners
// (adresse, port, TLS) et règles ACL/use_backend, sans passer par l'éditeur
// de texte brut. Chaque section (bindings, règles) se sauvegarde
// indépendamment — la Data Plane API remplace la collection entière à chaque
// PUT (voir haproxyService.js), donc on charge l'état courant, on l'édite en
// mémoire, puis on envoie le tableau complet.
export default function FrontendDetailDialog({ name, onClose, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [binds, setBinds] = useState([]);
  const [rules, setRules] = useState([]);
  const [savingBinds, setSavingBinds] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const notify = useNotify();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get(`/haproxy/frontends/${encodeURIComponent(name)}`)
      .then((res) => {
        if (cancelled) return;
        setDetail(res.item);
        setBinds(res.item.binds.length ? res.item.binds : [{ address: '*', port: '', ssl: false, sslCertificate: '' }]);
        setRules(res.item.rules);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [name]);

  function updateBind(i, patch) {
    setBinds((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }
  function addBind() {
    setBinds((prev) => [...prev, { address: '*', port: '', ssl: false, sslCertificate: '' }]);
  }
  function removeBind(i) {
    setBinds((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function saveBinds() {
    setSavingBinds(true);
    try {
      const res = await api.put(`/haproxy/frontends/${encodeURIComponent(name)}/binds`, { binds });
      notify(res.message, { type: 'ok' });
      onChanged?.();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setSavingBinds(false);
    }
  }

  function updateRule(i, patch) {
    setRules((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRule() {
    setRules((prev) => [...prev, { aclName: '', criterion: 'hdr(host)', value: '', backend: '' }]);
  }
  function removeRule(i) {
    setRules((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function saveRules() {
    setSavingRules(true);
    try {
      const res = await api.put(`/haproxy/frontends/${encodeURIComponent(name)}/rules`, { rules });
      notify(res.message, { type: 'ok' });
      onChanged?.();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setSavingRules(false);
    }
  }

  return (
    <div className="afd-overlay" onClick={onClose}>
      <div className="card afd-card fdd-card" onClick={(e) => e.stopPropagation()}>
        <div className="afd-title-row">
          <Icon name="gitBranch" size={18} className="afd-title-icon" />
          <div className="afd-title">Frontend · {name}</div>
        </div>

        {loading && <p className="faint">Chargement…</p>}
        {error && <p className="fdd-error">{error}</p>}

        {detail && !loading && (
          <>
            <section className="fdd-section">
              <div className="fdd-section-title">Bindings / listeners</div>
              <p className="faint fdd-desc">Adresses et ports d'écoute du frontend. NexUs ne gère pas de dépôt de certificats HAProxy : le chemin TLS saisi doit déjà exister sur l'hôte HAProxy.</p>
              {binds.map((b, i) => (
                <div key={i} className="fdd-bind-row">
                  <input className="input fdd-input-sm" placeholder="Adresse (* ou IP)" value={b.address} onChange={(e) => updateBind(i, { address: e.target.value })} />
                  <input className="input fdd-input-xs" type="number" placeholder="Port" value={b.port} onChange={(e) => updateBind(i, { port: e.target.value })} />
                  <label className="fdd-checkbox">
                    <input type="checkbox" checked={!!b.ssl} onChange={(e) => updateBind(i, { ssl: e.target.checked })} />
                    TLS
                  </label>
                  {b.ssl && (
                    <input className="input fdd-input-cert" placeholder="/etc/haproxy/certs/site.pem" value={b.sslCertificate} onChange={(e) => updateBind(i, { sslCertificate: e.target.value })} />
                  )}
                  <span className="fdd-remove" onClick={() => removeBind(i)}><Icon name="trash" size={14} /></span>
                </div>
              ))}
              <div className="fdd-row-actions">
                <span className="btn-outline net-action-btn" onClick={addBind}>+ Binding</span>
                <span className="btn net-action-btn" onClick={saveBinds}>{savingBinds ? 'Enregistrement…' : 'Enregistrer les bindings'}</span>
              </div>
            </section>

            <section className="fdd-section">
              <div className="fdd-section-title">Règles (ACL / use_backend)</div>
              <p className="faint fdd-desc">Chaque règle avec un nom d'ACL route conditionnellement vers un backend ; laissez le nom d'ACL vide pour un use_backend inconditionnel (à placer en dernier).</p>
              {rules.map((r, i) => (
                <div key={i} className="fdd-rule-row">
                  <input className="input fdd-input-sm" placeholder="Nom ACL (optionnel)" value={r.aclName || ''} onChange={(e) => updateRule(i, { aclName: e.target.value })} />
                  <select className="input fdd-input-sm" value={r.criterion || 'hdr(host)'} onChange={(e) => updateRule(i, { criterion: e.target.value })} disabled={!r.aclName}>
                    <option value="hdr(host)">hdr(host)</option>
                    <option value="path_beg">path_beg</option>
                    <option value="path">path</option>
                    <option value="src">src</option>
                  </select>
                  <input className="input fdd-input-sm" placeholder="Valeur" value={r.value || ''} onChange={(e) => updateRule(i, { value: e.target.value })} disabled={!r.aclName} />
                  <input className="input fdd-input-sm" placeholder="Backend cible" value={r.backend || ''} onChange={(e) => updateRule(i, { backend: e.target.value })} />
                  <span className="fdd-remove" onClick={() => removeRule(i)}><Icon name="trash" size={14} /></span>
                </div>
              ))}
              <div className="fdd-row-actions">
                <span className="btn-outline net-action-btn" onClick={addRule}>+ Règle</span>
                <span className="btn net-action-btn" onClick={saveRules}>{savingRules ? 'Enregistrement…' : 'Enregistrer les règles'}</span>
              </div>
            </section>
          </>
        )}

        <div className="afd-actions">
          <span className="btn-outline" onClick={onClose}>Fermer</span>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../../lib/apiClient.js';
import StatusBadge, { toneFromStatus } from '../../components/ui/StatusBadge.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { suggestHostUrl } from '../../lib/urlSuggest.js';

export default function IntegrationPanel({ integrationKey, schema, initial, allIntegrations, onSaved }) {
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    const values = {};
    for (const f of schema.fields) values[f.key] = f.secret ? '' : (initial?.[f.key] ?? (f.type === 'checkbox' ? false : ''));
    setForm(values);
  }, [initial, schema.fields]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // Complète automatiquement le schéma "https://" si l'utilisateur a saisi
  // juste un nom d'hôte (aucune requête réseau, juste une normalisation locale).
  function normalizeUrlOnBlur(field, value) {
    if (value && !/^https?:\/\//i.test(value)) set(field, `https://${value}`);
  }

  const suggestion = schema.hostSuggestion && !form[schema.hostSuggestion.field]
    ? suggestHostUrl(allIntegrations, schema.hostSuggestion)
    : null;

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.put(`/settings/${integrationKey}`, form);
      onSaved();
      // La sauvegarde crée une nouvelle entrée d'audit : si l'historique est
      // déjà ouvert, on le recharge pour l'afficher immédiatement.
      if (historyOpen) loadHistory();
      else setHistory(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const res = await api.get(`/audit?integrationKey=${integrationKey}&limit=20`);
      setHistory(res.items);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  function toggleHistory() {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next && !history) loadHistory();
  }

  function fieldLabel(key) {
    return schema.fields.find((f) => f.key === key)?.label || key;
  }

  async function test() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post(`/settings/${integrationKey}/test`, {});
      setTestResult(res.status);
    } catch (err) {
      setTestResult({ ok: false, message: err.message });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{schema.label}</div>
        <StatusBadge tone={toneFromStatus(initial)} label={initial?.configured ? 'Configuré' : 'Non configuré'} />
      </div>
      {schema.hint && <div className="faint" style={{ fontSize: 12, marginBottom: 10 }}>{schema.hint}</div>}

      {schema.guide?.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <span
            onClick={() => setGuideOpen((v) => !v)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: 'var(--primary)', cursor: 'pointer' }}
          >
            <Icon name="info" size={13} />
            Comment obtenir ces informations ?
            <Icon name="chevronDown" size={12} style={{ transform: guideOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }} />
          </span>
          {guideOpen && (
            <ol style={{ margin: '10px 0 0', padding: '10px 14px 10px 28px', background: 'var(--border-soft)', borderRadius: 8, fontSize: 12, lineHeight: 1.6, color: 'var(--text-muted)', animation: 'riseIn .2s ease both' }}>
              {schema.guide.map((step, i) => <li key={i} style={{ marginBottom: i < schema.guide.length - 1 ? 6 : 0 }}>{step}</li>)}
            </ol>
          )}
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <span
          onClick={toggleHistory}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          <Icon name="refresh" size={13} />
          Historique des modifications
          <Icon name="chevronDown" size={12} style={{ transform: historyOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }} />
        </span>
        {historyOpen && (
          <div style={{ margin: '10px 0 0', padding: '4px 0', animation: 'riseIn .2s ease both' }}>
            {historyLoading && <div className="faint" style={{ fontSize: 12 }}>Chargement…</div>}
            {!historyLoading && history?.length === 0 && <div className="faint" style={{ fontSize: 12 }}>Aucune modification enregistrée.</div>}
            {!historyLoading && history?.map((e) => {
              const fields = Object.entries(e.meta?.changes || {});
              return (
                <div key={e.id} style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--border-soft)', marginBottom: 6, fontSize: 11.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', marginBottom: fields.length ? 5 : 0 }}>
                    <span>{e.actorEmail || 'Système'}</span>
                    <span className="mono">{new Date(e.at).toLocaleString('fr-FR')}</span>
                  </div>
                  {fields.length === 0 && <span className="faint">Enregistré sans changement détecté.</span>}
                  {fields.map(([key, change]) => (
                    <div key={key} className="mono" style={{ color: 'var(--text-faint)' }}>
                      {fieldLabel(key)} : {change.secret ? 'valeur secrète modifiée' : `« ${change.from || '—'} » → « ${change.to || '—'} »`}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {schema.fields.length > 0 && (
        <form onSubmit={save}>
          {schema.fields.map((f) => (
            <div key={f.key} style={{ marginBottom: 10 }}>
              {/* Contrôle imbriqué dans <label> (association implicite), pas relié par un id
                  généré : reste accessible (lecteurs d'écran, clic sur le libellé) sans risque
                  de collision d'id entre les dix intégrations rendues côte à côte. */}
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 5, color: 'var(--text-muted)' }}>
                {f.label}
                {f.secret && initial?.[`${f.key}Set`] && <span className="faint"> (déjà renseigné — laisser vide pour conserver)</span>}
                <div style={{ marginTop: 5, fontWeight: 400 }}>
                  {f.type === 'checkbox' ? (
                    <input type="checkbox" checked={Boolean(form[f.key])} onChange={(e) => set(f.key, e.target.checked)} />
                  ) : (
                    <input
                      className="input"
                      type={f.type === 'password' ? 'password' : 'text'}
                      placeholder={f.placeholder}
                      value={form[f.key] ?? ''}
                      onChange={(e) => set(f.key, e.target.value)}
                      onBlur={f.placeholder?.startsWith('http') ? (e) => normalizeUrlOnBlur(f.key, e.target.value) : undefined}
                    />
                  )}
                </div>
              </label>
              {f.hint && <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>{f.hint}</div>}
              {schema.hostSuggestion?.field === f.key && suggestion && (
                <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-faint)' }}>
                  Suggestion (déduite de vos autres intégrations) : <span className="mono">{suggestion}</span>{' '}
                  <span style={{ color: 'var(--primary)', fontWeight: 500, cursor: 'pointer' }} onClick={() => set(f.key, suggestion)}>Utiliser</span>
                </div>
              )}
            </div>
          ))}

          {error && <div style={{ fontSize: 12.5, color: 'var(--tone-crit-fg)', marginBottom: 10 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
            <span className="btn-outline" onClick={test}>{testing ? 'Test…' : 'Tester la connexion'}</span>
          </div>
        </form>
      )}

      {schema.fields.length === 0 && <span className="btn-outline" onClick={test}>{testing ? 'Test…' : 'Tester la connexion'}</span>}

      {testResult && (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 8, fontSize: 12.5, background: testResult.ok ? 'var(--tone-ok-bg)' : 'var(--tone-crit-bg)', color: testResult.ok ? 'var(--tone-ok-fg)' : 'var(--tone-crit-fg)' }}>
          {testResult.message}
        </div>
      )}
    </div>
  );
}

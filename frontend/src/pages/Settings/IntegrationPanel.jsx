import { useEffect, useState } from 'react';
import { api } from '../../lib/apiClient.js';
import StatusBadge, { toneFromStatus } from '../../components/ui/StatusBadge.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { suggestHostUrl } from '../../lib/urlSuggest.js';
import './IntegrationPanel.css';

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
  // `initial` (issu de GET /settings) ne contient jamais `ok` — c'est de la
  // config statique, pas un statut vérifié en direct. On mémorise ici le
  // dernier résultat réel d'un clic "Tester la connexion" pour que le badge
  // d'en-tête reflète un vrai test, jamais un statut inventé.
  const [lastTested, setLastTested] = useState(null);
  const badgeStatus = lastTested ? { ...initial, ok: lastTested.ok } : initial;

  useEffect(() => {
    const values = {};
    for (const f of schema.fields) values[f.key] = f.secret ? '' : (initial?.[f.key] ?? (f.type === 'checkbox' ? false : f.type === 'select' ? (f.options?.[0]?.value ?? '') : ''));
    setForm(values);
    setLastTested(null);
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
      setLastTested(res.status);
    } catch (err) {
      const failed = { ok: false, message: err.message };
      setTestResult(failed);
      setLastTested(failed);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="card integ-card">
      <div className="integ-header">
        <div className="integ-title">{schema.label}</div>
        <StatusBadge
          tone={toneFromStatus(badgeStatus)}
          label={
            !badgeStatus?.configured
              ? 'Non configuré'
              : badgeStatus.ok === true ? 'Connecté' : badgeStatus.ok === false ? 'Erreur' : 'Configuré (non testé)'
          }
        />
      </div>
      {schema.hint && <div className="faint integ-hint">{schema.hint}</div>}

      {schema.guide?.length > 0 && (
        <div className="integ-guide-wrap">
          <span
            onClick={() => setGuideOpen((v) => !v)}
            className="integ-toggle"
          >
            <Icon name="info" size={13} />
            Comment obtenir ces informations ?
            <Icon name="chevronDown" size={12} className={`integ-chevron${guideOpen ? ' integ-chevron-open' : ''}`} />
          </span>
          {guideOpen && (
            <ol className="integ-guide-list">
              {schema.guide.map((step, i) => <li key={i} className={i < schema.guide.length - 1 ? 'integ-guide-item-spaced' : undefined}>{step}</li>)}
            </ol>
          )}
        </div>
      )}

      <div className="integ-history-wrap">
        <span
          onClick={toggleHistory}
          className="integ-toggle integ-toggle-muted"
        >
          <Icon name="refresh" size={13} />
          Historique des modifications
          <Icon name="chevronDown" size={12} className={`integ-chevron${historyOpen ? ' integ-chevron-open' : ''}`} />
        </span>
        {historyOpen && (
          <div className="integ-history-body">
            {historyLoading && <div className="faint integ-history-loading">Chargement…</div>}
            {!historyLoading && history?.length === 0 && <div className="faint integ-history-empty">Aucune modification enregistrée.</div>}
            {!historyLoading && history?.map((e) => {
              const fields = Object.entries(e.meta?.changes || {});
              return (
                <div key={e.id} className="integ-history-entry">
                  <div className={`integ-history-entry-head${fields.length ? ' integ-history-entry-head-spaced' : ''}`}>
                    <span>{e.actorEmail || 'Système'}</span>
                    <span className="mono">{new Date(e.at).toLocaleString('fr-FR')}</span>
                  </div>
                  {fields.length === 0 && <span className="faint">Enregistré sans changement détecté.</span>}
                  {fields.map(([key, change]) => (
                    <div key={key} className="mono integ-history-change">
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
        <form onSubmit={save} autoComplete="off">
          {schema.fields.map((f) => (
            <div key={f.key} className="integ-field">
              {/* Contrôle imbriqué dans <label> (association implicite), pas relié par un id
                  généré : reste accessible (lecteurs d'écran, clic sur le libellé) sans risque
                  de collision d'id entre les dix intégrations rendues côte à côte. */}
              <label className="integ-field-label">
                {f.label}
                {f.secret && initial?.[`${f.key}Set`] && <span className="faint"> (déjà renseigné — laisser vide pour conserver)</span>}
                <div className="integ-field-input-wrap">
                  {f.type === 'checkbox' ? (
                    <input type="checkbox" checked={Boolean(form[f.key])} onChange={(e) => set(f.key, e.target.checked)} />
                  ) : f.type === 'select' ? (
                    <select className="input" value={form[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)}>
                      {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <input
                      className="input"
                      type={f.type === 'password' ? 'password' : 'text'}
                      // name unique par intégration+champ, et autoComplete
                      // dédié : ces jetons/URLs d'infrastructure ne sont pas
                      // des identifiants de compte, mais type="password"
                      // déclenche quand même le gestionnaire de mots de passe
                      // du navigateur sans ces deux attributs.
                      name={`${integrationKey}-${f.key}`}
                      autoComplete={f.type === 'password' ? 'new-password' : 'off'}
                      placeholder={f.placeholder}
                      value={form[f.key] ?? ''}
                      onChange={(e) => set(f.key, e.target.value)}
                      onBlur={f.placeholder?.startsWith('http') ? (e) => normalizeUrlOnBlur(f.key, e.target.value) : undefined}
                    />
                  )}
                </div>
              </label>
              {f.hint && <div className="faint integ-field-hint">{f.hint}</div>}
              {schema.hostSuggestion?.field === f.key && suggestion && (
                <div className="integ-suggestion">
                  Suggestion (déduite de vos autres intégrations) : <span className="mono">{suggestion}</span>{' '}
                  <span className="integ-suggestion-use" onClick={() => set(f.key, suggestion)}>Utiliser</span>
                </div>
              )}
            </div>
          ))}

          {error && <div className="integ-error">{error}</div>}

          <div className="integ-actions">
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
            <span className="btn-outline" onClick={test}>{testing ? 'Test…' : 'Tester la connexion'}</span>
          </div>
        </form>
      )}

      {schema.fields.length === 0 && <span className="btn-outline" onClick={test}>{testing ? 'Test…' : 'Tester la connexion'}</span>}

      {testResult && (
        <div className="integ-test-result" style={{ background: testResult.ok ? 'var(--tone-ok-bg)' : 'var(--tone-crit-bg)', color: testResult.ok ? 'var(--tone-ok-fg)' : 'var(--tone-crit-fg)' }}>
          {testResult.message}
        </div>
      )}
    </div>
  );
}

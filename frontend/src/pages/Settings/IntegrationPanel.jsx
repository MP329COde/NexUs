import { useEffect, useState } from 'react';
import { api } from '../../lib/apiClient.js';
import StatusBadge, { toneFromStatus } from '../../components/ui/StatusBadge.jsx';

export default function IntegrationPanel({ integrationKey, schema, initial, onSaved }) {
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const values = {};
    for (const f of schema.fields) values[f.key] = f.secret ? '' : (initial?.[f.key] ?? (f.type === 'checkbox' ? false : ''));
    setForm(values);
  }, [initial, schema.fields]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.put(`/settings/${integrationKey}`, form);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
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
      {schema.hint && <div className="faint" style={{ fontSize: 12, marginBottom: 14 }}>{schema.hint}</div>}

      {schema.fields.length > 0 && (
        <form onSubmit={save}>
          {schema.fields.map((f) => (
            <div key={f.key} style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 5, color: 'var(--text-muted)' }}>
                {f.label}
                {f.secret && initial?.[`${f.key}Set`] && <span className="faint"> (déjà renseigné — laisser vide pour conserver)</span>}
              </label>
              {f.type === 'checkbox' ? (
                <input type="checkbox" checked={Boolean(form[f.key])} onChange={(e) => set(f.key, e.target.checked)} />
              ) : (
                <input
                  className="input"
                  type={f.type === 'password' ? 'password' : 'text'}
                  placeholder={f.placeholder}
                  value={form[f.key] ?? ''}
                  onChange={(e) => set(f.key, e.target.value)}
                />
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

import { useEffect, useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

export default function IdentityPanel() {
  const { data, reload } = useApi(() => api.get('/identity'), []);
  const notify = useNotify();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    if (data?.identity) {
      setForm({
        sessionMinutes: data.identity.sessionMinutes ?? 720,
        minPasswordLength: data.identity.minPasswordLength ?? 8,
        oidcIssuer: data.identity.oidcIssuer || '',
        oidcClientId: data.identity.oidcClientId || '',
        oidcClientSecret: '',
        ldapUrl: data.identity.ldapUrl || '',
        ldapBindDn: data.identity.ldapBindDn || '',
        ldapBindPassword: ''
      });
    }
  }, [data]);

  if (!form) return null;

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put('/identity', form);
      notify('Politique de connexion enregistrée', { type: 'ok' });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  async function testOidc() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post('/identity/test-oidc', { oidcIssuer: form.oidcIssuer });
      setTestResult(res);
    } catch (err) {
      setTestResult({ ok: false, message: err.message });
    } finally {
      setTesting(false);
    }
  }

  return (
    <form onSubmit={save} style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16 }}>
      <Panel title="Authentification & accès" sub="Politique globale de connexion, appliquée immédiatement" span={6}>
        <div style={{ padding: 16 }}>
          <Field label="Durée de session" hint="Durée de validité du cookie de connexion, en minutes.">
            <input className="input" type="number" min={5} max={10080} value={form.sessionMinutes} onChange={(e) => set('sessionMinutes', Number(e.target.value))} />
          </Field>
          <Field label="Longueur minimale du mot de passe" hint="Appliquée à la création de compte et au changement de mot de passe.">
            <input className="input" type="number" min={8} max={128} value={form.minPasswordLength} onChange={(e) => set('minPasswordLength', Number(e.target.value))} />
          </Field>
        </div>
      </Panel>

      <Panel title="Fournisseur OIDC" sub="Configuration enregistrée et testable — n'est pas encore un second chemin de connexion actif" span={6}>
        <div style={{ padding: 16 }}>
          <Field label="Émetteur (issuer)" hint="URL de découverte OpenID Connect.">
            <input className="input" placeholder="https://auth.lab.local/application/o/nexus" value={form.oidcIssuer} onChange={(e) => set('oidcIssuer', e.target.value)} />
          </Field>
          <Field label="Identifiant client">
            <input className="input" value={form.oidcClientId} onChange={(e) => set('oidcClientId', e.target.value)} />
          </Field>
          <Field label="Secret client" hint={data?.identity?.oidcClientSecretSet ? 'Déjà renseigné — laisser vide pour conserver' : undefined}>
            <input className="input" type="password" value={form.oidcClientSecret} onChange={(e) => set('oidcClientSecret', e.target.value)} />
          </Field>
          <span className="btn-outline" onClick={testOidc} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="refresh" size={13} className={testing ? 'spin' : ''} />{testing ? 'Test…' : "Tester l'issuer"}
          </span>
          {testResult && (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 8, fontSize: 12, background: testResult.ok ? 'var(--tone-ok-bg)' : 'var(--tone-crit-bg)', color: testResult.ok ? 'var(--tone-ok-fg)' : 'var(--tone-crit-fg)' }}>
              {testResult.message}
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Annuaire LDAP" sub="Secours local, configuration enregistrée uniquement" span={6}>
        <div style={{ padding: 16 }}>
          <Field label="URL LDAP"><input className="input" placeholder="ldaps://ldap.lab.local" value={form.ldapUrl} onChange={(e) => set('ldapUrl', e.target.value)} /></Field>
          <Field label="Bind DN"><input className="input" value={form.ldapBindDn} onChange={(e) => set('ldapBindDn', e.target.value)} /></Field>
          <Field label="Mot de passe de bind" hint={data?.identity?.ldapBindPasswordSet ? 'Déjà renseigné — laisser vide pour conserver' : undefined}>
            <input className="input" type="password" value={form.ldapBindPassword} onChange={(e) => set('ldapBindPassword', e.target.value)} />
          </Field>
        </div>
      </Panel>

      <Panel title="Ce que vous ne pouvez pas encore faire ici" span={6}>
        <div style={{ padding: 16, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          <p style={{ margin: '0 0 8px' }}>
            Cette page enregistre et teste la configuration SSO, mais la console n'authentifie aujourd'hui qu'avec le mot de passe local
            (voir le Manuel, section Sécurité). Activer réellement OIDC/LDAP comme second chemin de connexion touche au cœur de
            l'authentification et n'a volontairement pas été précipité.
          </p>
        </div>
      </Panel>

      <div style={{ gridColumn: 'span 12' }}>
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </form>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 5, color: 'var(--text-muted)' }}>{label}</label>
      {children}
      {hint && <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

import { useEffect, useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './IdentityPanel.css';

export default function IdentityPanel() {
  const { data, error, reload } = useApi(() => api.get('/identity'), []);
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
        pwRequireUppercase: Boolean(data.identity.pwRequireUppercase),
        pwRequireDigit: Boolean(data.identity.pwRequireDigit),
        pwRequireSymbol: Boolean(data.identity.pwRequireSymbol),
        loginCidrAllowlistText: (data.identity.loginCidrAllowlist || []).join('\n'),
        oidcIssuer: data.identity.oidcIssuer || '',
        oidcClientId: data.identity.oidcClientId || '',
        oidcClientSecret: '',
        ldapUrl: data.identity.ldapUrl || '',
        ldapBindDn: data.identity.ldapBindDn || '',
        ldapBindPassword: ''
      });
    }
  }, [data]);

  if (!form) {
    if (error) {
      return (
        <div className="identity-error">
          {error.status === 429
            ? 'Trop de requêtes envoyées au serveur — réessayez dans une minute.'
            : error.status === 401
              ? 'Session expirée — reconnectez-vous.'
              : `Impossible de charger la politique de connexion : ${error.message}`}
        </div>
      );
    }
    return null;
  }

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { loginCidrAllowlistText, ...rest } = form;
      const loginCidrAllowlist = loginCidrAllowlistText.split('\n').map((s) => s.trim()).filter(Boolean);
      await api.put('/identity', { ...rest, loginCidrAllowlist });
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
    <form onSubmit={save} className="identity-form">
      <Panel title="Authentification & accès" sub="Politique globale de connexion, appliquée immédiatement" span={6}>
        <div className="identity-panel-body">
          <Field label="Durée de session" hint="Durée de validité du cookie de connexion, en minutes.">
            <input className="input" type="number" min={5} max={10080} value={form.sessionMinutes} onChange={(e) => set('sessionMinutes', Number(e.target.value))} />
          </Field>
          <Field label="Longueur minimale du mot de passe" hint="Appliquée à la création de compte et au changement de mot de passe.">
            <input className="input" type="number" min={8} max={128} value={form.minPasswordLength} onChange={(e) => set('minPasswordLength', Number(e.target.value))} />
          </Field>
          <Field label="Complexité du mot de passe" hint="Règles additionnelles, désactivées par défaut.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={form.pwRequireUppercase} onChange={(e) => set('pwRequireUppercase', e.target.checked)} />
                Au moins une majuscule
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={form.pwRequireDigit} onChange={(e) => set('pwRequireDigit', e.target.checked)} />
                Au moins un chiffre
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={form.pwRequireSymbol} onChange={(e) => set('pwRequireSymbol', e.target.checked)} />
                Au moins un symbole
              </label>
            </div>
          </Field>
          <Field label="Restriction réseau (CIDR)" hint="Une plage par ligne (ex. 10.0.0.0/24). Vide = aucune restriction. Votre propre adresse doit être incluse, sinon refusé à l'enregistrement.">
            <textarea
              className="input"
              rows={3}
              placeholder={'10.0.0.0/24\n192.168.1.42'}
              value={form.loginCidrAllowlistText}
              onChange={(e) => set('loginCidrAllowlistText', e.target.value)}
            />
          </Field>
        </div>
      </Panel>

      <Panel title="Fournisseur OIDC" sub="Configuration enregistrée et testable — n'est pas encore un second chemin de connexion actif" span={6}>
        <div className="identity-panel-body">
          <Field label="Émetteur (issuer)" hint="URL de découverte OpenID Connect.">
            <input className="input" placeholder="https://auth.lab.local/application/o/nexus" value={form.oidcIssuer} onChange={(e) => set('oidcIssuer', e.target.value)} />
          </Field>
          <Field label="Identifiant client">
            <input className="input" value={form.oidcClientId} onChange={(e) => set('oidcClientId', e.target.value)} />
          </Field>
          <Field label="Secret client" hint={data?.identity?.oidcClientSecretSet ? 'Déjà renseigné — laisser vide pour conserver' : undefined}>
            <input className="input" type="password" value={form.oidcClientSecret} onChange={(e) => set('oidcClientSecret', e.target.value)} />
          </Field>
          <span className="btn-outline identity-test-btn" onClick={testOidc}>
            <Icon name="refresh" size={13} className={testing ? 'spin' : ''} />{testing ? 'Test…' : "Tester l'issuer"}
          </span>
          {testResult && (
            <div className="identity-test-result" style={{ background: testResult.ok ? 'var(--tone-ok-bg)' : 'var(--tone-crit-bg)', color: testResult.ok ? 'var(--tone-ok-fg)' : 'var(--tone-crit-fg)' }}>
              {testResult.message}
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Annuaire LDAP" sub="Secours local, configuration enregistrée uniquement" span={6}>
        <div className="identity-panel-body">
          <Field label="URL LDAP"><input className="input" placeholder="ldaps://ldap.lab.local" value={form.ldapUrl} onChange={(e) => set('ldapUrl', e.target.value)} /></Field>
          <Field label="Bind DN"><input className="input" value={form.ldapBindDn} onChange={(e) => set('ldapBindDn', e.target.value)} /></Field>
          <Field label="Mot de passe de bind" hint={data?.identity?.ldapBindPasswordSet ? 'Déjà renseigné — laisser vide pour conserver' : undefined}>
            <input className="input" type="password" value={form.ldapBindPassword} onChange={(e) => set('ldapBindPassword', e.target.value)} />
          </Field>
        </div>
      </Panel>

      <Panel title="Ce que vous ne pouvez pas encore faire ici" span={6}>
        <div className="identity-limits-body">
          <p className="identity-limits-text">
            Cette page enregistre et teste la configuration SSO, mais la console n'authentifie aujourd'hui qu'avec le mot de passe local
            (voir le Manuel, section Sécurité). Activer réellement OIDC/LDAP comme second chemin de connexion touche au cœur de
            l'authentification et n'a volontairement pas été précipité.
          </p>
        </div>
      </Panel>

      <div className="identity-submit-col">
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </form>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="identity-field">
      <label className="identity-field-label">{label}</label>
      {children}
      {hint && <div className="faint identity-field-hint">{hint}</div>}
    </div>
  );
}

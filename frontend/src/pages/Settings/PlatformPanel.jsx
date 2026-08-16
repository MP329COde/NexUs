import { useEffect, useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

const TIMEZONES = ['Europe/Paris', 'Europe/London', 'UTC', 'America/New_York', 'America/Los_Angeles'];
const LANGUAGES = [['fr', 'Français'], ['en', 'English']];
const DATE_FORMATS = [['dd/MM/yyyy', 'JJ/MM/AAAA'], ['MM/dd/yyyy', 'MM/JJ/AAAA'], ['yyyy-MM-dd', 'AAAA-MM-JJ']];

// Reçoit les données déjà chargées par SettingsPage (un seul GET /settings
// pour toute la page) au lieu de refaire son propre fetch — un second appel
// indépendant ici doublait la consommation du quota de requêtes partagé
// entre onglets et contribuait aux 429 observés sur cet onglet.
export default function PlatformPanel({ data, error, reload }) {
  const notify = useNotify();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data?.console) {
      setForm({
        name: data.console.name || 'Nexus Console',
        timezone: data.console.timezone || 'Europe/Paris',
        language: data.console.language || 'fr',
        dateFormat: data.console.dateFormat || 'dd/MM/yyyy',
        contactEmail: data.console.contactEmail || '',
        homeRestrictedToAdmins: Boolean(data.console.homeRestrictedToAdmins)
      });
    }
  }, [data]);

  if (!form) {
    if (error) {
      return (
        <div style={{ padding: 16, fontSize: 13, color: 'var(--tone-crit-fg)' }}>
          {error.status === 429
            ? 'Trop de requêtes envoyées au serveur — réessayez dans une minute.'
            : error.status === 401
              ? 'Session expirée — reconnectez-vous.'
              : `Impossible de charger les paramètres plateforme : ${error.message}`}
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
      await api.put('/settings/console', form);
      notify('Paramètres plateforme enregistrés', { type: 'ok' });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16 }}>
      <Panel title="Organisation & régionalisation" sub="Identité de l'instance, langue et fuseau horaire" span={12}>
        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16 }}>
          <Field label="Nom de l'organisation" hint="Affiché dans l'en-tête et les rapports">
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Fuseau horaire" hint="Horodatage des journaux et planifications">
            <select className="input" value={form.timezone} onChange={(e) => set('timezone', e.target.value)}>
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </Field>
          <Field label="Langue de l'interface" hint="Appliquée à tous les utilisateurs par défaut">
            <select className="input" value={form.language} onChange={(e) => set('language', e.target.value)}>
              {LANGUAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Format de date">
            <select className="input" value={form.dateFormat} onChange={(e) => set('dateFormat', e.target.value)}>
              {DATE_FORMATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Adresse de contact" hint="Destinataire des demandes internes">
            <input className="input" type="email" value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
          </Field>
        </div>
        <div className="faint" style={{ padding: '0 16px 16px', fontSize: 11 }}>
          Le nom de l'organisation est déjà appliqué dans l'en-tête. Langue et format de date sont enregistrés pour l'instant sans effet
          sur l'interface (pas encore de traduction multilingue) — la base est posée pour un futur passage à l'internationalisation.
        </div>
      </Panel>

      <Panel title="Accès" sub="Visibilité de la Vue générale" span={12}>
        <div style={{ padding: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.homeRestrictedToAdmins}
              onChange={(e) => set('homeRestrictedToAdmins', e.target.checked)}
            />
            <span style={{ fontSize: 13 }}>Réserver la Vue générale aux administrateurs</span>
          </label>
          <div className="faint" style={{ fontSize: 11, marginTop: 6 }}>
            Si activé, les comptes non-admin sont redirigés vers Développement et le lien disparaît de la navigation.
          </div>
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
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 5, color: 'var(--text-muted)' }}>{label}</label>
      {children}
      {hint && <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

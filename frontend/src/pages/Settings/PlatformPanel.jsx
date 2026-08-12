import { useEffect, useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

const TIMEZONES = ['Europe/Paris', 'Europe/London', 'UTC', 'America/New_York', 'America/Los_Angeles'];
const LANGUAGES = [['fr', 'Français'], ['en', 'English']];
const DATE_FORMATS = [['dd/MM/yyyy', 'JJ/MM/AAAA'], ['MM/dd/yyyy', 'MM/JJ/AAAA'], ['yyyy-MM-dd', 'AAAA-MM-JJ']];

export default function PlatformPanel() {
  const { data, reload } = useApi(() => api.get('/settings'), []);
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
        contactEmail: data.console.contactEmail || ''
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

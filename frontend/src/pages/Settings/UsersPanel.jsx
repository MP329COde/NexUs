import { useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotify } from '../../context/NotificationContext.jsx';

export default function UsersPanel() {
  const { user: me } = useAuth();
  const notify = useNotify();
  const { data, reload } = useApi(() => api.get('/users'), []);
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'user' });
  const [busy, setBusy] = useState(false);

  async function invite(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/users', form);
      notify(`Compte créé pour ${form.email}`, { type: 'ok' });
      setForm({ email: '', name: '', password: '', role: 'user' });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  async function toggleRole(u) {
    try {
      await api.put(`/users/${u.id}`, { role: u.role === 'admin' ? 'user' : 'admin' });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  async function toggleActive(u) {
    try {
      await api.put(`/users/${u.id}`, { active: !u.active });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  async function remove(u) {
    if (!confirm(`Supprimer le compte ${u.email} ?`)) return;
    try {
      await api.del(`/users/${u.id}`);
      notify('Utilisateur supprimé', { type: 'info' });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16 }}>
      <Panel title="Utilisateurs de la console" sub="Les administrateurs accèdent aux intégrations ; les autres comptes ne voient que la console et leurs propres réglages" span={8}>
        <DataTable
          columns={['Utilisateur', 'Rôle', 'Statut', 'Actions']}
          rows={data?.items}
          emptyTitle="Aucun utilisateur"
          renderRow={(u) => (
            <tr key={u.id}>
              <td>
                <div style={{ fontWeight: 500 }}>{u.name}</div>
                <div className="faint" style={{ fontSize: 11.5 }}>{u.email}</div>
              </td>
              <td><span className={`badge badge-${u.role === 'admin' ? 'vio' : 'mut'}`}><span className="dot" />{u.role === 'admin' ? 'Administrateur' : 'Utilisateur'}</span></td>
              <td><span className={`badge badge-${u.active ? 'ok' : 'mut'}`}><span className="dot" />{u.active ? 'Actif' : 'Désactivé'}</span></td>
              <td>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span className="btn-outline" style={btnMini} onClick={() => toggleRole(u)}><Icon name="shield" size={13} />{u.role === 'admin' ? 'Rétrograder' : 'Promouvoir'}</span>
                  <span className="btn-outline" style={btnMini} onClick={() => toggleActive(u)}>{u.active ? 'Désactiver' : 'Activer'}</span>
                  {u.id !== me?.id && <span className="btn-outline" style={{ ...btnMini, color: 'var(--tone-crit-fg)' }} onClick={() => remove(u)}><Icon name="trash" size={13} />Suppr.</span>}
                </div>
              </td>
            </tr>
          )}
        />
      </Panel>

      <Panel title="Créer un utilisateur" span={4}>
        <form onSubmit={invite} style={{ padding: 16 }}>
          <Field label="E-mail"><input className="input" type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></Field>
          <Field label="Nom"><input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <Field label="Mot de passe initial"><input className="input" type="password" required minLength={8} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} /></Field>
          <Field label="Rôle">
            <select className="input" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="user">Utilisateur</option>
              <option value="admin">Administrateur</option>
            </select>
          </Field>
          <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'Création…' : 'Créer le compte'}</button>
        </form>
      </Panel>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 5, color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  );
}

const btnMini = { height: 26, padding: '0 9px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5 };

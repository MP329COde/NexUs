import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

const TABS = [
  { id: 'vlans', label: 'VLAN & sous-réseaux', icon: 'layers' },
  { id: 'dhcp-ranges', label: 'DHCP', icon: 'server' },
  { id: 'dns-records', label: 'DNS interne', icon: 'globe' },
  { id: 'vpn-clients', label: 'VPN', icon: 'shield' }
];

const FIELDS = {
  vlans: [
    { key: 'name', label: 'Nom', required: true },
    { key: 'vlanId', label: 'ID VLAN', type: 'number', required: true },
    { key: 'cidr', label: 'CIDR', placeholder: '10.10.20.0/24', required: true },
    { key: 'gateway', label: 'Passerelle' },
    { key: 'description', label: 'Description' }
  ],
  'dhcp-ranges': [
    { key: 'vlanId', label: 'VLAN / sous-réseau' },
    { key: 'rangeStart', label: 'Début de plage', placeholder: '10.10.20.100', required: true },
    { key: 'rangeEnd', label: 'Fin de plage', placeholder: '10.10.20.200', required: true },
    { key: 'leaseMinutes', label: 'Bail (minutes)', type: 'number' },
    { key: 'notes', label: 'Notes' }
  ],
  'dns-records': [
    { key: 'name', label: 'Nom', placeholder: 'app.interne.lan', required: true },
    { key: 'type', label: 'Type', options: ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'PTR'], required: true },
    { key: 'value', label: 'Valeur', required: true },
    { key: 'ttl', label: 'TTL (s)', type: 'number' }
  ],
  'vpn-clients': [
    { key: 'name', label: 'Nom / utilisateur', required: true },
    { key: 'assignedIp', label: 'IP assignée', placeholder: '10.10.99.5', required: true },
    { key: 'vlanId', label: 'VLAN / sous-réseau' },
    { key: 'notes', label: 'Notes' }
  ]
};

function emptyForm(tab) {
  return Object.fromEntries(FIELDS[tab].map((f) => [f.key, f.options ? f.options[0] : '']));
}

// Suivi déclaratif des services réseau internes (VLAN/sous-réseaux, DHCP,
// DNS interne, VPN) : aucune intégration DHCP/DNS/VPN réelle n'est branchée
// aujourd'hui (voir backend/src/store/networkServicesStore.js) — l'admin
// déclare ce qui existe pour garder une vue centralisée, sur le même
// principe que le suivi de stockage (StoragePage).
export default function NetworkServicesPage() {
  const [tab, setTab] = useState('vlans');
  const { data, reload } = useApi(() => api.get(`/network-services/${tab}`), [tab]);
  const notify = useNotify();
  const [form, setForm] = useState(() => emptyForm(tab));
  const [busy, setBusy] = useState(false);

  const items = data?.items || [];
  const fields = FIELDS[tab];

  function switchTab(id) {
    setTab(id);
    setForm(emptyForm(id));
  }

  async function createItem(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/network-services/${tab}`, form);
      notify('Ajouté', { type: 'ok' });
      setForm(emptyForm(tab));
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(item) {
    try {
      await api.del(`/network-services/${tab}/${item.id}`);
      notify('Supprimé', { type: 'ok' });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  return (
    <>
      <PageHeader title="Réseaux internes" sub="VLAN/sous-réseaux, DHCP, DNS interne et VPN — suivi déclaratif, mis à jour manuellement" />

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {TABS.map((t) => (
          <span
            key={t.id}
            onClick={() => switchTab(t.id)}
            className={t.id === tab ? 'btn' : 'btn-outline'}
            style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
          >
            <Icon name={t.icon} size={13} />{t.label}
          </span>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16 }}>
        <Panel title="Ajouter" span={4}>
          <form onSubmit={createItem} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {fields.map((f) => (
              <div key={f.key}>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: 'var(--text-muted)' }}>{f.label}</label>
                {f.options ? (
                  <select className="input" value={form[f.key]} onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}>
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    className="input"
                    type={f.type || 'text'}
                    required={f.required}
                    placeholder={f.placeholder}
                    value={form[f.key] ?? ''}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                  />
                )}
              </div>
            ))}
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Ajout…' : 'Ajouter'}</button>
          </form>
        </Panel>

        <Panel title={TABS.find((t) => t.id === tab).label} sub={`${items.length} élément(s) suivi(s)`} span={8}>
          {items.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>Aucun élément suivi</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr>
                    {fields.map((f) => (
                      <th key={f.key} style={{ textAlign: 'left', padding: '8px 16px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-faint)', borderBottom: '1px solid var(--border-soft)' }}>{f.label}</th>
                    ))}
                    <th style={{ borderBottom: '1px solid var(--border-soft)' }} />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                      {fields.map((f) => (
                        <td key={f.key} style={{ padding: '9px 16px' }} className={f.key.toLowerCase().includes('ip') || f.key === 'cidr' || f.key === 'value' ? 'mono' : ''}>{item[f.key] || '—'}</td>
                      ))}
                      <td style={{ padding: '9px 16px' }}>
                        <span className="btn-outline" style={{ height: 24, padding: '0 8px', fontSize: 11 }} onClick={() => removeItem(item)}>
                          <Icon name="trash" size={11} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

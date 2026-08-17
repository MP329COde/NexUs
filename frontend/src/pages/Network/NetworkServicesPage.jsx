import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './NetworkServicesPage.css';

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

      <div className="nsp-tabs">
        {TABS.map((t) => (
          <span
            key={t.id}
            onClick={() => switchTab(t.id)}
            className={`nsp-tab ${t.id === tab ? 'btn' : 'btn-outline'}`}
          >
            <Icon name={t.icon} size={13} />{t.label}
          </span>
        ))}
      </div>

      <div className="nsp-grid">
        <Panel title="Ajouter" span={4}>
          <form onSubmit={createItem} className="nsp-add-form">
            {fields.map((f) => (
              <div key={f.key}>
                <label className="nsp-field-label">{f.label}</label>
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
            <div className="nsp-empty">Aucun élément suivi</div>
          ) : (
            <div className="nsp-table-wrap">
              <table className="nsp-table">
                <thead>
                  <tr>
                    {fields.map((f) => (
                      <th key={f.key} className="nsp-th">{f.label}</th>
                    ))}
                    <th className="nsp-th" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="nsp-row">
                      {fields.map((f) => (
                        <td key={f.key} className={`nsp-td ${f.key.toLowerCase().includes('ip') || f.key === 'cidr' || f.key === 'value' ? 'mono' : ''}`}>{item[f.key] || '—'}</td>
                      ))}
                      <td className="nsp-td">
                        <span className="btn-outline nsp-delete-btn" onClick={() => removeItem(item)}>
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

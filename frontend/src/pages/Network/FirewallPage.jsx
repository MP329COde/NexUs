import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotify } from '../../context/NotificationContext.jsx';

const SUSPECT_STATUS_LABEL = { 401: 'Non authentifié', 403: 'Refusé', 429: 'Limité (rate-limit)' };

// Pare-feu applicatif de la console : trafic API temps réel (polling court),
// détection des IPs qui accumulent des requêtes en échec, et blocage manuel
// ou automatique via le banlist existant (Cybersécurité → IPs bannies).
export default function FirewallPage() {
  const { user } = useAuth();
  const notify = useNotify();
  const { data, reload } = useApi(() => api.get('/security/traffic'), [], { pollMs: 5000 });

  const items = data?.items || [];
  const suspicious = data?.suspicious || [];
  const autoBlockEnabled = data?.settings?.autoBlockEnabled ?? false;

  async function toggleAutoBlock() {
    try {
      await api.put('/security/traffic/auto-block', { enabled: !autoBlockEnabled });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  async function ban(ip) {
    try {
      await api.post('/security/banlist', { ip, reason: 'Bloquée manuellement depuis le pare-feu' });
      notify(`${ip} bannie`, { type: 'ok' });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  return (
    <>
      <PageHeader
        title="Pare-feu"
        sub="Trafic API en temps réel et blocage des adresses suspectes"
        actions={user?.role === 'admin' && (
          <button className="btn-outline" onClick={toggleAutoBlock} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: autoBlockEnabled ? 'var(--tone-ok-dot)' : 'var(--tone-mut-dot)' }} />
            Blocage automatique {autoBlockEnabled ? 'activé' : 'désactivé'}
          </button>
        )}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16 }}>
        {user?.role === 'admin' && (
          <Panel title="Adresses suspectes" sub="Trop de requêtes en échec (401/403/429) sur une courte fenêtre" span={12}>
            {suspicious.length === 0 ? (
              <div className="faint" style={{ fontSize: 12.5, textAlign: 'center', padding: 20 }}>Aucune activité suspecte détectée</div>
            ) : (
              <DataTable
                columns={['IP', 'Requêtes suspectes', 'Seuil', 'Statut', '']}
                rows={suspicious}
                renderRow={(s) => (
                  <tr key={s.ip}>
                    <td className="mono" style={{ fontWeight: 600 }}>{s.ip}</td>
                    <td>{s.count}</td>
                    <td className="mono muted">{s.threshold}</td>
                    <td><span className={`badge badge-${s.banned ? 'crit' : 'warn'}`}><span className="dot" />{s.banned ? 'Bannie' : 'Sous surveillance'}</span></td>
                    <td>{!s.banned && <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5 }} onClick={() => ban(s.ip)}>Bannir</span>}</td>
                  </tr>
                )}
              />
            )}
          </Panel>
        )}

        <Panel title="Trafic récent" sub="Dernières requêtes reçues par l'API" span={12}>
          <DataTable
            columns={['Heure', 'Méthode', 'Chemin', 'IP', 'Statut']}
            rows={items}
            emptyTitle="Aucune requête enregistrée"
            renderRow={(t, i) => (
              <tr key={i}>
                <td className="mono faint">{new Date(t.ts).toLocaleTimeString('fr-FR')}</td>
                <td className="mono muted">{t.method}</td>
                <td className="mono" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.path}</td>
                <td className="mono">{t.ip}</td>
                <td>
                  <span className={`badge badge-${t.status >= 500 ? 'crit' : t.status >= 400 ? 'warn' : 'ok'}`}>
                    <span className="dot" />{t.status}{SUSPECT_STATUS_LABEL[t.status] ? ` · ${SUSPECT_STATUS_LABEL[t.status]}` : ''}
                  </span>
                </td>
              </tr>
            )}
          />
        </Panel>
      </div>
    </>
  );
}

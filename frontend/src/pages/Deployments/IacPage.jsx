import { useEffect, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import Modal from '../../components/ui/Modal.jsx';
import ActionConfirmModal from '../../components/ui/ActionConfirmModal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

// Infrastructure as Code : chaque ligne est une VM Proxmox déclarée depuis
// Nexus et matérialisée en vrais fichiers Terraform (provider bpg/proxmox),
// voir routes/iac.routes.js. `terraform plan`/`apply`/`destroy` s'exécutent
// réellement sur la machine backend — rien n'est simulé, et une VM
// absente/un binaire Terraform manquant remonte une erreur explicite plutôt
// qu'un faux succès.
export default function IacPage() {
  const { data, reload } = useApi(() => api.get('/iac/workspaces'), []);
  const items = data?.items || [];
  const notify = useNotify();
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [planFor, setPlanFor] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  async function deleteWorkspace(ws) {
    try {
      await api.del(`/iac/workspaces/${ws.id}`);
      notify('Espace de travail supprimé', { type: 'ok' });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  return (
    <>
      <PageHeader
        title="Infrastructure as Code"
        sub="Machines déclarées depuis la console, provisionnées via Terraform réel (provider Proxmox)."
        actions={(
          <span className="btn" onClick={() => setCreating(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="plus" size={13} />Déclarer une VM
          </span>
        )}
      />

      <Panel title="Espaces de travail" span={12}>
        {items.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>
            Aucune infrastructure déclarée — « Déclarer une VM » génère un espace de travail Terraform prêt à planifier.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr>
                  {['Nom', 'Nœud Proxmox', 'VM ID', 'Ressources', 'Dernier plan', 'Dernier apply', ''].map((c) => (
                    <th key={c} style={{ textAlign: 'left', padding: '8px 16px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-faint)', borderBottom: '1px solid var(--border-soft)' }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((ws) => (
                  <tr key={ws.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                    <td style={{ padding: '9px 16px', fontWeight: 600 }}>{ws.name}<div className="faint">{ws.vmName}</div></td>
                    <td style={{ padding: '9px 16px' }} className="mono muted">{ws.node}</td>
                    <td style={{ padding: '9px 16px' }} className="mono muted">{ws.vmId}</td>
                    <td style={{ padding: '9px 16px' }} className="mono muted">{ws.cores} vCPU · {ws.memoryMb} Mo · {ws.diskGb} Go</td>
                    <td style={{ padding: '9px 16px', color: 'var(--text-faint)' }}>{ws.lastPlanAt ? `${new Date(ws.lastPlanAt).toLocaleString('fr-FR')} · ${ws.lastPlanSummary}` : '—'}</td>
                    <td style={{ padding: '9px 16px', color: 'var(--text-faint)' }}>{ws.lastApplyAt ? new Date(ws.lastApplyAt).toLocaleString('fr-FR') : '—'}</td>
                    <td style={{ padding: '9px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <span className="btn-outline" style={{ height: 24, padding: '0 8px', fontSize: 11 }} onClick={() => setViewing(ws)}>.tf</span>
                        <span className="btn-outline" style={{ height: 24, padding: '0 8px', fontSize: 11 }} onClick={() => setPlanFor(ws)}>Plan</span>
                        <span className="btn-outline" style={{ height: 24, padding: '0 8px', fontSize: 11, color: 'var(--tone-warn-fg)' }} onClick={() => setConfirmAction({ type: 'apply', ws })}>Apply</span>
                        <span className="btn-outline" style={{ height: 24, padding: '0 8px', fontSize: 11, color: 'var(--tone-crit-fg)' }} onClick={() => setConfirmAction({ type: 'destroy', ws })}>Destroy</span>
                        <span className="btn-outline" style={{ height: 24, padding: '0 8px', fontSize: 11 }} onClick={() => deleteWorkspace(ws)}><Icon name="trash" size={11} /></span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {creating && <CreateWorkspaceModal onClose={() => setCreating(false)} onCreated={reload} />}
      {viewing && <ViewTfModal ws={viewing} onClose={() => setViewing(null)} />}
      {planFor && <PlanModal ws={planFor} onClose={() => setPlanFor(null)} onDone={reload} />}

      {confirmAction?.type === 'apply' && (
        <ActionConfirmModal
          title={`Appliquer l'infrastructure — ${confirmAction.ws.name}`}
          sub={confirmAction.ws.vmName}
          tone="warn"
          confirmLabel="Appliquer"
          requireTypedConfirmation={confirmAction.ws.name}
          impact={[
            'Exécute réellement "terraform apply" : crée ou modifie la VM sur le cluster Proxmox configuré.',
            'Consomme des ressources réelles (CPU/RAM/disque) sur le nœud ciblé.'
          ]}
          onClose={() => setConfirmAction(null)}
          onConfirm={async () => {
            const res = await api.post(`/iac/workspaces/${confirmAction.ws.id}/apply`, {});
            notify('Infrastructure appliquée', { type: 'ok' });
            reload();
            return res;
          }}
        />
      )}
      {confirmAction?.type === 'destroy' && (
        <ActionConfirmModal
          title={`Détruire l'infrastructure — ${confirmAction.ws.name}`}
          sub={confirmAction.ws.vmName}
          tone="crit"
          confirmLabel="Détruire"
          requireTypedConfirmation={confirmAction.ws.name}
          impact={[
            'Exécute réellement "terraform destroy" : supprime la VM correspondante sur Proxmox.',
            'Irréversible — toute donnée sur cette VM est perdue.'
          ]}
          onClose={() => setConfirmAction(null)}
          onConfirm={async () => {
            await api.post(`/iac/workspaces/${confirmAction.ws.id}/destroy`, {});
            notify('Infrastructure détruite', { type: 'ok' });
            reload();
          }}
        />
      )}
    </>
  );
}

function CreateWorkspaceModal({ onClose, onCreated }) {
  const notify = useNotify();
  const [form, setForm] = useState({ name: '', node: '', vmId: '', vmName: '', templateVmId: '', cores: 2, memoryMb: 2048, diskGb: 20 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/iac/workspaces', form);
      notify('Espace de travail Terraform généré', { type: 'ok' });
      onCreated();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Déclarer une VM" sub="Génère un espace de travail Terraform (provider Proxmox)" onClose={onClose} width={460}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="Nom (Nexus)"><input className="input" required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="dev-app-preview" /></Field>
        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Nœud Proxmox" style={{ flex: 1 }}><input className="input" required value={form.node} onChange={(e) => set('node', e.target.value)} placeholder="pve1" /></Field>
          <Field label="VM ID" style={{ flex: 1 }}><input className="input mono" type="number" required value={form.vmId} onChange={(e) => set('vmId', e.target.value)} placeholder="9001" /></Field>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Nom de la VM" style={{ flex: 1 }}><input className="input" required value={form.vmName} onChange={(e) => set('vmName', e.target.value)} placeholder="dev-app-preview" /></Field>
          <Field label="Template à cloner (VM ID)" style={{ flex: 1 }}><input className="input mono" type="number" required value={form.templateVmId} onChange={(e) => set('templateVmId', e.target.value)} placeholder="9000" /></Field>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="vCPU" style={{ flex: 1 }}><input className="input mono" type="number" value={form.cores} onChange={(e) => set('cores', e.target.value)} /></Field>
          <Field label="Mémoire (Mo)" style={{ flex: 1 }}><input className="input mono" type="number" value={form.memoryMb} onChange={(e) => set('memoryMb', e.target.value)} /></Field>
          <Field label="Disque (Go)" style={{ flex: 1 }}><input className="input mono" type="number" value={form.diskGb} onChange={(e) => set('diskGb', e.target.value)} /></Field>
        </div>
        {error && <div style={{ fontSize: 12, color: 'var(--tone-crit-fg)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <span className="btn-outline" onClick={onClose}>Annuler</span>
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Génération…' : 'Générer'}</button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, children, style }) {
  return (
    <div style={style}>
      <label style={{ display: 'block', fontSize: 11.5, marginBottom: 4, color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  );
}

function ViewTfModal({ ws, onClose }) {
  const { data, loading, error } = useApi(() => api.get(`/iac/workspaces/${ws.id}/main.tf`), [ws.id]);
  return (
    <Modal title="main.tf" sub={ws.name} onClose={onClose} width={620}>
      {loading && <div className="faint" style={{ fontSize: 12.5 }}>Chargement…</div>}
      {error && <div style={{ fontSize: 12.5, color: 'var(--tone-crit-fg)' }}>{error}</div>}
      {data && <pre className="mono" style={{ margin: 0, padding: 14, borderRadius: 8, background: 'var(--surface-2, var(--bg))', fontSize: 12, lineHeight: 1.6, overflowX: 'auto', maxHeight: 460 }}>{data.content}</pre>}
    </Modal>
  );
}

function PlanModal({ ws, onClose, onDone }) {
  const notify = useNotify();
  const [busy, setBusy] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.post(`/iac/workspaces/${ws.id}/plan`, {});
        setResult(res);
        onDone();
      } catch (err) {
        setError(err.message);
        notify(err.message, { type: 'crit' });
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  return (
    <Modal title="terraform plan" sub={ws.name} onClose={onClose} width={620}>
      {busy && <div className="faint" style={{ fontSize: 12.5 }}>Exécution de "terraform plan"…</div>}
      {error && <div style={{ fontSize: 12.5, color: 'var(--tone-crit-fg)' }}>{error}</div>}
      {result && (
        <>
          <div style={{ marginBottom: 10 }}>
            <span className={`badge badge-${result.hasChanges ? 'warn' : 'ok'}`}><span className="dot" />{result.hasChanges ? 'Changements détectés' : 'Aucun changement'}</span>
          </div>
          <pre className="mono" style={{ margin: 0, padding: 14, borderRadius: 8, background: 'var(--surface-2, var(--bg))', fontSize: 11.5, lineHeight: 1.6, overflowX: 'auto', maxHeight: 420, whiteSpace: 'pre-wrap' }}>{result.output}</pre>
        </>
      )}
    </Modal>
  );
}

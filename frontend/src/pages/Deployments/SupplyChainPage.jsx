import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import DemoNote from '../../components/ui/DemoNote.jsx';
import CodeScanPanel from './CodeScanPanel.jsx';
import IacScanPanel from './IacScanPanel.jsx';

// SBOM et signature restent non intégrés — le reste du pipeline (source,
// SAST, secrets, dépendances/conteneur, IaC, déploiement) est désormais
// réel : Semgrep (CodeScanPanel), le scan de secrets committés (Secrets &
// variables), Trivy (Images & registry), Checkov (IacScanPanel) et Argo CD
// (Déploiements).
const STAGES = [
  { id: 'source', label: 'Source', icon: 'gitBranch', tool: 'Dépôts Git (réel)', note: 'Code source récupéré depuis GitLab/GitHub — voir Dépôts Git.', real: true },
  { id: 'sast', label: 'SAST', icon: 'terminal', tool: 'Semgrep (réel, ci-dessous)', note: 'Analyse statique du code à la recherche de vulnérabilités.', real: true },
  { id: 'secrets', label: 'Scan de secrets', icon: 'lock', tool: 'Scan quotidien (réel, voir Secrets & variables)', note: 'Détection de clés/mots de passe accidentellement committés.', real: true },
  { id: 'deps', label: 'Scan de dépendances', icon: 'box', tool: 'Trivy (réel, voir Images & registry)', note: 'Vulnérabilités connues (CVE) dans les librairies utilisées.', real: true },
  { id: 'container', label: 'Scan de conteneur', icon: 'cube', tool: 'Trivy (réel, voir Images & registry)', note: 'Vulnérabilités dans l\'image construite (OS + dépendances).', real: true },
  { id: 'iac', label: 'IaC', icon: 'layers', tool: 'Checkov (réel, ci-dessous)', note: 'Bonnes pratiques de sécurité sur les Dockerfiles et manifests.', real: true },
  { id: 'sbom', label: 'SBOM', icon: 'layers', tool: 'ex. Syft', note: 'Inventaire logiciel de l\'image (Software Bill of Materials).', real: false },
  { id: 'signature', label: 'Signature', icon: 'certificate', tool: 'ex. Cosign / Sigstore', note: 'Signature cryptographique de l\'image avant publication.', real: false },
  { id: 'registry', label: 'Registre', icon: 'image', tool: 'Docker Hub public (réel) — registre privé en démonstration', note: 'Publication de l\'image signée dans le registre.', real: false },
  { id: 'argocd', label: 'Argo CD', icon: 'sync', tool: 'Déploiements (réel)', note: 'Déploiement — voir GitOps Diff sur la fiche de déploiement.', real: true }
];

export default function SupplyChainPage() {
  return (
    <>
      <PageHeader title="Supply Chain Security" sub="Pipeline de sécurité de la chaîne d'approvisionnement logicielle, de la source au déploiement." />
      <DemoNote>
        SBOM et signature d'image ne sont pas encore intégrés. Le reste du pipeline est réel : Semgrep (SAST, ci-dessous), scan quotidien de secrets committés,
        Trivy (dépendances/conteneur) et Docker Hub public — voir les badges "Réel" ci-dessous.
      </DemoNote>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16, marginBottom: 16 }}>
        <CodeScanPanel />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16, marginBottom: 16 }}>
        <IacScanPanel />
      </div>

      <Panel title="Pipeline" sub="Source → build → sécurité → registre → déploiement" span={12} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0, padding: 16 }}>
          {STAGES.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: 160, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-soft)', textAlign: 'center' }}>
                <Icon name={s.icon} size={18} style={{ color: 'var(--text-faint)', marginBottom: 6 }} />
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{s.label}</div>
                <div className={`badge badge-${s.real ? 'ok' : s.id === 'registry' ? 'warn' : 'mut'}`} style={{ marginTop: 6 }}>
                  <span className="dot" />{s.real ? 'Réel' : s.id === 'registry' ? 'Partiel' : 'Non intégré'}
                </div>
              </div>
              {i < STAGES.length - 1 && <Icon name="chevronDown" size={14} style={{ transform: 'rotate(-90deg)', color: 'var(--text-faintest)', flex: 'none', margin: '0 4px' }} />}
            </div>
          ))}
        </div>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16, marginBottom: 16 }}>
        {STAGES.filter((s) => !['source', 'argocd', 'sast', 'iac'].includes(s.id)).map((s) => (
          <Panel key={s.id} title={(<span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Icon name={s.icon} size={13} style={{ color: 'var(--text-faint)' }} />{s.label}</span>)} span={4}>
            <div style={{ padding: 14, fontSize: 12.5 }}>
              <div className="faint" style={{ marginBottom: 6 }}>{s.note}</div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-faintest)' }}>Outil à intégrer : {s.tool}</div>
            </div>
          </Panel>
        ))}
      </div>

      <Panel title="Security Gate" sub="Décision automatique à l'entrée d'Argo CD — démonstration" span={12}>
        <DemoNote>Exemple de ce que produirait un Security Gate une fois les scanners ci-dessus connectés — seuils et résultat illustratifs, pas calculés.</DemoNote>
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 20, fontSize: 12.5 }}>
            <span>Critical : <strong className="mono">0</strong></span>
            <span>High : <strong className="mono">0</strong></span>
            <span>Medium : <strong className="mono">4</strong></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, background: 'var(--tone-ok-soft, var(--primary-soft))', color: 'var(--tone-ok-fg)', fontSize: 12.5, fontWeight: 600 }}>
            <Icon name="check" size={15} />Déploiement autorisé — aucune vulnérabilité critique ou élevée
          </div>
          <div className="faint" style={{ fontSize: 11.5 }}>
            Règle type : bloquer le déploiement (refuser la synchronisation Argo CD) si au moins une vulnérabilité "Critical" est détectée par le scan de conteneur ou de dépendances.
          </div>
        </div>
      </Panel>
    </>
  );
}

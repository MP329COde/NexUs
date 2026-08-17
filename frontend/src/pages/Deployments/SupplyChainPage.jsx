import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import DemoNote from '../../components/ui/DemoNote.jsx';
import CodeScanPanel from './CodeScanPanel.jsx';
import IacScanPanel from './IacScanPanel.jsx';
import DastScanPanel from './DastScanPanel.jsx';
import SecurityGatePanel from './SecurityGatePanel.jsx';
import './SupplyChainPage.css';

// Tout le pipeline (source, SAST, secrets, dépendances/conteneur, IaC, SBOM,
// signature, registre, déploiement) est désormais réel : Semgrep
// (CodeScanPanel), le scan de secrets committés (Secrets & variables), Trivy
// et Syft (Images & registry), Checkov (IacScanPanel), cosign (signature du
// SBOM, Images & registry), le registre privé (Docker Distribution, optionnel
// — voir install.sh) et Argo CD (Déploiements).
const STAGES = [
  { id: 'source', label: 'Source', icon: 'gitBranch', tool: 'Dépôts Git (réel)', note: 'Code source récupéré depuis GitLab/GitHub — voir Dépôts Git.', real: true },
  { id: 'sast', label: 'SAST', icon: 'terminal', tool: 'Semgrep (réel, ci-dessous)', note: 'Analyse statique du code à la recherche de vulnérabilités.', real: true },
  { id: 'dast', label: 'DAST', icon: 'globe', tool: 'OWASP ZAP (réel, ci-dessous)', note: 'Analyse dynamique d\'une application déjà en ligne.', real: true },
  { id: 'secrets', label: 'Scan de secrets', icon: 'lock', tool: 'Scan quotidien (réel, voir Secrets & variables)', note: 'Détection de clés/mots de passe accidentellement committés.', real: true },
  { id: 'deps', label: 'Scan de dépendances', icon: 'box', tool: 'Trivy (réel, voir Images & registry)', note: 'Vulnérabilités connues (CVE) dans les librairies utilisées.', real: true },
  { id: 'container', label: 'Scan de conteneur', icon: 'cube', tool: 'Trivy (réel, voir Images & registry)', note: 'Vulnérabilités dans l\'image construite (OS + dépendances).', real: true },
  { id: 'iac', label: 'IaC', icon: 'layers', tool: 'Checkov (réel, ci-dessous)', note: 'Bonnes pratiques de sécurité sur les Dockerfiles et manifests.', real: true },
  { id: 'sbom', label: 'SBOM', icon: 'layers', tool: 'Syft (réel, voir Images & registry)', note: 'Inventaire logiciel de l\'image (Software Bill of Materials).', real: true },
  { id: 'signature', label: 'Signature', icon: 'certificate', tool: 'cosign / Sigstore (réel, voir Images & registry)', note: 'Signature cryptographique du SBOM avant publication.', real: true },
  { id: 'registry', label: 'Registre', icon: 'image', tool: 'Registre privé + Docker Hub public (réels, voir Images & registry)', note: 'Publication de l\'image signée dans le registre.', real: true },
  { id: 'argocd', label: 'Argo CD', icon: 'sync', tool: 'Déploiements (réel)', note: 'Déploiement — voir GitOps Diff sur la fiche de déploiement.', real: true }
];

export default function SupplyChainPage() {
  return (
    <>
      <PageHeader title="Supply Chain Security" sub="Pipeline de sécurité de la chaîne d'approvisionnement logicielle, de la source au déploiement." />
      <DemoNote>
        Pipeline entièrement réel : Semgrep (SAST, ci-dessous), OWASP ZAP (DAST, ci-dessous, cible limitée aux domaines déjà déclarés), scan quotidien de secrets committés, Trivy (dépendances/conteneur, planifié + à la demande),
        Syft (SBOM), signature cosign du SBOM, Checkov (IaC) et registre privé (optionnel, activé via install.sh) — voir les badges "Réel" ci-dessous.
      </DemoNote>

      <div className="scp-panel-row">
        <CodeScanPanel />
      </div>

      <div className="scp-panel-row">
        <IacScanPanel />
      </div>

      <div className="scp-panel-row">
        <DastScanPanel />
      </div>

      <Panel title="Pipeline" sub="Source → build → sécurité → registre → déploiement" span={12} style={{ marginBottom: 16 }}>
        <div className="scp-pipeline-row">
          {STAGES.map((s, i) => (
            <div key={s.id} className="scp-stage-item">
              <div className="scp-stage-card">
                <Icon name={s.icon} size={18} className="scp-stage-icon" />
                <div className="scp-stage-label">{s.label}</div>
                <div className={`badge badge-${s.real ? 'ok' : s.id === 'registry' ? 'warn' : 'mut'} scp-stage-badge`}>
                  <span className="dot" />{s.real ? 'Réel' : s.id === 'registry' ? 'Partiel' : 'Non intégré'}
                </div>
              </div>
              {i < STAGES.length - 1 && <Icon name="chevronDown" size={14} className="scp-stage-arrow" />}
            </div>
          ))}
        </div>
      </Panel>

      <div className="scp-panel-row">
        {STAGES.filter((s) => !['source', 'argocd', 'sast', 'dast', 'iac', 'sbom'].includes(s.id)).map((s) => (
          <Panel key={s.id} title={(<span className="scp-stub-title"><Icon name={s.icon} size={13} className="scp-stub-title-icon" />{s.label}</span>)} span={4}>
            <div className="scp-stub-body">
              <div className="faint scp-stub-note">{s.note}</div>
              <div className="mono scp-stub-tool">Outil à intégrer : {s.tool}</div>
            </div>
          </Panel>
        ))}
      </div>

      <SecurityGatePanel />
    </>
  );
}

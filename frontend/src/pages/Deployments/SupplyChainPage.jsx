import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import DemoNote from '../../components/ui/DemoNote.jsx';

// Aucun scanner de sécurité (SAST, secrets, dépendances, conteneurs, SBOM,
// signature) n'est intégré à la console — contrairement au reste de
// Développement, rien ici n'est branché sur un outil réel. Cette page
// documente honnêtement le pipeline cible et ce qu'il faudrait connecter
// pour chaque étape, plutôt que d'inventer des résultats de scan.
const STAGES = [
  { id: 'source', label: 'Source', icon: 'gitBranch', tool: 'Dépôts Git (déjà réel)', note: 'Code source récupéré depuis GitLab/GitHub — voir Dépôts Git.' },
  { id: 'sast', label: 'SAST', icon: 'terminal', tool: 'ex. Semgrep, CodeQL', note: 'Analyse statique du code à la recherche de vulnérabilités.' },
  { id: 'secrets', label: 'Scan de secrets', icon: 'lock', tool: 'ex. Gitleaks, TruffleHog', note: 'Détection de clés/mots de passe accidentellement committés.' },
  { id: 'deps', label: 'Scan de dépendances', icon: 'box', tool: 'ex. Trivy, Snyk, Dependabot', note: 'Vulnérabilités connues (CVE) dans les librairies utilisées.' },
  { id: 'container', label: 'Scan de conteneur', icon: 'cube', tool: 'ex. Trivy, Grype', note: 'Vulnérabilités dans l\'image construite (OS + dépendances).' },
  { id: 'sbom', label: 'SBOM', icon: 'layers', tool: 'ex. Syft', note: 'Inventaire logiciel de l\'image (Software Bill of Materials).' },
  { id: 'signature', label: 'Signature', icon: 'certificate', tool: 'ex. Cosign / Sigstore', note: 'Signature cryptographique de l\'image avant publication.' },
  { id: 'registry', label: 'Registre', icon: 'image', tool: 'Images & registry (démonstration)', note: 'Publication de l\'image signée dans le registre.' },
  { id: 'argocd', label: 'Argo CD', icon: 'sync', tool: 'Déploiements (déjà réel)', note: 'Déploiement — voir GitOps Diff sur la fiche de déploiement.' }
];

export default function SupplyChainPage() {
  return (
    <>
      <PageHeader title="Supply Chain Security" sub="Pipeline de sécurité de la chaîne d'approvisionnement logicielle, de la source au déploiement." />
      <DemoNote>
        Aucun scanner de sécurité n'est intégré à la console (pas de SAST, scan de secrets, de dépendances, de conteneur, SBOM ou signature configurés).
        Cette page documente le pipeline cible et ce qu'il faudrait connecter à chaque étape — aucun résultat de scan n'est inventé.
      </DemoNote>

      <Panel title="Pipeline" sub="Source → build → sécurité → registre → déploiement" span={12} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0, padding: 16 }}>
          {STAGES.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: 160, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-soft)', textAlign: 'center' }}>
                <Icon name={s.icon} size={18} style={{ color: 'var(--text-faint)', marginBottom: 6 }} />
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{s.label}</div>
                <div className={`badge badge-${s.id === 'source' || s.id === 'argocd' ? 'ok' : s.id === 'registry' ? 'warn' : 'mut'}`} style={{ marginTop: 6 }}>
                  <span className="dot" />{s.id === 'source' || s.id === 'argocd' ? 'Réel' : s.id === 'registry' ? 'Démo' : 'Non intégré'}
                </div>
              </div>
              {i < STAGES.length - 1 && <Icon name="chevronDown" size={14} style={{ transform: 'rotate(-90deg)', color: 'var(--text-faintest)', flex: 'none', margin: '0 4px' }} />}
            </div>
          ))}
        </div>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16, marginBottom: 16 }}>
        {STAGES.filter((s) => !['source', 'argocd'].includes(s.id)).map((s) => (
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

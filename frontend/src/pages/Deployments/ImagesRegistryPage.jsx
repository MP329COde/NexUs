import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import Icon from '../../components/ui/Icon.jsx';
import DemoNote from '../../components/ui/DemoNote.jsx';
import TrivyScanPanel from './TrivyScanPanel.jsx';
import DockerHubLookupPanel from './DockerHubLookupPanel.jsx';
import SbomPanel from './SbomPanel.jsx';
import PrivateRegistryPanel from './PrivateRegistryPanel.jsx';
import './ImagesRegistryPage.css';

// Démonstration : aucune intégration de registre d'images (Harbor, GHCR
// interrogé en détail...) n'existe dans la console.
const IMAGES = [
  { name: 'api-gateway', tag: 'v2.8.1', size: '42 Mo', signed: true, cve: 0, pushed: 'il y a 2 h' },
  { name: 'web-console', tag: 'v3.1.0', size: '118 Mo', signed: true, cve: 2, pushed: 'il y a 6 h' },
  { name: 'metrics-agent', tag: 'v1.4.2', size: '11 Mo', signed: true, cve: 0, pushed: 'hier' },
  { name: 'legacy-worker', tag: 'v0.9.4', size: '310 Mo', signed: false, cve: 3, pushed: 'il y a 8 mois' }
];

export default function ImagesRegistryPage() {
  return (
    <>
      <PageHeader title="Images & registry" sub="Images publiées, taille, signatures et vulnérabilités détectées." />
      <DemoNote>Le tableau "Dépôt d'images" ci-dessous reste illustratif — un vrai registre privé (Docker Distribution) est disponible juste au-dessus une fois activé (voir install.sh).</DemoNote>

      <div className="images-panel-row">
        <DockerHubLookupPanel />
      </div>

      <div className="images-panel-row">
        <TrivyScanPanel />
      </div>

      <div className="images-panel-row">
        <SbomPanel />
      </div>

      <div className="images-panel-row">
        <PrivateRegistryPanel />
      </div>

      <div className="images-kpi-grid">
        <KpiCard label="Images" value={IMAGES.length} tint="#3B82F6" />
        <KpiCard label="Espace utilisé" value="34,2" unit="Go" tint="#8B5CF6" />
        <KpiCard label="Images signées" value={IMAGES.filter((i) => i.signed).length} unit={`/ ${IMAGES.length}`} tint="#10B981" />
        <KpiCard label="CVE critiques" value={IMAGES.reduce((s, i) => s + i.cve, 0)} tint="#F43F5E" />
      </div>

      <Panel title="Dépôt d'images" sub="Démonstration — aucun registre intégré, indépendant du scanner Trivy ci-dessus" span={12}>
        <div className="images-table-wrap">
          <table className="images-table">
            <thead>
              <tr>
                {['Image', 'Tag', 'Taille', 'Signée', 'CVE', 'Poussée'].map((c) => (
                  <th key={c} className="images-table-head">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {IMAGES.map((i) => (
                <tr key={i.name} className="images-table-row">
                  <td className="images-table-cell images-cell-name">
                    <span className="images-name-with-icon"><Icon name="image" size={13} className="images-name-icon" />{i.name}</span>
                  </td>
                  <td className="images-table-cell mono muted">{i.tag}</td>
                  <td className="images-table-cell mono muted">{i.size}</td>
                  <td className="images-table-cell"><span className={`badge badge-${i.signed ? 'ok' : 'crit'}`}><span className="dot" />{i.signed ? 'Oui' : 'Non'}</span></td>
                  <td className="images-table-cell"><span className={`badge badge-${i.cve === 0 ? 'ok' : i.cve <= 2 ? 'warn' : 'crit'}`}><span className="dot" />{i.cve}</span></td>
                  <td className="images-table-cell images-cell-pushed">{i.pushed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

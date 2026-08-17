import PageHeader from '../../components/ui/PageHeader.jsx';
import TrivyScanPanel from './TrivyScanPanel.jsx';
import DockerHubLookupPanel from './DockerHubLookupPanel.jsx';
import SbomPanel from './SbomPanel.jsx';
import PrivateRegistryPanel from './PrivateRegistryPanel.jsx';
import './ImagesRegistryPage.css';

export default function ImagesRegistryPage() {
  return (
    <>
      <PageHeader title="Images & registry" sub="Images publiées, taille, signatures et vulnérabilités détectées." />

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
    </>
  );
}

import { Outlet, useMatches } from 'react-router-dom';
import Header from './Header.jsx';
import DomainNav from './DomainNav.jsx';

export default function Shell() {
  const matches = useMatches();
  const title = [...matches].reverse().find((m) => m.handle?.title)?.handle?.title ?? 'Nexus Console';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Header title={title} />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <DomainNav />
        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          <div style={{ maxWidth: 1480, margin: '0 auto', padding: '24px 28px 56px' }}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

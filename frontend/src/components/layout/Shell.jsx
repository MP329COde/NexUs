import { useEffect, useState } from 'react';
import { Outlet, useMatches } from 'react-router-dom';
import Header from './Header.jsx';
import DomainNav from './DomainNav.jsx';
import CommandPalette from '../search/CommandPalette.jsx';

export default function Shell() {
  const matches = useMatches();
  const title = [...matches].reverse().find((m) => m.handle?.title)?.handle?.title ?? 'Nexus Console';
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="app-shell" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div className="no-print"><Header title={title} onOpenSearch={() => setSearchOpen(true)} /></div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div className="no-print"><DomainNav /></div>
        <main className="app-main" style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          <div style={{ maxWidth: 1480, margin: '0 auto', padding: '24px 28px 56px' }}>
            <Outlet />
          </div>
        </main>
      </div>
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

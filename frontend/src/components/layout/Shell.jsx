import { useEffect, useState } from 'react';
import { Outlet, useLocation, useMatches } from 'react-router-dom';
import Header from './Header.jsx';
import DomainNav from './DomainNav.jsx';
import CommandPalette from '../search/CommandPalette.jsx';
import { useCommandCenter } from '../../context/CommandCenterContext.jsx';

const COLLAPSE_KEY = 'nexus-nav-collapsed';

export default function Shell() {
  const matches = useMatches();
  const location = useLocation();
  const title = [...matches].reverse().find((m) => m.handle?.title)?.handle?.title ?? 'Nexus Console';
  const { open: searchOpen, context: searchContext, openPalette, closePalette } = useCommandCenter();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e) {
      // ⌘K / Ctrl+K (historique) et ⌘⇧F / Ctrl+Shift+F (Command Center) ouvrent
      // la même palette, sans contexte particulier — seules les icônes "..."
      // posées sur une ressource (pod, deployment...) l'ouvrent avec un contexte.
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      const isCmdShiftF = (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f';
      if (isCmdK || isCmdShiftF) {
        e.preventDefault();
        openPalette();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openPalette]);

  // Referme le tiroir mobile à chaque navigation, pour ne pas avoir à le
  // fermer manuellement après avoir choisi une destination.
  useEffect(() => setMobileNavOpen(false), [location.pathname]);

  function toggleCollapsed() {
    setCollapsed((v) => {
      localStorage.setItem(COLLAPSE_KEY, v ? '0' : '1');
      return !v;
    });
  }

  return (
    <div className="app-shell" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div className="no-print">
        <Header title={title} onOpenSearch={() => openPalette()} onOpenNav={() => setMobileNavOpen(true)} />
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div className="no-print" style={{ height: '100%' }}>
          <DomainNav
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
            mobileOpen={mobileNavOpen}
            onCloseMobile={() => setMobileNavOpen(false)}
          />
        </div>
        <main className="app-main" style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          <div key={location.pathname} className="route-page" style={{ maxWidth: 1480, margin: '0 auto', padding: '24px 28px 56px' }}>
            <Outlet />
          </div>
        </main>
      </div>
      <CommandPalette open={searchOpen} onClose={closePalette} context={searchContext} />
    </div>
  );
}

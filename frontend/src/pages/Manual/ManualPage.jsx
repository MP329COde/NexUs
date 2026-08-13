import { useEffect, useState } from 'react';
import Icon from '../../components/ui/Icon.jsx';
import { MANUAL_SECTIONS } from './manualContent.js';

function Block({ block }) {
  if (block.type === 'p') {
    return <p style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--text-muted)', margin: '0 0 12px' }}>{block.text}</p>;
  }
  if (block.type === 'ul' || block.type === 'ol') {
    const Tag = block.type === 'ul' ? 'ul' : 'ol';
    return (
      <Tag style={{ margin: '0 0 12px', padding: '0 0 0 20px', fontSize: 13.5, lineHeight: 1.65, color: 'var(--text-muted)' }}>
        {block.items.map((it, i) => <li key={i} style={{ marginBottom: 6 }}>{it}</li>)}
      </Tag>
    );
  }
  if (block.type === 'code') {
    return (
      <pre className="mono" style={{ margin: '0 0 12px', padding: '12px 14px', borderRadius: 9, background: 'var(--surface-2, var(--border-soft))', fontSize: 12, lineHeight: 1.6, overflowX: 'auto', color: 'var(--text)' }}>
        {block.text}
      </pre>
    );
  }
  if (block.type === 'note') {
    return (
      <div style={{ display: 'flex', gap: 9, margin: '0 0 12px', padding: '11px 13px', borderRadius: 9, background: 'var(--primary-soft)', color: 'var(--primary)' }}>
        <Icon name="info" size={15} style={{ flex: 'none', marginTop: 1 }} />
        <span style={{ fontSize: 12.5, lineHeight: 1.6 }}>{block.text}</span>
      </div>
    );
  }
  return null;
}

const GROUP_ORDER = ['Démarrage', 'Modules opérationnels', 'Administration', 'Sécurité & déploiement'];
const GROUP_DESCRIPTIONS = {
  'Démarrage': "Ce qu'il faut savoir avant toute chose : ce que fait la console, le tout premier accès, les rôles, et comment lire la page d'accueil.",
  'Modules opérationnels': "Le fonctionnement de chaque domaine métier au quotidien : intégrations, Kubernetes, réseaux, infrastructure, développement, monitoring et cybersécurité.",
  'Administration': "Les pages réservées aux administrateurs, pour gérer les comptes, les groupes, l'inventaire, la plateforme, l'identité et le système.",
  'Sécurité & déploiement': "Ce qui protège la console, comment la déployer en production, et quoi faire en cas de problème."
};

function groupSections(sections) {
  const byGroup = new Map();
  for (const s of sections) {
    const g = s.group || 'Autres';
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(s);
  }
  const orderedKeys = [...GROUP_ORDER.filter((g) => byGroup.has(g)), ...[...byGroup.keys()].filter((g) => !GROUP_ORDER.includes(g))];
  return orderedKeys.map((g) => ({ group: g, sections: byGroup.get(g) }));
}

export default function ManualPage() {
  const [active, setActive] = useState(MANUAL_SECTIONS[0].id);
  const groups = groupSections(MANUAL_SECTIONS);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) setActive(visible[0].target.id);
      },
      { rootMargin: '-15% 0px -70% 0px' }
    );
    MANUAL_SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="manual-layout" style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>
      <nav className="manual-toc" style={{ flex: 'none', width: 220, position: 'sticky', top: 24, maxHeight: 'calc(100vh - 48px)', overflowY: 'auto' }}>
        {groups.map((g, gi) => (
          <div key={g.group} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 10, marginTop: gi === 0 ? 0 : 4 }}>{g.group}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {g.sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  style={{
                    fontSize: 12.5,
                    padding: '7px 10px',
                    borderRadius: 8,
                    textDecoration: 'none',
                    fontWeight: active === s.id ? 600 : 500,
                    color: active === s.id ? 'var(--primary)' : 'var(--text-muted)',
                    background: active === s.id ? 'var(--primary-soft)' : 'transparent',
                    transition: 'all .12s ease'
                  }}
                >
                  {s.title}
                </a>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="manual-content" style={{ flex: 1, minWidth: 0, maxWidth: 760 }}>
        <div className="card" style={{ padding: 20, marginBottom: 20, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <Icon name="book" size={20} style={{ flex: 'none', color: 'var(--primary)', marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Manuel d'utilisation</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-faint)', lineHeight: 1.6 }}>
              Guide complet de Nexus Console : premiers pas, chaque module, configuration des intégrations, sécurité et dépannage.
              Pour les identifiants précis à saisir, ouvrez aussi « Comment obtenir ces informations ? » directement dans Paramètres → Intégrations.
            </div>
          </div>
        </div>

        {groups.map((g, gi) => (
          <div key={g.group}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: gi === 0 ? '0 0 14px' : '30px 0 14px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--primary)' }}>{g.group}</div>
                <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 3, lineHeight: 1.5 }}>{GROUP_DESCRIPTIONS[g.group]}</div>
              </div>
            </div>
            {g.sections.map((s) => (
              <section key={s.id} id={s.id} className="card" style={{ padding: '18px 20px', marginBottom: 16, scrollMarginTop: 24 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>{s.title}</h2>
                {s.blocks.map((b, i) => <Block key={i} block={b} />)}
              </section>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

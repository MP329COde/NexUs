import { useEffect, useState } from 'react';
import Icon from '../../components/ui/Icon.jsx';
import { MANUAL_SECTIONS } from './manualContent.js';
import './ManualPage.css';

function Block({ block }) {
  if (block.type === 'p') {
    return <p className="manual-block-p">{block.text}</p>;
  }
  if (block.type === 'ul' || block.type === 'ol') {
    const Tag = block.type === 'ul' ? 'ul' : 'ol';
    return (
      <Tag className="manual-block-list">
        {block.items.map((it, i) => <li key={i} className="manual-block-list-item">{it}</li>)}
      </Tag>
    );
  }
  if (block.type === 'code') {
    return (
      <pre className="mono manual-block-code">
        {block.text}
      </pre>
    );
  }
  if (block.type === 'note') {
    return (
      <div className="manual-block-note">
        <Icon name="info" size={15} className="manual-block-note-icon" />
        <span className="manual-block-note-text">{block.text}</span>
      </div>
    );
  }
  return null;
}

const GROUP_ORDER = ['Démarrage', 'Modules opérationnels', 'Manuel de code', 'Administration', 'Sécurité & déploiement'];
const GROUP_DESCRIPTIONS = {
  'Démarrage': "Ce qu'il faut savoir avant toute chose : ce que fait la console, le tout premier accès, les rôles, et comment lire la page d'accueil.",
  'Modules opérationnels': "Le fonctionnement de chaque domaine métier au quotidien : intégrations, Kubernetes, réseaux, infrastructure, développement, monitoring et cybersécurité.",
  'Manuel de code': "Pour contribuer au code de Nexus Console elle-même : structure des dossiers, conventions JSX/React, gestion d'état, patrons backend déjà en place. Mis à jour au fil des évolutions du code, pas figé.",
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
    const scrollEl = document.querySelector('.app-main');
    const lastId = MANUAL_SECTIONS[MANUAL_SECTIONS.length - 1].id;
    let atBottom = false;

    // Le rootMargin ci-dessous rétrécit la zone de détection à la partie haute
    // de l'écran : une fois arrivé tout en bas de page, la dernière section
    // n'a plus assez d'espace pour jamais y entrer, et le sommaire reste
    // bloqué sur une section précédente. Tant qu'on est au fond du scroll, on
    // ignore donc les intersections rapportées par l'observer (qui peuvent
    // encore pointer sur l'avant-dernière section) et on force la dernière.
    const observer = new IntersectionObserver(
      (entries) => {
        if (atBottom) return;
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) setActive(visible[0].target.id);
      },
      { root: scrollEl || null, rootMargin: '-15% 0px -70% 0px' }
    );
    MANUAL_SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    function onScroll() {
      if (!scrollEl) return;
      atBottom = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 4;
      if (atBottom) setActive(lastId);
    }
    onScroll();
    scrollEl?.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      observer.disconnect();
      scrollEl?.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <div className="manual-layout">
      <nav className="manual-toc">
        {groups.map((g, gi) => (
          <div key={g.group} className="manual-toc-group">
            <div className={`manual-toc-group-title${gi === 0 ? ' manual-toc-group-title-first' : ''}`}>{g.group}</div>
            <div className="manual-toc-links">
              {g.sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  onClick={() => setActive(s.id)}
                  className={`manual-toc-link${active === s.id ? ' manual-toc-link-active' : ''}`}
                >
                  {s.title}
                </a>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="manual-content">
        <div className="card manual-intro-card">
          <Icon name="book" size={20} className="manual-intro-icon" />
          <div>
            <div className="manual-intro-title">Manuel d'utilisation</div>
            <div className="manual-intro-text">
              Guide complet de Nexus Console : premiers pas, chaque module, configuration des intégrations, sécurité et dépannage.
              Pour les identifiants précis à saisir, ouvrez aussi « Comment obtenir ces informations ? » directement dans Paramètres → Intégrations.
            </div>
          </div>
        </div>

        {groups.map((g, gi) => (
          <div key={g.group}>
            <div className={`manual-group-header${gi === 0 ? ' manual-group-header-first' : ''}`}>
              <div>
                <div className="manual-group-title">{g.group}</div>
                <div className="manual-group-desc">{GROUP_DESCRIPTIONS[g.group]}</div>
              </div>
            </div>
            {g.sections.map((s) => (
              <section key={s.id} id={s.id} className="card manual-section">
                <h2 className="manual-section-title">{s.title}</h2>
                {s.blocks.map((b, i) => <Block key={i} block={b} />)}
              </section>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

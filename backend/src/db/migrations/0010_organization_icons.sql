-- Icône (emoji) et couleur personnalisées pour les organisations, sur le
-- même modèle que les projets (store/projectsStore.js, legacy JSON) —
-- ici en colonnes Postgres puisque les organisations vivent uniquement
-- dans le socle relationnel.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#2563EB';

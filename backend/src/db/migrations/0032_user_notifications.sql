-- Notifications persistantes par utilisateur (todo.md item 29) : distinctes
-- de la table `notifications` (alertes de sécurité, réservées aux admins,
-- voir store/notificationsStore.js) et du système de toasts éphémères du
-- frontend (NotificationContext.jsx, historique de session perdu au
-- rechargement) — ici, un événement de développement qui concerne
-- directement un utilisateur (tâche assignée, revue demandée, pipeline
-- échoué...) survit à sa déconnexion et à un redémarrage du serveur.
CREATE TABLE IF NOT EXISTS user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT,
  message TEXT NOT NULL,
  meta JSONB,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON user_notifications(user_id, created_at DESC);

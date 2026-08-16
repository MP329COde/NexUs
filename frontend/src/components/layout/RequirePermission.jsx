import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

// Garde générique par domaine RBAC (voir store/groupsStore.js côté backend) :
// un compte 'admin' de plateforme passe toujours (même bypass implicite que
// requirePermission() côté backend), un compte 'user' doit avoir au moins
// `level` sur `domain` via ses groupes/rôles.
export default function RequirePermission({ domain, level = 'read', children }) {
  const { hasPermission } = useAuth();
  if (!hasPermission(domain, level)) return <Navigate to="/" replace />;
  return children;
}

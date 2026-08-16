import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

// Vue générale peut être restreinte aux admins depuis Paramètres → Plateforme
// (console.homeRestrictedToAdmins). Garde la route '/' elle-même, en plus du
// masquage du lien dans DomainNav.jsx, pour bloquer aussi l'accès direct par URL.
export default function RequireHomeAccess({ children }) {
  const { user, homeRestrictedToAdmins } = useAuth();
  if (homeRestrictedToAdmins && user?.role !== 'admin') return <Navigate to="/deployments" replace />;
  return children;
}

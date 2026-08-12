import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import OnboardingPage from '../../pages/Onboarding/OnboardingPage.jsx';

export default function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  // Compte créé par un admin, pas encore finalisé par son titulaire : bloque
  // tout le reste de la console derrière l'assistant, quelle que soit la route visée.
  if (user.mustOnboard) return <OnboardingPage />;
  return children;
}

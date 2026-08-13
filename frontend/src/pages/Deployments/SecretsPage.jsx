import PageHeader from '../../components/ui/PageHeader.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import VaultPanel from './VaultPanel.jsx';
import PasswordGeneratorPanel from './PasswordGeneratorPanel.jsx';

// "Secrets & variables" : coffre réel (voir VaultPanel.jsx / backend
// services/vaultService.js), chiffré au repos. Les secrets dev sont visibles
// par tout compte connecté, avec le nom du projet ; les secrets production
// exigent une triple vérification (avertissement, mot de passe, confirmation
// explicite) avant d'être révélés en clair.
export default function SecretsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const dev = useApi(() => api.get('/vault/dev'), []);
  const prod = useApi(() => (isAdmin ? api.get('/vault/prod') : Promise.resolve(null)), [isAdmin]);

  const devCount = dev.data?.items.length ?? 0;
  const prodCount = prod.data?.items.length ?? 0;

  return (
    <>
      <PageHeader
        title="Secrets & variables"
        sub="Coffre chiffré au repos. Dev/staging accessibles directement ; production protégée par triple vérification."
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 16 }}>
        <KpiCard label="Secrets dev/staging" value={devCount} tint="#3B82F6" note="visibles par tout compte connecté" />
        {isAdmin && <KpiCard label="Secrets production" value={prodCount} tint="#F43F5E" note="triple vérification requise" />}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16 }}>
        <VaultPanel />
        <PasswordGeneratorPanel />
      </div>
    </>
  );
}

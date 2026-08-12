import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // host: true (0.0.0.0) pour que la console soit accessible depuis d'autres
    // machines du réseau local en développement (npm run dev), pas seulement
    // depuis localhost — utile pour la configurer/tester depuis un téléphone
    // ou un autre poste pendant le développement.
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true }
    }
  }
});

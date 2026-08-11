import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDataDir = path.resolve(__dirname, '../../data');

// Centralise le dossier de données (base SQLite, clés, sauvegardes) : surchargé
// par NEXUS_DATA_DIR pour l'isolation des tests automatisés et pour pointer
// vers un volume Docker en production, sans dupliquer ce calcul dans chaque
// module qui touche au disque.
export const dataDir = process.env.NEXUS_DATA_DIR ? path.resolve(process.env.NEXUS_DATA_DIR) : defaultDataDir;

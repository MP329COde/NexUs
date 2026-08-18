#!/usr/bin/env node
import { COMMANDS, ApiError } from '../src/commands.js';

// Parseur d'arguments minimal (sans dépendance) : `nexus <verbe[:sous-verbe]>
// <positionnels...> [--option valeur]`. `catalog list` / `service get` etc.
// sont acceptés comme deux mots (correspondance avec la spec) et traduits
// vers les clés internes "catalog:list"/"service:get" de COMMANDS.
function parseArgs(argv) {
  const positional = [];
  const options = {};
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      options[key] = value;
    } else {
      positional.push(arg);
    }
    i++;
  }
  return { positional, options };
}

const TWO_WORD_VERBS = new Set(['catalog', 'service', 'env']);

async function main() {
  const [, , ...argv] = process.argv;
  const { positional, options } = parseArgs(argv);
  if (positional.length === 0) {
    printHelp();
    process.exit(1);
  }
  let [verb, ...rest] = positional;
  if (TWO_WORD_VERBS.has(verb) && rest[0]) {
    verb = `${verb}:${rest[0]}`;
    rest = rest.slice(1);
  }

  const handler = COMMANDS[verb];
  if (!handler) {
    console.error(`Commande inconnue : "${positional.join(' ')}"\n`);
    printHelp();
    process.exit(1);
  }

  try {
    const result = await handler(rest, options, { home: process.env.NEXUS_CLI_HOME });
    if (result !== undefined) console.log(result);
  } catch (err) {
    if (err instanceof ApiError) {
      console.error(`Erreur API (${err.status}) : ${err.message}`);
    } else {
      console.error(`Erreur : ${err.message}`);
    }
    process.exit(1);
  }
}

function printHelp() {
  console.log(`Nexus CLI — scripte l'API réelle de la console.

Usage :
  nexus login <url> <email>              Connexion (session réutilisée en Authorization: Bearer)
  nexus logout                           Efface la session locale
  nexus whoami                           Compte actuellement connecté

  nexus catalog list                     Composants du Software Catalog
  nexus service get <componentId>        Détail d'un composant

  nexus env list <legacyProjectId>       Environnements d'un projet

  nexus deploy <legacyProjectId> <linkId> [--revision <rev>]
  nexus promote <legacyProjectId> <envId> [--from <fromEnvironmentId>]
  nexus rollback <legacyProjectId> <envId> <toPromotionId>

  nexus logs <namespace> <pod> [--tail <n>]
`);
}

main();

#!/usr/bin/env bash
# Installation et déploiement de Nexus Console sur une machine vierge (Linux/macOS),
# via Docker Compose. Idempotent : peut être relancé sans casser une installation
# existante (les secrets déjà générés dans .env ne sont jamais écrasés).
#
# Usage :
#   ./install.sh                 installation interactive (recommandé)
#   ./install.sh --yes           non interactif, valeurs par défaut
#   ./install.sh --port=8080     force le port exposé
#   ./install.sh --update        pull + rebuild + redémarre une installation existante
set -euo pipefail

BOLD="\033[1m"; DIM="\033[2m"; GREEN="\033[32m"; YELLOW="\033[33m"; RED="\033[31m"; RESET="\033[0m"
info()  { printf "${BOLD}==>${RESET} %s\n" "$1"; }
warn()  { printf "${YELLOW}!!${RESET} %s\n" "$1"; }
ok()    { printf "${GREEN}ok${RESET} %s\n" "$1"; }
die()   { printf "${RED}Erreur:${RESET} %s\n" "$1" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ASSUME_YES=0
FORCE_PORT=""
UPDATE_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y) ASSUME_YES=1 ;;
    --port=*) FORCE_PORT="${arg#--port=}" ;;
    --update) UPDATE_ONLY=1 ;;
    --help|-h)
      sed -n '2,10p' "$0"; exit 0 ;;
    *) die "Option inconnue: $arg (voir --help)" ;;
  esac
done

# --- 1. Docker -----------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  OS="$(uname -s)"
  if [ "$OS" = "Linux" ]; then
    warn "Docker n'est pas installé."
    if [ "$ASSUME_YES" = 1 ] || { read -r -p "Installer Docker maintenant via get.docker.com ? [o/N] " REPLY; [ "${REPLY,,}" = "o" ]; }; then
      info "Installation de Docker (get.docker.com)…"
      curl -fsSL https://get.docker.com | sh
      sudo usermod -aG docker "$USER" 2>/dev/null || true
      warn "Docker installé. Si 'docker' reste inaccessible sans sudo, redémarrez votre session puis relancez ce script."
    else
      die "Docker est requis. Installez-le puis relancez ce script."
    fi
  else
    die "Docker n'est pas installé. Sur macOS/Windows, installez Docker Desktop (https://www.docker.com/products/docker-desktop) puis relancez ce script."
  fi
fi

if ! docker compose version >/dev/null 2>&1; then
  die "Le plugin 'docker compose' est requis (inclus avec Docker Desktop et les paquets docker-ce récents)."
fi
ok "Docker $(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1) détecté."

# --- 2. Configuration (.env) ----------------------------------------------
if [ ! -f .env ]; then
  info "Génération de .env…"
  cp .env.example .env

  PORT="8080"
  if [ -n "$FORCE_PORT" ]; then
    PORT="$FORCE_PORT"
  elif [ "$ASSUME_YES" = 0 ]; then
    read -r -p "Port d'exposition de la console [8080] : " INPUT_PORT
    [ -n "$INPUT_PORT" ] && PORT="$INPUT_PORT"
  fi

  JWT_SECRET="$(openssl rand -hex 32 2>/dev/null || head -c32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  MASTER_KEY="$(openssl rand -hex 32 2>/dev/null || head -c32 /dev/urandom | od -An -tx1 | tr -d ' \n')"

  # sed portable (BSD/macOS vs GNU) : édition via un fichier temporaire plutôt que -i sans suffixe.
  tmp="$(mktemp)"
  sed \
    -e "s/^CONSOLE_PORT=.*/CONSOLE_PORT=${PORT}/" \
    -e "s/^JWT_SECRET=.*/JWT_SECRET=${JWT_SECRET}/" \
    -e "s/^NEXUS_MASTER_KEY=.*/NEXUS_MASTER_KEY=${MASTER_KEY}/" \
    .env > "$tmp" && mv "$tmp" .env

  if [ "$ASSUME_YES" = 0 ]; then
    echo
    read -r -p "Créer un compte administrateur automatiquement (sinon l'assistant de configuration s'affichera au premier accès) ? [o/N] " REPLY
    if [ "${REPLY,,}" = "o" ]; then
      read -r -p "  E-mail administrateur : " ADMIN_EMAIL
      read -r -s -p "  Mot de passe (8 caractères min.) : " ADMIN_PASSWORD; echo
      tmp="$(mktemp)"
      sed \
        -e "s#^ADMIN_EMAIL=.*#ADMIN_EMAIL=${ADMIN_EMAIL}#" \
        -e "s#^ADMIN_PASSWORD=.*#ADMIN_PASSWORD=${ADMIN_PASSWORD}#" \
        .env > "$tmp" && mv "$tmp" .env
    fi
  fi
  ok ".env généré (secrets aléatoires, jamais affichés)."
else
  ok ".env existant conservé tel quel (supprimez-le pour régénérer les secrets)."
fi

CONSOLE_PORT="$(grep -E '^CONSOLE_PORT=' .env | cut -d= -f2)"
CONSOLE_PORT="${CONSOLE_PORT:-8080}"

# --- 3. Build & démarrage --------------------------------------------------
if [ "$UPDATE_ONLY" = 1 ]; then
  info "Mise à jour : git pull, rebuild, redémarrage…"
  git pull --ff-only || warn "git pull a échoué ou n'est pas un dépôt git — poursuite avec les sources locales."
fi

info "Construction des images…"
docker compose build

info "Démarrage des services…"
docker compose up -d

info "Attente que la console réponde…"
for i in $(seq 1 30); do
  if curl -fsS "http://localhost:${CONSOLE_PORT}/api/status/health" >/dev/null 2>&1; then
    ok "Console opérationnelle."
    break
  fi
  [ "$i" = 30 ] && warn "La console met du temps à démarrer — vérifiez 'docker compose logs -f'."
  sleep 2
done

# --- 4. Adresse LAN ---------------------------------------------------------
LAN_IP="$(
  { command -v ip >/dev/null 2>&1 && ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}'; } || \
  { command -v ipconfig >/dev/null 2>&1 && ipconfig getifaddr en0 2>/dev/null; } || \
  hostname -I 2>/dev/null | awk '{print $1}'
)"

echo
ok "Nexus Console est prête."
echo -e "  ${BOLD}Local :${RESET}  http://localhost:${CONSOLE_PORT}"
[ -n "${LAN_IP:-}" ] && echo -e "  ${BOLD}Réseau local :${RESET}  http://${LAN_IP}:${CONSOLE_PORT}  ${DIM}(accessible depuis d'autres machines du LAN)${RESET}"
echo
if ! grep -qE '^ADMIN_EMAIL=.+' .env 2>/dev/null; then
  echo "Aucun compte admin pré-créé : l'assistant de configuration initiale s'affichera au premier accès."
fi
echo -e "${DIM}Commandes utiles : docker compose logs -f · docker compose down · ./install.sh --update${RESET}"

# node:22-slim (Debian) plutôt qu'Alpine : évite les surprises avec les
# dépendances natives optionnelles de ssh2 (cpu-features) sous musl, et
# facilite l'installation des outils de sécurité ci-dessous (paquets .deb,
# scripts d'installation officiels qui ciblent glibc).
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production
ENV NEXUS_DATA_DIR=/app/data

# Outils de sécurité réels invoqués par les services de scan (jamais de
# résultat simulé si absents — voir services/trivyService.js, semgrepService.js,
# checkovService.js, syftService.js, cosignService.js, networkScanService.js).
# Le backend tourne uniquement en conteneur (docker-compose, voir install.sh) :
# ces binaires doivent donc vivre ici, pas seulement sur une machine de dev.
# --print-architecture (amd64/arm64) car l'image est construite aussi bien sur
# des hôtes Apple Silicon (dev) que x86_64 (la plupart des homelabs).
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates gnupg git openssh-client nmap python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && ARCH="$(dpkg --print-architecture)" \
    && case "$ARCH" in amd64) COSIGN_ARCH=amd64 ;; arm64) COSIGN_ARCH=arm64 ;; *) echo "Architecture non supportée: $ARCH" >&2; exit 1 ;; esac \
    && curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin \
    && curl -sfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin \
    && curl -sfL -o /usr/local/bin/cosign "https://github.com/sigstore/cosign/releases/latest/download/cosign-linux-${COSIGN_ARCH}" \
    && chmod +x /usr/local/bin/cosign \
    && pip install --no-cache-dir --break-system-packages semgrep checkov \
    && trivy --version && syft version && cosign version && semgrep --version && checkov --version && nmap --version | head -1

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

RUN mkdir -p /app/data /app/data/cosign && useradd --system --uid 1001 --create-home --home-dir /home/nexus nexus \
    && chown -R nexus:nexus /app /home/nexus
ENV HOME=/home/nexus
USER nexus

EXPOSE 4000
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/api/status/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]

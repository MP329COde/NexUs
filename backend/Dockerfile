# node:22-slim (Debian) plutôt qu'Alpine : évite les surprises avec les
# dépendances natives optionnelles de ssh2 (cpu-features) sous musl.
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production
ENV NEXUS_DATA_DIR=/app/data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

RUN mkdir -p /app/data && useradd --system --uid 1001 nexus && chown -R nexus:nexus /app
USER nexus

EXPOSE 4000
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/api/status/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]

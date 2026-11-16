# Râșnov Trains – production image (works on Raspberry Pi 5 / arm64 and on x86 servers)

ARG NODE_IMAGE=node:22-bookworm-slim

# ---- build the web app ----
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY apps ./apps
RUN npm run build -w apps/web

# ---- runtime: API + built web app ----
FROM ${NODE_IMAGE}
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3001 \
    HOST=0.0.0.0 \
    WEB_DIST=/app/apps/web/dist
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --no-audit --no-fund -w apps/api && npm cache clean --force
COPY apps/api/src apps/api/src
COPY --from=build /app/apps/web/dist apps/web/dist
COPY deploy/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "--disable-warning=ExperimentalWarning", "--import", "tsx", "apps/api/src/server.ts"]

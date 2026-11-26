FROM node:24-bookworm-slim AS build
WORKDIR /app

COPY solution-assurance-documentation-workspace/package.json solution-assurance-documentation-workspace/package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

COPY solution-assurance-documentation-workspace/ ./
RUN npm run build

FROM caddy:2-alpine AS caddy

FROM node:24-alpine
WORKDIR /app
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
COPY --from=build /app/server/ /app/server/
COPY --from=build /app/src/lib/aiFailureModeAssist.ts /app/src/lib/

USER node
EXPOSE 8080
CMD ["node", "server/start.ts"]

FROM node:24-bookworm-slim AS build
WORKDIR /app

COPY solution-assurance-documentation-workspace/package.json solution-assurance-documentation-workspace/package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

COPY solution-assurance-documentation-workspace/ ./
RUN npm run build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv

EXPOSE 8080
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]

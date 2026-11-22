# The frontend for Railway: build the app for the site root, then serve it with Caddy (deploy/Caddyfile).
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Served from its own domain: at the root, and /api on the same origin (Caddy passes it on).
# Set in the environment, these win over package.json "homepage" and .env.production.
ENV PUBLIC_URL=/ REACT_APP_API_URL= GENERATE_SOURCEMAP=false CI=false
RUN npm run build

FROM caddy:2.8-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/build /srv

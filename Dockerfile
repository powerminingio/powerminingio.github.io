# Two targets:
#
#   docker build .                  -> production: nginx serving the static export (~26 MB)
#   docker build . --target dev     -> development: Next dev server with hot reload (~830 MB)
#
# Production is a static export (next.config.js sets output: 'export'), exactly
# what GitHub Pages serves — there is no Node server in production, and
# `next start` cannot work here.

# node:20 went end of life on 2026-04-30; 24 is Active LTS.
FROM node:24-alpine AS deps
WORKDIR /app
# Copied first so the install layer caches until the manifests change.
COPY package.json package-lock.json ./
# ci, not install: reproducible and matched to the lockfile.
RUN npm ci

# --- development: hot reload, for working on the app without a local Node ---
FROM deps AS dev
WORKDIR /app
COPY . .
EXPOSE 3000
# -H 0.0.0.0 matters: Next binds localhost by default, which inside a container
# means the published port answers nothing.
CMD ["npm", "run", "dev", "--", "-H", "0.0.0.0"]

# --- build the static export ---
FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

# --- production (default target): just the files, no Node runtime ---
# alpine-slim over alpine: same config support, 14 MB instead of 63.6 MB,
# because it drops the njs and geoip modules this site never uses.
FROM nginx:alpine-slim AS production
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/out /usr/share/nginx/html
EXPOSE 80

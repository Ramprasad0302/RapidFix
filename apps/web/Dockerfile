# FIXORA web app — build from the repository root:
#   docker build -f apps/web/Dockerfile --build-arg PUBLIC_URL=https://fixora.example.com -t fixora-web .
FROM node:22-alpine AS build
WORKDIR /app
ENV SCARF_ANALYTICS=false
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY backend/package.json backend/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @fixora/web --include-workspace-root --ignore-scripts
COPY apps/web ./apps/web
# Public origin the browser uses; nginx proxies /api, /socket.io and /uploads to the API.
ARG PUBLIC_URL=http://localhost:8080
ARG VITE_GOOGLE_MAPS_API_KEY=
ENV VITE_API_URL=${PUBLIC_URL}/api/v1 VITE_SOCKET_URL=${PUBLIC_URL} VITE_GOOGLE_MAPS_API_KEY=${VITE_GOOGLE_MAPS_API_KEY}
RUN npm run build -w @fixora/web

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80

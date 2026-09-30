# FIXORA API — build from the repository root:
#   docker build -f backend/Dockerfile -t fixora-api .
FROM node:22-alpine AS build
WORKDIR /app
ENV SCARF_ANALYTICS=false
COPY package.json package-lock.json ./
COPY packages ./packages
COPY backend/package.json backend/
COPY apps/web/package.json apps/web/
COPY backend/prisma backend/prisma
COPY backend/prisma.config.ts backend/
RUN npm ci --workspace @fixora/backend --include-workspace-root
COPY tsconfig.base.json ./
COPY backend ./backend
# Dependencies are kept as installed: the Prisma CLI runs `migrate deploy` at start-up
# and tsx runs the optional demo seed — the same layout the dist build is tested with.
RUN npm run build -w @fixora/backend

FROM node:22-alpine
WORKDIR /app/backend
ENV NODE_ENV=production PORT=4000 SCARF_ANALYTICS=false
RUN addgroup -S fixora && adduser -S fixora -G fixora
# The whole built workspace (hoisting decides where each package lands).
COPY --from=build --chown=fixora:fixora /app /app
RUN mkdir -p uploads uploads-private && chown -R fixora:fixora uploads uploads-private
USER fixora
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:4000/api/v1/health >/dev/null || exit 1
# Apply pending migrations, then start. Never resets data.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]

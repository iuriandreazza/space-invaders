# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# Read by Vite at build time and compiled into the client; empty leaves analytics off. It is a public identifier, not a secret.
ARG VITE_GA_MEASUREMENT_ID=""
ENV VITE_GA_MEASUREMENT_ID=$VITE_GA_MEASUREMENT_ID
RUN pnpm build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    STATIC_DIR=dist \
    DATABASE_PATH=/data/leaderboard.sqlite
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
# The leaderboard lives in this volume: without it every deploy starts with an empty board.
RUN mkdir /data && chown node:node /data
VOLUME /data
USER node
# Last, so that a new commit does not invalidate the layers above it.
ARG REVISION=""
ENV APP_REVISION=$REVISION
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "dist-server/server/main.js"]

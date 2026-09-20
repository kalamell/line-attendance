# Builds the console + LIFF SPAs and serves them with nginx.
#   console -> /            LIFF -> /liff/
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/console ./apps/console
COPY apps/liff ./apps/liff

RUN pnpm install --no-frozen-lockfile

ARG VITE_TENANT=ahaanden
ARG VITE_LIFF_ID=
RUN pnpm --filter @poszee/console build \
 && VITE_TENANT=$VITE_TENANT VITE_LIFF_ID=$VITE_LIFF_ID pnpm --filter @poszee/liff build

FROM nginx:alpine
COPY ops/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/console/dist /usr/share/nginx/html
COPY --from=build /app/apps/liff/dist /usr/share/nginx/html/liff
EXPOSE 80

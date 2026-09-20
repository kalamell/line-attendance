# Poszee API — build workspace packages (CJS) + NestJS (SWC), run compiled JS.
# tsx is NOT used to run the app: esbuild drops decorator metadata and breaks Nest DI.
FROM node:20-alpine
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps/api ./apps/api

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @poszee/shared build \
 && pnpm --filter @poszee/db build \
 && pnpm --filter @poszee/api build

ENV NODE_ENV=production
EXPOSE 3000

# migrations run as a one-off override: `... run --rm poszee-api pnpm db:migrate`
CMD ["node", "apps/api/dist/main.js"]

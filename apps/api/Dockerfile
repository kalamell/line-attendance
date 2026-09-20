# Poszee API — runs the NestJS app under tsx (transpiles workspace TS deps at runtime).
FROM node:20-alpine
RUN corepack enable
WORKDIR /app

# workspace manifests + source (only what the API needs)
COPY pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps/api ./apps/api

RUN pnpm install --no-frozen-lockfile

ENV NODE_ENV=production
EXPOSE 3000

# migrations run as a separate one-off: `pnpm db:migrate`
CMD ["pnpm", "--filter", "@poszee/api", "exec", "tsx", "src/main.ts"]

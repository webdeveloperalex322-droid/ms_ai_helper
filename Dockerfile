FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nestjs

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts && pnpm store prune

COPY --chown=nestjs:nodejs dist ./dist
COPY --chown=nestjs:nodejs src/database/migrations ./dist/src/database/migrations

USER nestjs
EXPOSE 3000
CMD ["node", "dist/src/main"]

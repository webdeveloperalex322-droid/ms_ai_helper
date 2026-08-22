FROM node:22-alpine
# Pinned, not @latest: pnpm 11 dropped the "pnpm.overrides" field in
# package.json, so it reads a different override set than the one recorded in
# pnpm-lock.yaml and --frozen-lockfile fails with ERR_PNPM_LOCKFILE_CONFIG_MISMATCH.
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nestjs

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts && pnpm store prune

COPY --chown=nestjs:nodejs dist ./dist
COPY --chown=nestjs:nodejs src/database/migrations ./dist/src/database/migrations

# AdminJS resolves its custom components from the source tree at runtime
# (path.resolve(process.cwd(), 'src/modules/admin/components/...')), so these
# TSX sources have to ship even though the rest of src/ does not.
COPY --chown=nestjs:nodejs src/modules/admin/components ./src/modules/admin/components

# AdminJS bundles those components on startup and writes the result into
# ./.adminjs. WORKDIR is owned by root, so without this the non-root user hits
# EACCES — which surfaces as a component build failure and sends debugging off
# in entirely the wrong direction.
RUN mkdir -p /app/.adminjs && chown -R nestjs:nodejs /app/.adminjs

USER nestjs
EXPOSE 3000
CMD ["node", "dist/src/main"]

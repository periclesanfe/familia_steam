# syntax=docker/dockerfile:1.7
# Imagem de produção enxuta (docs/spec/08 §8.2): Next "standalone" sobre Alpine puro + binário do Node.
# Alvos: `runner` (app, padrão) e `migrate` (prisma migrate deploy / CLI de bootstrap).
# As duas imagens base usam a MESMA versão do Alpine (o binário do Node é linkado com a musl dela).
ARG NODE_IMAGE=node:24-alpine3.24
ARG ALPINE_IMAGE=alpine:3.24

# ── base: Node + pnpm (versão do campo packageManager, via corepack) ─────────────
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1 \
    HUSKY=0
RUN corepack enable
WORKDIR /app

# ── deps: dependências completas (cacheadas enquanto o lockfile não mudar) ────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ── builder: gera o client Prisma e o build standalone ───────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm db:generate && pnpm build

# ── migrate: job de migração (e bootstrap) com a CLI do Prisma ───────────────────
FROM base AS migrate
ENV NODE_ENV=production
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json prisma.config.ts ./
COPY --chown=node:node prisma ./prisma
USER node
# CLI do Prisma direto: sem pnpm em runtime (nem verificação de deps nem download via corepack).
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

# ── runner: Alpine + node (sem npm/yarn/corepack) + só os arquivos rastreados pelo Next ──
FROM ${ALPINE_IMAGE} AS runner
RUN apk add --no-cache libstdc++ libgcc tini \
 && addgroup -S -g 1000 node && adduser -S -u 1000 -G node -h /app node
COPY --from=base /usr/local/bin/node /usr/local/bin/node
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=UTC
WORKDIR /app
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/saude >/dev/null || exit 1
# tini como PID 1: repassa SIGTERM e recolhe processos (desligamento limpo em qualquer orquestrador).
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]

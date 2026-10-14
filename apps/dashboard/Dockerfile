FROM node:24-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable \
  && corepack prepare pnpm@11.19.0 --activate

WORKDIR /workspace

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm build:packages
RUN pnpm --filter @earthquake/dashboard build

FROM caddy:2-alpine AS runtime

COPY apps/dashboard/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /workspace/apps/dashboard/dist /srv

FROM node:24-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable \
  && corepack prepare pnpm@11.19.0 --activate

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && mkdir -p /opt/rds-certs \
  && curl --fail --silent --show-error --location \
    https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
    --output /opt/rds-certs/global-bundle.pem \
  && rm -rf /var/lib/apt/lists/* \

WORKDIR /workspace

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm build:packages
RUN pnpm --filter @earthquake/api build

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3000

WORKDIR /workspace

COPY --from=build --chown=node:node /workspace /workspace

COPY --from=build /opt/rds-certs/global-bundle.pem /opt/rds-certs/global-bundle.pem

ENV NODE_EXTRA_CA_CERTS=/opt/rds-certs/global-bundle.pem

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/v1/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "apps/api/dist/main.js"]

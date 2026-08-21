FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8402
RUN addgroup -S x402 && adduser -S x402 -G x402
COPY --from=deps /app/node_modules ./node_modules
COPY package.json server.js config.yaml ./
USER x402
EXPOSE 8402
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8402/healthz || exit 1
CMD ["node", "server.js", "--config", "/app/config.yaml"]

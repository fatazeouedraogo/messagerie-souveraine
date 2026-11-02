FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
# Le volume nommé hérite de ces droits à sa première création.
RUN mkdir /state && chown node:node /state
USER node
EXPOSE 3000
CMD ["node", "src/index.js"]

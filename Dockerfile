FROM node:20-slim AS base

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN chown -R node:node /app

USER node

ENV NODE_ENV=production

CMD ["node", "src/app.js"]
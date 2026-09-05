FROM node:22-alpine

WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

COPY backend/ ./
COPY frontend/ /app/frontend/

ENV NODE_ENV=production
EXPOSE 3001

USER node
CMD ["node", "src/server.js"]

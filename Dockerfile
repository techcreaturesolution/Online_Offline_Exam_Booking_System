FROM node:20-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=client /app/client/dist /app/client/dist
EXPOSE 5000
USER node
HEALTHCHECK CMD wget -qO- http://127.0.0.1:5000/api/health/ready || exit 1
CMD ["node", "src/index.js"]

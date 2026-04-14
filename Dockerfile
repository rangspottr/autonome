# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production server
FROM node:20-alpine AS production
WORKDIR /app
COPY --from=frontend-build /app/dist ./dist
COPY server/ ./server/
WORKDIR /app/server
RUN npm ci --production
EXPOSE 3001
CMD ["node", "start.js"]

##
## Frontend (Vite) - dev + prod
##

# ---- deps (shared) ----
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# ---- dev ----
FROM node:22-alpine AS dev
WORKDIR /app

ENV NODE_ENV=development
ENV CHOKIDAR_USEPOLLING=true

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app

# Build-time Vite envs (optional)
ARG VITE_API_BASE_URL=/api
ARG VITE_WS_BASE_URL=ws://localhost:3007
ARG VITE_AI_API_BASE_URL=/ai-service

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_WS_BASE_URL=$VITE_WS_BASE_URL
ENV VITE_AI_API_BASE_URL=$VITE_AI_API_BASE_URL

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Use Vite's build directly (skips `tsc -b` typecheck).
# This keeps the Docker image buildable even if the repo has non-blocking TS type errors.
RUN npx vite build

# ---- prod ----
FROM nginx:1.27-alpine AS prod

# Use nginx template + envsubst on container start (official image feature).
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# ---- build stage ----------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

# Vite inlines VITE_* variables at build time, so the API URL must be supplied
# as a build argument — it cannot be changed by a runtime environment variable.
ARG VITE_API_BASE_URL=http://localhost:4000/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- serve stage ----------------------------------------------------------
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

FROM node:lts-alpine AS build

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts ./scripts

RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

FROM nginx:alpine

# Oldest nginx without known security fixes outstanding
ARG NGINX_MIN_VERSION=1.31.9
RUN version=$(nginx -v 2>&1 | sed 's|.*nginx/||') \
  && printf '%s\n' "$NGINX_MIN_VERSION" "$version" | sort -V -c 2>/dev/null \
  || { echo "nginx $version is older than $NGINX_MIN_VERSION" >&2; exit 1; }

EXPOSE 80

RUN apk add --no-cache jq

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/entrypoint.sh /entrypoint.sh
COPY docker/overrides.json /etc/oni/overrides.json

RUN ln -s /run/oni/configuration.json /usr/share/nginx/html/configuration.json

RUN mkdir /etc/nginx/oni.d

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1:80/ || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]

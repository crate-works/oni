FROM node:lts-alpine AS build

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts ./scripts

RUN corepack enable && pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

FROM nginx:alpine

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

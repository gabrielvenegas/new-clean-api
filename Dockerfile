FROM oven/bun:slim AS builder

RUN apk add --no-cache tzdata

WORKDIR /usr/src/app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
COPY convex ./convex
RUN bun run build

FROM oven/bun:slim

WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/package.json ./package.json
COPY --from=builder /usr/src/app/node_modules ./node_modules

EXPOSE 3000

ENV TZ=America/Sao_Paulo

CMD ["bun", "start:prod"]

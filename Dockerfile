FROM oven/bun:slim

WORKDIR /usr/src/app

COPY package.json bun.lockb ./

RUN bun install --frozen-lockfile

COPY . .

CMD [ "bun", "run", "start:worker" ]

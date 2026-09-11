FROM node:22.12-alpine AS builder


COPY . /app
WORKDIR /app


RUN --mount=type=cache,target=/root/.npm npm install

FROM node:22-alpine AS release

WORKDIR /app


COPY --from=builder /app/server.js /app/
COPY --from=builder /app/browser_tools.js /app/
COPY --from=builder /app/browser_session.js /app/
COPY --from=builder /app/package.json /app/
COPY --from=builder /app/package-lock.json /app/


ENV NODE_ENV=production


RUN npm ci --ignore-scripts --omit-dev


ENTRYPOINT ["node", "server.js"]

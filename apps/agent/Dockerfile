FROM node:22.22.2-alpine AS builder
WORKDIR /app
RUN corepack enable
RUN apk add --no-cache python3 make g++

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY patches ./patches
COPY apps/agent/package.json apps/agent/package.json
COPY packages/tsconfig packages/tsconfig
RUN pnpm install --frozen-lockfile --filter @magic-resume/agent...

COPY apps/agent apps/agent
RUN pnpm --filter @magic-resume/agent build
# This service does not include the web document-renderer dependencies.
RUN pnpm --filter @magic-resume/agent --config.allowUnusedPatches=true deploy --legacy --prod /opt/agent

FROM node:22.22.2-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libstdc++
RUN mkdir -p /app/data && chown node:node /app/data
ENV AGENT_DATA_DIR=/app/data
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000
COPY --from=builder --chown=node:node /opt/agent ./
USER node
RUN node --input-type=module -e 'import Database from "better-sqlite3"; import {SqliteSaver} from "@langchain/langgraph-checkpoint-sqlite"; const db = new Database(":memory:"); const saver = new SqliteSaver(db); await saver.getTuple({configurable:{thread_id:"image-check"}}); db.close()'
EXPOSE 4000
CMD ["node", "dist/index.js"]

# Copilot Instructions for retry-strategy

Purpose: Enable AI coding agents to be immediately productive in this AWS CDK TypeScript, serverless repo by documenting architecture, workflows, and project-specific patterns.

## Big Picture

- Multi-stack CDK app orchestrated by `BaseStack`; separates concerns for API, messaging, persistence, scheduler, and DynamoDB stream triggers.
- Event-driven flow: API → SQS → Lambda consumer → DynamoDB; plus scheduled jobs and stream-based backoff trigger.
- Shared business logic lives in `lib/` (service + repository patterns). Lambdas should call `MessageService` rather than raw SDKs.

## Architecture & Data Flow

- Stacks (start at `src/Infrastructure/stacks/base-stack.ts`):
  - `PersistenceStack`: DynamoDB `Messages` table with stream enabled (PK `pk`, SK `sk`).
  - `MessagingStack`: SQS queue, SSM export of queue URL, Lambda consumer (`src/lambda/sqs/handler.ts`).
  - `ApiStack`: API Gateway REST with Token Authorizer (JWT via Secrets Manager), Middy layer from SSM; routes wired to handlers in `src/lambda/api/**`.
  - `SchedulerStack`: EventBridge rule invoking `src/lambda/jobs/scheduler.ts`.
  - `ExponentialBackoffStack`: DynamoDB stream → Lambda `src/lambda/triggers/delete.ts`.
- Data keys: `MessageRepository` composes `pk = EMAIL::<email>`, `sk = CREATEDAT::<timestamp>`; IDs via 6-char hex from NanoID.

## Core Patterns

- Service layer: `lib/message-service.ts`
  - `queueMessage()` → SQS (`MESSAGES_QUEUE_URL` env)
  - `storeMessage()` → DynamoDB (requires `email` and `createdAt`)
  - `retryMessage()` → DynamoDB (same requirements; customize as needed)
- Repository layer: `lib/message-repository.ts` over `lib/dynamodb-repository.ts` (marshall, PutItem).
- Middy middleware: API handlers import from Lambda Layer (`/opt/nodejs/node_modules/@middy/...`), enabled via SSM `'/prod/middy-lambda-layer-arn'`.

## Conventions & Config

- Runtime: Node.js 22.x, Architecture: ARM_64 for all NodejsFunction Lambdas.
- Region: `us-east-1` (hardcoded in clients and CDK app).
- Cross-stack values via SSM:
  - Queue URL at `'/prod/messages/queue-url'` (granted `sqs:SendMessage`).
  - Middy layer ARN at `'/prod/middy-lambda-layer-arn'`.
- Auth: Token authorizer reads JWT secret from Secrets Manager `'/prod/messages/jwt-secret'`; HS256; principal is `sub`.

## Developer Workflows

- Use Yarn 4.5.3 (set in `package.json`).

```bash
yarn build       # tsc
yarn test        # jest (ts-jest preset)
yarn deploy      # cdk deploy
yarn synth       # cdk synth
yarn destroy     # cdk destroy
yarn lint        # eslint . --ext .ts
```

- Tests: `**/*.test.ts`, see `src/tests/stacks/persistence-stack.test.ts`; coverage in `coverage/`.
- Mocking: `aws-sdk-client-mock` for AWS clients.

## How-To: Extend Functionality

- New API route:
  1. Add handler in `src/lambda/api/<feature>/<verb>.ts` (use Middy + `returnSuccess/returnError`).
  2. Wire route in `ApiStack` `resources` within `BaseStack` (method+handler name).
  3. Inject env/permissions in `ApiStack` (e.g., SQS send policy, `MESSAGES_QUEUE_URL`).
  4. Call `MessageService` methods rather than direct AWS SDKs.
- SQS consumer logic: edit `src/lambda/sqs/handler.ts` (validates body, sets `createdAt`, calls `storeMessage`).
- Scheduled job: implement business logic in `src/lambda/jobs/scheduler.ts`; adjust schedule in `SchedulerStack`.
- DynamoDB stream trigger: implement backoff/cleanup in `src/lambda/triggers/delete.ts`; event source configured in `ExponentialBackoffStack`.

## Gotchas

- Middy imports must use Lambda Layer path (`/opt/nodejs/...`); ensure the SSM parameter for the layer exists in your environment.
- `storeMessage/retryMessage` require `email` and `createdAt`; API producers should set or the SQS consumer will add `createdAt`.
- Region assumptions (`us-east-1`) exist in clients; align deployment region or refactor.
- Removal policy for DynamoDB is `DESTROY`; `cdk destroy` will delete table data.

## Reference Files

- CDK entry: `src/bin/index.ts`
- Stacks: `src/Infrastructure/stacks/*.ts` (start with `base-stack.ts`)
- API handlers: `src/lambda/api/**`
- SQS consumer: `src/lambda/sqs/handler.ts`
- Stream trigger: `src/lambda/triggers/delete.ts`
- Service/Repo: `src/lib/message-service.ts`, `src/lib/message-repository.ts`
- Types/Utils: `src/lib/types.ts`, `src/lib/api-utils.ts`, `src/lib/nanoid-utils.ts`

---

If any section is unclear or missing (e.g., exact retry/backoff rules), tell me what you need and I’ll refine this guide.

# Serverless Message Retry System

A distributed message processing system with retry capabilities built on AWS serverless architecture using CDK.

This repo is a work in progress. It focuses on the core message and retry pipeline: authenticated ingestion, SQS-based processing, DynamoDB persistence, and scheduled retry replay.

## Architecture

The system uses a multi-stack CDK pattern with the following components:

- **API Gateway (REST)** - HTTP endpoints with JWT authentication
- **Lambda** - Node.js 22.x handlers on ARM64 (Graviton2)
- **DynamoDB** - Message persistence with streams enabled
- **SQS** - Asynchronous message queuing
- **EventBridge** - Scheduled retry jobs

```
Client → API Gateway → Lambda → SQS → Lambda → DynamoDB
                                              ↓
                              EventBridge ← DynamoDB Streams

POST /retry → API Gateway → Lambda → DynamoDB
```

## Status

Implemented:
- JWT-protected API Gateway routes
- `POST /messages` async ingestion path
- `POST /retry` manual retry seeding path
- SQS consumer persistence flow
- Exponential backoff retry pipeline using DynamoDB, EventBridge, and DynamoDB Streams

Planned:
- `GET /messages` read model and pagination
- `GET /retry` retry-history query endpoint
- Additional deployment hardening and operator-facing ergonomics

## Prerequisites

Before deploying, configure these AWS resources:

1. **JWT Secret** (Secrets Manager)
   ```bash
   aws secretsmanager create-secret \
     --name /prod/messages/jwt-secret \
     --secret-string '{"messagesJwtSecret":"your-secret-here"}'
   ```

2. **Middy Lambda Layer** — build, publish, then register the ARN in SSM

   The stack expects a pre-published Lambda layer containing Middy v6. It is not
   created automatically; you must publish it to your AWS account first:

   ```bash
   # Build the layer bundle
   mkdir -p middy-layer/nodejs && cd middy-layer/nodejs
   npm init -y
   npm install @middy/core@^6.3.2 @middy/http-json-body-parser@^6.3.2
   cd ..
   zip -r middy-layer.zip nodejs/

   # Publish to AWS (note: ARM64 + Node 22 to match Lambda config)
   aws lambda publish-layer-version \
     --layer-name middy \
     --description "Middy middleware v6" \
     --zip-file fileb://middy-layer.zip \
     --compatible-runtimes nodejs22.x \
     --compatible-architectures arm64
   ```

   Copy the `LayerVersionArn` from the command output, then register it in SSM:

   ```bash
   aws ssm put-parameter \
     --name /prod/middy-lambda-layer-arn \
     --type String \
     --value "<LayerVersionArn from above>"
   ```

## Getting Started

```bash
# Install dependencies
yarn install

# Build the project
yarn build

# Run tests
yarn test

# Deploy to AWS
yarn deploy
```

## API Endpoints

All endpoints require JWT Bearer token authorization.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/messages` | Queue a new message |
| GET | `/messages` | Planned read endpoint, currently returns `501 Not Implemented` |
| POST | `/retry` | Seed a retry record in DynamoDB for operator/testing use |
| GET | `/retry` | Planned retry-history endpoint, currently returns `501 Not Implemented` |

## Example Requests

`POST /messages`

```bash
curl -X POST https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/prod/messages \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"email":"john.doe@example.com","firstName":"John","lastName":"Doe","data":"message payload"}'
```

Example response:

```text
Message sent {"email":"john.doe@example.com","firstName":"John","lastName":"Doe","data":"message payload"}
```

`POST /retry`

```bash
curl -X POST https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/prod/retry \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"email":"john.doe@example.com","retryCount":2,"expirationAt":"2026-05-05T10:04:00.000Z","retryDate":"2026-05-05","data":"retry payload"}'
```

Example response:

```text
Retry message seeded {"email":"john.doe@example.com","retryCount":2,"expirationAt":"2026-05-05T10:04:00.000Z","retryDate":"2026-05-05","data":"retry payload"}
```

## Retry Flow

Failed messages are retried with exponential backoff:

1. SQS consumer catches a processing failure → stores message in DynamoDB with `expirationAt = now + (2^retryCount × 1h)` and a `retryDate` GSI key
2. EventBridge scheduler queries the `retryDate-expirationAt-index` GSI for expired items and explicitly deletes them (deterministic — not TTL-based)
3. DynamoDB Stream fires a `REMOVE` event → trigger Lambda extracts the full message from `OldImage` and re-queues to SQS with `retryCount + 1`
4. Cycle repeats until `retryCount` reaches `MAX_RETRIES` (5), at which point the message is logged as permanently failed

**Backoff intervals:** 1h → 2h → 4h → 8h → 16h → dead letter

**GSI design note:** `retryDate` (YYYY-MM-DD) is the GSI partition key rather than `status` to avoid a hot partition. Writes distribute across calendar days. The scheduler queries a configurable lookback window (default 30 days) to catch overdue items.

## Why This Architecture

- SQS keeps the API path fast and helps absorb traffic spikes instead of tying request latency to downstream writes.
- DynamoDB stores both primary message records and retry metadata in one place.
- The `retryDate-expirationAt` GSI avoids hot partitions and lets the scheduler query expired retries without scanning the full table.
- The scheduler explicitly deletes expired retry records so retry timing is deterministic instead of depending on DynamoDB TTL behavior.
- The DynamoDB `REMOVE` trigger is a practical way to requeue the full expired record back onto SQS.

## Current Limitations

- `GET /messages` and `GET /retry` are explicitly unimplemented and return `501`.
- `POST /retry` is currently an operator/testing path for seeding retry records, not an end-user workflow.
- The repo is optimized for demonstrating architecture and flow, not for one-command local emulation.

## Project Structure

```
src/
├── bin/                    # CDK app entry point
├── Infrastructure/stacks/  # CDK stack definitions
│   ├── base-stack.ts       # Main orchestrator
│   ├── api-stack.ts        # API Gateway + Lambda
│   ├── persistence-stack.ts # DynamoDB
│   ├── messaging-stack.ts  # SQS + consumer
│   ├── scheduler-stack.ts  # EventBridge jobs
│   └── exponential-backoff-stack.ts
├── lambda/                 # Lambda handlers
│   ├── api/                # API endpoints
│   ├── sqs/                # SQS consumer
│   ├── jobs/               # Scheduled jobs
│   └── triggers/           # DynamoDB stream triggers
└── lib/                    # Shared business logic
    ├── message-service.ts  # Core service layer
    └── message-repository.ts # Data access layer
```

## Development Commands

```bash
yarn build        # Compile TypeScript
yarn test         # Run Jest tests
yarn test:watch   # Run tests in watch mode
yarn lint         # Run ESLint
yarn synth        # Generate CloudFormation template
yarn deploy       # Deploy to AWS
yarn destroy      # Tear down stack
```

## Tech Stack

- AWS CDK 2.x
- TypeScript 5.8
- Node.js 22.x
- AWS Lambda (ARM64)
- DynamoDB
- SQS
- API Gateway REST API
- EventBridge
- AWS Powertools Logger

## Documentation

- [Architecture Diagram](docs/ARCHITECTURE.md) - Detailed system architecture with Mermaid diagrams

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

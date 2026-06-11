# Serverless Message Retry System

![CI](https://github.com/rawlinja/serverless-message-retry-cdk/actions/workflows/ci.yml/badge.svg)

A serverless message processing system built with AWS CDK.

The project focuses on the core message pipeline: authenticated message ingestion, SQS-based processing, DynamoDB persistence, and scheduled retry replay with exponential backoff.

This repo is still a work in progress. The main flow is implemented, but some read-side and operational pieces are intentionally left for later.

## Architecture

The system is split across several CDK stacks. At a high level, messages enter through API Gateway, move through SQS, get processed by Lambda, and are persisted in DynamoDB.

Failed messages are written back to DynamoDB with retry metadata. A scheduled job later finds expired retry records and deletes them, triggering the next retry cycle.

```
Client → API Gateway → Lambda → SQS → Lambda → DynamoDB
                                                    ↓
                    EventBridge (scheduled) → deletes expired retry records
                                                    ↓
                              DynamoDB Streams (REMOVE) → Lambda → DynamoDB (next retry)
                              DynamoDB Streams (INSERT) → Lambda → Relay to third-party
```

The main AWS components are:

- API Gateway for the public HTTP API
- Lambda for API handlers, SQS consumers, scheduled jobs, and stream triggers
- SQS for asynchronous message processing
- DynamoDB for message persistence and retry metadata
- DynamoDB Streams for reacting to inserts and deletes
- EventBridge for scheduled retry checks

## Current Status

Implemented:

- JWT-protected API Gateway routes
- `POST /messages` ingestion endpoint
- SQS consumer flow
- DynamoDB persistence
- Exponential backoff retry pipeline: failed messages are written to DynamoDB with `expirationAt` and `retryDate` metadata
- Scheduled retry replay using EventBridge and the `retryDate-expirationAt-index` GSI
- DynamoDB Stream `REMOVE` trigger that writes the next retry record back to DynamoDB with an incremented backoff interval
- DynamoDB Stream `INSERT` trigger for relaying messages to a third-party integration point

Planned:

- `GET /messages` read endpoint with pagination
- Additional deployment hardening and operator-facing ergonomics

## Prerequisites

Before deploying, you need to create a few supporting AWS resources.

**1. JWT Secret**

The API expects a JWT secret to exist in AWS Secrets Manager.

```bash
aws secretsmanager create-secret \
  --name /prod/messages/jwt-secret \
  --secret-string '{"messagesJwtSecret":"your-secret-here"}'
```

**2. Middy Lambda Layer**

The Lambda functions expect Middy to be available through a pre-published Lambda layer. The CDK stack does not create this layer automatically. Build and publish it first, then store the layer ARN in SSM.

```bash
# Build the layer bundle
mkdir -p middy-layer/nodejs && cd middy-layer/nodejs
npm init -y
npm install @middy/core@^7.6.5 @middy/http-json-body-parser@^7.6.5
cd ..
zip -r middy-layer.zip nodejs/

# Publish the layer (ARM64 + Node 24 to match Lambda config)
aws lambda publish-layer-version \
  --layer-name middy \
  --description "Middy middleware v7" \
  --zip-file fileb://middy-layer.zip \
  --compatible-runtimes nodejs24.x \
  --compatible-architectures arm64
```

Copy the `LayerVersionArn` from the output, then save it in SSM:

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

## API

All endpoints require a JWT bearer token.

| Method | Endpoint    | Description                                     |
| ------ | ----------- | ----------------------------------------------- |
| POST   | `/messages` | Queues a message for asynchronous processing    |
| GET    | `/messages` | Planned read endpoint. Currently returns `501`. |

**POST /messages**

```bash
curl -X POST https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/prod/messages \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"email":"john.doe@example.com","firstName":"John","lastName":"Doe","data":"message payload"}'
```

Example response:

```text
Message queued
```

## Retry Flow

The retry flow is designed around explicit scheduling, not DynamoDB TTL timing.

1. A processing failure writes a retry record to DynamoDB with `retryCount`, `expirationAt`, and `retryDate`. The expiration uses exponential backoff: `now + (2^(retryCount-1) × 1h)`.
2. An EventBridge scheduled job runs every hour. It queries the `retryDate-expirationAt-index` GSI for expired retry records and explicitly deletes them.
3. The DynamoDB Stream emits a `REMOVE` event. The stream trigger reads the full message from `OldImage`, increments `retryCount`, and writes a new retry record back to DynamoDB with the next backoff interval.
4. The cycle repeats until the message reaches `MAX_RETRIES` (5), at which point it is logged as permanently failed.

**Backoff intervals:** 1h → 2h → 4h → 8h → 16h → permanently failed

## GSI Design

The retry GSI uses `retryDate` as the partition key and `expirationAt` as the sort key.

`retryDate` is stored as a plain calendar date — for example, `2026-06-10`. This avoids using a low-cardinality key like `status`, which would concentrate all failed-message writes onto a single partition.

The scheduler queries a configurable lookback window (default 2 days) so it can catch overdue records that crossed date boundaries or were missed by a previous run.

## Why This Architecture

The API does not write directly to the final processing path. It queues the message and returns quickly. SQS buffers ingestion from processing, which keeps API latency from depending on downstream work.

DynamoDB stores both the message and its retry metadata in one place, which keeps the retry pipeline simple.

The retry job explicitly deletes expired retry records instead of relying on TTL. TTL is useful for cleanup, but it is not precise enough when the delete event itself is what triggers the next retry.

The `REMOVE` stream trigger is what keeps the retry cycle going. When the scheduler deletes an expired record, the stream fires with the full old image. The trigger increments `retryCount`, computes the next backoff interval, and writes a new retry record back to DynamoDB — no additional read needed.

## Current Limitations

- `GET /messages` is not implemented and returns `501`.
- The repo is optimized for demonstrating the architecture and message flow, not for one-command local emulation.

## Project Structure

```
src/
├── bin/                      # CDK app entry point
├── Infrastructure/stacks/    # CDK stack definitions
│   ├── base-stack.ts         # Main stack orchestrator
│   ├── api-stack.ts          # API Gateway + API Lambda
│   ├── persistence-stack.ts  # DynamoDB
│   ├── messaging-stack.ts    # SQS + consumer
│   ├── scheduler-stack.ts    # EventBridge scheduled jobs
│   ├── exponential-backoff-stack.ts
│   └── relay-stack.ts        # DynamoDB stream INSERT relay
├── lambda/                   # Lambda handlers
│   ├── api/                  # API endpoints
│   ├── sqs/                  # SQS consumer
│   ├── jobs/                 # Scheduled jobs
│   └── triggers/             # DynamoDB stream triggers
└── lib/                      # Shared business logic
    ├── message-service.ts        # Core service layer
    ├── failed-message-service.ts # Exponential backoff retry logic
    └── message-repository.ts     # Data access layer
```

## Development Commands

```bash
yarn build        # Compile TypeScript
yarn test         # Run Jest tests
yarn test:watch   # Run tests in watch mode
yarn lint         # Run ESLint
yarn synth        # Generate CloudFormation
yarn deploy       # Deploy to AWS
yarn destroy      # Tear down the stack
```

## Tech Stack

- AWS CDK 2.x
- TypeScript
- Node.js 24.x
- AWS Lambda (ARM64)
- API Gateway REST API
- SQS
- DynamoDB
- DynamoDB Streams
- EventBridge
- AWS Powertools Logger
- Middy v7
- @js-temporal/polyfill
- Jest

## Documentation

- [Architecture Diagram](docs/ARCHITECTURE.md) - Detailed system architecture with Mermaid diagrams

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

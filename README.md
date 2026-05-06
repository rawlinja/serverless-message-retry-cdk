# Serverless Message Retry System

A distributed message processing system with retry capabilities built on AWS serverless architecture using CDK.

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
```

## Status

The API pipeline, SQS processing, DynamoDB persistence, and JWT authentication are fully implemented. The exponential backoff retry flow (stream trigger + scheduler) is complete. GET endpoints for `/messages` and `/retry` are stubbed.

## Prerequisites

Before deploying, configure these AWS resources:

1. **JWT Secret** (Secrets Manager)
   ```bash
   aws secretsmanager create-secret \
     --name /prod/messages/jwt-secret \
     --secret-string '{"messagesJwtSecret":"your-secret-here"}'
   ```

2. **Middy Lambda Layer** (SSM Parameter)
   ```bash
   aws ssm put-parameter \
     --name /prod/middy-lambda-layer-arn \
     --type String \
     --value "arn:aws:lambda:us-east-1:ACCOUNT_ID:layer:middy:VERSION"
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
| GET | `/messages` | Retrieve messages (stub) |
| POST | `/retry` | Queue message for retry |
| GET | `/retry` | Retrieve retry history (stub) |

## Retry Flow

Failed messages are retried with exponential backoff:

1. SQS consumer catches a processing failure → stores message in DynamoDB with `expirationAt = now + (2^retryCount × 60s)` and a `retryDate` GSI key
2. EventBridge scheduler queries the `retryDate-expirationAt-index` GSI for expired items and explicitly deletes them (deterministic — not TTL-based)
3. DynamoDB Stream fires a `REMOVE` event → trigger Lambda extracts the full message from `OldImage` and re-queues to SQS with `retryCount + 1`
4. Cycle repeats until `retryCount` reaches `MAX_RETRIES` (5), at which point the message is logged as permanently failed

**Backoff intervals:** 1m → 2m → 4m → 8m → 16m → dead letter

**GSI design note:** `retryDate` (YYYY-MM-DD) is the GSI partition key rather than `status` to avoid a hot partition. Writes distribute across calendar days. The scheduler queries a configurable lookback window (default 30 days) to catch overdue items.

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

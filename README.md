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

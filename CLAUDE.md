# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AWS CDK TypeScript serverless application implementing a **distributed message processing system** with retry capabilities. The system uses API Gateway, Lambda, DynamoDB, SQS, and EventBridge to handle message queuing, persistence, and scheduled retry jobs.

**Tech Stack:** AWS CDK 2.x, TypeScript 5.8, Node.js 22.x, Lambda (ARM64), DynamoDB, SQS, API Gateway v2, EventBridge, Cognito JWT auth

## Common Development Commands

```bash
# Build & Deploy
yarn build              # Compile TypeScript to JavaScript
yarn synth              # Generate CloudFormation template (cdk synth)
yarn deploy             # Deploy stack to AWS (cdk deploy)
yarn destroy            # Tear down stack (cdk destroy)
cdk diff                # Compare deployed vs current state

# Testing
yarn test               # Run all Jest tests
yarn test:watch         # Run tests in watch mode

# Code Quality
yarn lint               # Run ESLint on TypeScript files
```

**Important:** This project uses Yarn 4.5.3 (specified in package.json). Use `yarn` not `npm`.

## Git Commit Guidelines

- **Do not add Claude Code attribution** to commit messages
- Keep commit messages focused on technical changes only

## Architecture Overview

The application follows a **multi-stack CDK pattern** where each AWS service concern is separated into its own stack:

```
BaseStack (src/Infrastructure/stacks/base-stack.ts)
├── PersistenceStack → DynamoDB table "Messages"
├── MessagingStack → SQS queue + Lambda consumer
├── ApiStack → API Gateway + Lambda handlers + JWT authorizer
├── SchedulerStack → EventBridge scheduled jobs
└── ExponentialBackoffStack → DynamoDB Stream triggers
```

### Key Data Flow

1. **Message Submission:** Client → API Gateway (JWT auth) → Lambda → SQS queue
2. **Message Processing:** SQS → Lambda → MessageService → DynamoDB
3. **Exponential Backoff:** DynamoDB Stream (REMOVE events) → Lambda trigger
4. **Scheduled Retry:** EventBridge (every 12 days) → Scheduler Lambda

### DynamoDB Schema

**Table:** Messages
**Primary Key:** `pk` (String) - Format: `EMAIL::${email}`
**Sort Key:** `sk` (String) - Format: `CREATEDAT::${timestamp}`
**Stream:** NEW_AND_OLD_IMAGES enabled for triggers

### API Endpoints (All require JWT authorization)

- `POST /messages` - Queue message to SQS
- `GET /messages` - Retrieve messages (stub)
- `POST /retry` - Queue message for retry
- `GET /retry` - Retrieve retry attempts (stub)

## Code Organization

```
src/
├── bin/index.ts                    # CDK app entry point
├── Infrastructure/stacks/          # CDK infrastructure definitions
│   ├── base-stack.ts              # Main orchestrator (start here)
│   ├── api-stack.ts               # API Gateway + Lambda routes
│   ├── persistence-stack.ts       # DynamoDB table
│   ├── messaging-stack.ts         # SQS + consumer Lambda
│   ├── scheduler-stack.ts         # EventBridge scheduled jobs
│   └── exponential-backoff-stack.ts # DynamoDB Stream triggers
├── lambda/                         # Lambda function handlers
│   ├── api/                       # API Gateway handlers
│   │   ├── authorize.ts           # JWT token authorizer
│   │   ├── messages/              # /messages endpoints
│   │   └── retry/                 # /retry endpoints
│   ├── sqs/handler.ts             # SQS event processor
│   ├── jobs/scheduler.ts          # EventBridge scheduled handler
│   └── triggers/delete.ts         # DynamoDB Stream handler
└── lib/                            # Shared business logic & utilities
    ├── message-service.ts         # Core business logic (start here)
    ├── message-repository.ts      # DynamoDB data access layer
    ├── dynamodb-repository.ts     # Generic DynamoDB operations
    ├── types.ts                   # TypeScript type definitions
    ├── api-utils.ts               # API response helpers
    └── nanoid-utils.ts            # ID generation (6-char hex)
```

## Key Architectural Patterns

### 1. Service Layer Pattern
**MessageService** (`lib/message-service.ts`) is the central business logic hub:
- `queueMessage(message)` → Sends to SQS
- `storeMessage(message)` → Persists to DynamoDB
- `retryMessage(message)` → Stores retry attempt

All Lambda handlers should call MessageService methods rather than directly accessing AWS services.

### 2. Repository Pattern
**MessageRepository** extends **DynamoDBRepository** for type-safe DynamoDB operations:
- Generates composite keys: `EMAIL::${email}` + `CREATEDAT::${timestamp}`
- Generates unique 6-character hex IDs using Nano ID
- Abstracts DynamoDB SDK marshalling/unmarshalling

### 3. Middleware Pattern (Middy)
API handlers use `@middy/core` and `@middy/http-json-body-parser` for automatic JSON parsing. The Middy Lambda Layer ARN is stored in SSM Parameter Store at `/prod/middy-lambda-layer-arn`.

### 4. Stack Composition
Each stack exports ARNs/parameters to SSM Parameter Store for cross-stack references:
- Queue URL: `/prod/messages/queue-url`
- JWT Secret: `/prod/messages/jwt-secret`

### 5. Event-Driven Architecture
- **SQS Event Source:** Batch size 5, triggers Lambda on new messages
- **DynamoDB Streams:** Batch size 5, triggers on REMOVE events for exponential backoff

## Important Configuration Details

### Lambda Configuration
- **Runtime:** Node.js 22.x
- **Architecture:** ARM_64 (Graviton2 for cost efficiency)
- **Entry Point:** `npx tsx src/bin/index.ts` (uses tsx for TypeScript execution)

### Authentication
- JWT tokens validated via custom Lambda authorizer
- Secret stored in AWS Secrets Manager: `/prod/messages/jwt-secret`
- Token format: `Bearer <token>`
- Algorithm: HS256
- Extracted claim: `sub` (used as principal ID)

### Message Type Definition
```typescript
type Message = {
  firstName?: string
  lastName?: string
  email: string              // Required
  phone?: string
  createdAt?: string         // Required (auto-set by service)
  data?: string
}
```

## Incomplete Features (Areas for Development)

1. **Scheduler Lambda** (`lambda/jobs/scheduler.ts`): Currently only logs "hello" - needs retry job logic implementation
2. **Delete Trigger** (`lambda/triggers/delete.ts`): Only logs events - needs exponential backoff cleanup logic
3. **GET /retry endpoint**: Returns debug response - needs actual retry history retrieval
4. **POST /retry endpoint**: Currently identical to POST /messages - should implement retry-specific logic
5. **Exponential backoff calculation**: Framework exists but business logic not implemented

## Testing Approach

- Jest with ts-jest preset
- Test files: `**/*.test.ts`
- Example test: `src/tests/stacks/persistence-stack.test.ts`
- Coverage collected in `./coverage` directory
- Mock AWS SDK using `aws-sdk-client-mock`

## Deployment Notes

- **Default Region:** us-east-1 (configured in BaseStack)
- **Stack Name:** BaseStack
- **Removal Policy:** DynamoDB table set to DESTROY (will delete data on `cdk destroy`)
- **CDK Context:** Extensive feature flags in `cdk.json` for AWS CDK best practices

## Cross-Stack Communication Pattern

When one stack needs resources from another:
1. Export ARN/URL via SSM Parameter Store in creating stack
2. Import parameter ARN in consuming stack
3. Grant permissions using imported ARN
4. Lambda retrieves runtime values from SSM/Secrets Manager

Example: ApiStack needs SQS queue URL from MessagingStack:
- MessagingStack exports `/prod/messages/queue-url` to SSM
- ApiStack imports the parameter
- ApiStack grants Lambda SendMessage permission
- Lambda reads queue URL from SSM at runtime

## Quick Start for New Development

**To understand the system:**
1. Read `src/Infrastructure/stacks/base-stack.ts` - see how stacks connect
2. Read `src/lib/message-service.ts` - understand core business logic
3. Read `src/lambda/api/messages/post.ts` - typical handler pattern
4. Read `src/lambda/sqs/handler.ts` - event processing pattern

**To add a new API endpoint:**
1. Create handler in `src/lambda/api/<route>/`
2. Add route configuration in `src/Infrastructure/stacks/api-stack.ts`
3. Add permissions (SQS, DynamoDB, etc.) in stack file
4. Use MessageService for business logic
5. Return responses via `api-utils.ts` helpers

**To add scheduled job logic:**
1. Modify `src/lambda/jobs/scheduler.ts`
2. Update EventBridge schedule in `scheduler-stack.ts` if needed
3. Grant required permissions in stack file

**To implement exponential backoff:**
1. Modify `src/lambda/triggers/delete.ts`
2. Listen for DynamoDB Stream REMOVE events
3. Implement retry logic (calculate delay, update status, etc.)
4. Update MessageService with retry-specific methods

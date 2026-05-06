# System Architecture

## Component Diagram

```mermaid
graph TB
    subgraph "Client Layer"
        Client[Client Application]
    end

    subgraph "API Gateway Stack"
        APIGW[API Gateway v1<br/>REST API]
        Auth[JWT Authorizer<br/>Lambda]
        SM[Secrets Manager<br/>JWT Secret]
    end

    subgraph "API Lambda Handlers"
        PostMsg[POST /messages<br/>Lambda Handler]
        GetMsg[GET /messages<br/>Lambda Handler]
        PostRetry[POST /retry<br/>Lambda Handler]
        GetRetry[GET /retry<br/>Lambda Handler]
    end

    subgraph "Messaging Stack"
        SQS[SQS Queue<br/>Messages]
        SQSConsumer[SQS Consumer<br/>Lambda]
    end

    subgraph "Persistence Stack"
        DDB[(DynamoDB Table<br/>Messages<br/>PK: EMAIL::email<br/>SK: CREATEDAT::timestamp)]
        Stream[DynamoDB Streams<br/>NEW_AND_OLD_IMAGES]
    end

    subgraph "Scheduler Stack"
        EB[EventBridge Rule<br/>Every 12 days]
        Scheduler[Scheduler<br/>Lambda]
    end

    subgraph "Exponential Backoff Stack"
        DeleteTrigger[Delete Trigger<br/>Lambda]
    end

    subgraph "Parameter Store"
        SSM[SSM Parameters<br/>- Queue URL<br/>- Middy Layer ARN]
    end

    subgraph "Business Logic Layer"
        MS[MessageService]
        MR[MessageRepository]
        DR[DynamoDBRepository]
    end

    %% Client to API Gateway
    Client -->|JWT Bearer Token| APIGW

    %% API Gateway Authorization Flow
    APIGW -->|Authorize Request| Auth
    Auth -->|Fetch Secret| SM
    Auth -->|Return Policy| APIGW

    %% API Gateway to Lambda Handlers
    APIGW -->|POST /messages| PostMsg
    APIGW -->|GET /messages| GetMsg
    APIGW -->|POST /retry| PostRetry
    APIGW -->|GET /retry| GetRetry

    %% API Handlers to MessageService
    PostMsg -->|queueMessage| MS
    PostRetry -->|seedRetryMessage| MS

    %% MessageService to SQS
    MS -->|SendMessage| SQS

    %% SQS to Consumer Lambda
    SQS -->|Batch: 5 messages| SQSConsumer

    %% Consumer Lambda to MessageService
    SQSConsumer -->|storeMessage| MS

    %% MessageService to Repository
    MS -->|persist| MR
    MR -->|extends| DR
    DR -->|PutItem/Query| DDB

    %% DynamoDB Streams
    DDB -->|Stream Events<br/>REMOVE| Stream
    Stream -->|Batch: 5 events| DeleteTrigger

    %% EventBridge Scheduler
    EB -->|Trigger| Scheduler

    %% SSM Parameter Store (CDK deploy-time only — values injected as env vars)
    SSM -.->|MESSAGES_QUEUE_URL env var| PostMsg
    SSM -.->|MESSAGES_QUEUE_URL env var| PostRetry

    %% Styling
    classDef aws fill:#FF9900,stroke:#232F3E,stroke-width:2px,color:#232F3E
    classDef lambda fill:#FF9900,stroke:#232F3E,stroke-width:2px,color:#fff
    classDef logic fill:#4A90E2,stroke:#2E5C8A,stroke-width:2px,color:#fff
    classDef storage fill:#3B48CC,stroke:#232F3E,stroke-width:2px,color:#fff
    classDef client fill:#2ECC71,stroke:#27AE60,stroke-width:2px,color:#fff

    class APIGW,SQS,EB,SSM,SM aws
    class Auth,PostMsg,GetMsg,PostRetry,GetRetry,SQSConsumer,Scheduler,DeleteTrigger lambda
    class MS,MR,DR logic
    class DDB,Stream storage
    class Client client
```

## Data Flow Sequences

### 1. Message Submission Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant AG as API Gateway
    participant A as JWT Authorizer
    participant PH as POST /messages Handler
    participant MS as MessageService
    participant SQ as SQS Queue
    participant SC as SQS Consumer
    participant MR as MessageRepository
    participant DB as DynamoDB

    C->>AG: POST /messages + JWT token
    AG->>A: Authorize request
    A->>A: Verify JWT (HS256)
    A-->>AG: Return allow policy
    AG->>PH: Invoke handler
    PH->>MS: queueMessage(message)
    MS->>SQ: SendMessage
    SQ-->>MS: Message ID
    MS-->>PH: Success
    PH-->>AG: 200 OK
    AG-->>C: Response

    Note over SQ,SC: Async processing
    SQ->>SC: Trigger (batch: 5)
    SC->>MS: storeMessage(message)
    MS->>MR: save(message)
    MR->>MR: Generate keys<br/>PK: EMAIL::email<br/>SK: CREATEDAT::timestamp
    MR->>DB: PutItem
    DB-->>MR: Success
    MR-->>MS: Stored message
    MS-->>SC: Complete
```

## Component Responsibilities

### Infrastructure Stacks

| Stack | Components | Responsibility |
|-------|-----------|----------------|
| **BaseStack** | Orchestrator | Coordinates all child stacks, manages dependencies |
| **PersistenceStack** | DynamoDB Table | Message storage with streams enabled |
| **MessagingStack** | SQS Queue + Consumer | Async message processing |
| **ApiStack** | API Gateway + Handlers + Authorizer | REST API endpoints with JWT auth |
| **SchedulerStack** | EventBridge + Lambda | Scheduled retry jobs |
| **ExponentialBackoffStack** | DynamoDB Stream Trigger | React to message deletions |

### Lambda Functions

| Function | Trigger | Purpose |
|----------|---------|---------|
| **JWT Authorizer** | API Gateway | Validates JWT tokens (HS256) from Secrets Manager |
| **POST /messages** | API Gateway | Queues new messages to SQS |
| **GET /messages** | API Gateway | (Stub) Retrieve messages |
| **POST /retry** | API Gateway | Seeds retry records in DynamoDB for the retry pipeline |
| **GET /retry** | API Gateway | (Stub) Retrieve retry history |
| **SQS Consumer** | SQS Queue | Persists messages to DynamoDB |
| **Scheduler** | EventBridge | Sweeps expired messages from DynamoDB every 12 days |
| **Delete Trigger** | DynamoDB Stream | Re-queues messages to SQS on REMOVE events for exponential backoff |

### Business Logic Layer

| Component | Pattern | Purpose |
|-----------|---------|---------|
| **MessageService** | Service Layer | Central business logic hub for message operations |
| **MessageRepository** | Repository Pattern | Type-safe DynamoDB data access for messages |
| **DynamoDBRepository** | Generic Repository | Abstract DynamoDB CRUD operations |

## Cross-Stack Communication

All stacks communicate via **SSM Parameter Store**:

```
/prod/messages/queue-url          → SQS Queue URL (MessagingStack → ApiStack)
/prod/messages/jwt-secret         → Secrets Manager ARN (ApiStack internal)
/prod/middy-lambda-layer-arn      → Middy Layer ARN (Shared across API handlers)
```

## Security Model

1. **Authentication**: JWT tokens (HS256) validated by custom authorizer
2. **Authorization**: API Gateway enforces authorizer on all routes
3. **Secrets**: JWT secret stored in AWS Secrets Manager (not SSM)
4. **Network**: All resources in us-east-1, no VPC (serverless only)

## Technology Choices

| Technology | Description |
|------------|-------------|
| Node.js 22.x | LTS runtime, TypeScript execution via tsx |
| ARM64 (Graviton2) | Lambda compute architecture |
| Yarn 4.5.3 | Package manager |
| AWS CDK 2.x | Infrastructure as code |
| API Gateway REST API (v1) | HTTP API with token authorizer support |
| Middy | Middleware framework for Lambda handlers |
| Jest + ts-jest | Testing framework |

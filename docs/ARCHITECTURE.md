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
        EB[EventBridge Rule<br/>Every hour]
        Scheduler[Scheduler<br/>Lambda]
    end

    subgraph "Exponential Backoff Stack"
        DeleteTrigger[Delete Trigger<br/>Lambda]
    end

    subgraph "Relay Stack"
        RelayTrigger[Relay Trigger<br/>Lambda]
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

    %% API Handlers to MessageService
    PostMsg -->|queueMessage| MS

    %% MessageService to SQS
    MS -->|SendMessage| SQS

    %% SQS to Consumer Lambda
    SQS -->|Batch: 5 messages| SQSConsumer

    %% Consumer Lambda to MessageService
    SQSConsumer -->|registerMessage| MS

    %% MessageService to Repository
    MS -->|persist| MR
    MR -->|extends| DR
    DR -->|PutItem/Query/Delete| DDB

    %% DynamoDB Streams
    DDB -->|Stream Events<br/>REMOVE + INSERT| Stream
    Stream -->|Batch: 5 events<br/>REMOVE| DeleteTrigger
    Stream -->|Batch: 5 events<br/>INSERT| RelayTrigger

    %% Delete Trigger re-queues eligible messages
    DeleteTrigger -->|queueMessage<br/>retryCount + 1| SQS

    %% EventBridge Scheduler
    EB -->|Trigger| Scheduler
    Scheduler -->|queryExpired + deleteMessage| DDB

    %% SSM Parameter Store (CDK deploy-time only — values injected as env vars)
    SSM -.->|MESSAGES_QUEUE_URL env var| PostMsg
    SSM -.->|MESSAGES_QUEUE_URL env var| DeleteTrigger

    %% Styling
    classDef aws fill:#FF9900,stroke:#232F3E,stroke-width:2px,color:#232F3E
    classDef lambda fill:#FF9900,stroke:#232F3E,stroke-width:2px,color:#fff
    classDef logic fill:#4A90E2,stroke:#2E5C8A,stroke-width:2px,color:#fff
    classDef storage fill:#3B48CC,stroke:#232F3E,stroke-width:2px,color:#fff
    classDef client fill:#2ECC71,stroke:#27AE60,stroke-width:2px,color:#fff

    class APIGW,SQS,EB,SSM,SM aws
    class Auth,PostMsg,GetMsg,SQSConsumer,Scheduler,DeleteTrigger,RelayTrigger lambda
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
    participant RT as Relay Trigger Lambda

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
    SC->>MS: registerMessage(message)
    MS->>MR: create(message)
    MR->>MR: Generate keys<br/>PK: EMAIL::email<br/>SK: CREATEDAT::timestamp
    MR->>DB: PutItem
    DB-->>MR: Success
    MR-->>MS: Stored message
    MS-->>SC: Complete

    Note over DB,RT: Stream delivers INSERT event
    DB->>RT: INSERT event (batch: 5)
    RT->>RT: Unmarshall NewImage
    RT->>RT: Relay to third-party service
```

### 2. Scheduled Retry Cycle (Exponential Backoff)

```mermaid
sequenceDiagram
    participant EB as EventBridge
    participant SC as Scheduler Lambda
    participant DB as DynamoDB
    participant ST as DynamoDB Stream
    participant DT as Delete Trigger Lambda
    participant SQ as SQS Queue
    participant CN as SQS Consumer
    participant MS as MessageService

    EB->>SC: Trigger (every hour)
    SC->>SC: Build retryDate range<br/>(LOOKBACK_DAYS window, default 2)
    loop For each date in lookback window
        SC->>DB: queryExpired(retryDate, now)
        DB-->>SC: Expired messages
        loop For each expired message
            SC->>DB: deleteMessage(pk, sk)
        end
    end

    Note over DB,DT: Stream delivers REMOVE events
    DB->>ST: REMOVE events (batch: 5)
    ST->>DT: Invoke trigger

    loop For each REMOVE record
        DT->>DT: Check retryCount vs MAX_RETRIES (5)
        alt retryCount >= 5
            DT->>DT: Dead letter — log and skip
        else retryCount < 5
            DT->>MS: queueMessage({ ...message, retryCount: retryCount + 1 })
            MS->>SQ: SendMessage
        end
    end

    Note over SQ,CN: Async processing
    SQ->>CN: Trigger (batch: 5)
    CN->>MS: registerMessage(message)
    MS->>DB: PutItem (incremented retryCount)
```

## Component Responsibilities

### Infrastructure Stacks

| Stack                       | Components                          | Responsibility                                     |
| --------------------------- | ----------------------------------- | -------------------------------------------------- |
| **BaseStack**               | Orchestrator                        | Coordinates all child stacks, manages dependencies |
| **PersistenceStack**        | DynamoDB Table                      | Message storage with streams enabled               |
| **MessagingStack**          | SQS Queue + Consumer                | Async message processing                           |
| **ApiStack**                | API Gateway + Handlers + Authorizer | REST API endpoints with JWT auth                   |
| **SchedulerStack**          | EventBridge + Lambda                | Scheduled retry jobs                               |
| **ExponentialBackoffStack** | DynamoDB Stream Trigger             | React to message deletions, re-queue for retry     |
| **RelayStack**              | DynamoDB Stream Trigger             | Relay inserted messages to third-party service     |

### Lambda Functions

| Function           | Trigger         | Purpose                                                                                                             |
| ------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------- |
| **JWT Authorizer** | API Gateway     | Validates JWT tokens (HS256) from Secrets Manager                                                                   |
| **POST /messages** | API Gateway     | Queues new messages to SQS                                                                                          |
| **GET /messages**  | API Gateway     | Returns `501 Not Implemented` until the read model is built                                                         |
| **SQS Consumer**   | SQS Queue       | Persists messages to DynamoDB via `registerMessage`                                                                 |
| **Scheduler**      | EventBridge     | Queries messages by `retryDate` within a lookback window (`LOOKBACK_DAYS` env var, default 2); deletes expired ones |
| **Delete Trigger** | DynamoDB Stream | On REMOVE events, re-queues messages to SQS with `retryCount + 1`; dead-letters at `MAX_RETRIES = 5`                |
| **Relay Trigger**  | DynamoDB Stream | On INSERT events, relays newly persisted messages to third-party service                                            |

### Business Logic Layer

| Component              | Pattern            | Purpose                                                                   |
| ---------------------- | ------------------ | ------------------------------------------------------------------------- |
| **MessageService**     | Service Layer      | Central hub: `queueMessage`, `registerMessage`, `seedRetryMessage`        |
| **MessageRepository**  | Repository Pattern | Type-safe DynamoDB data access; `create`, `queryExpired`, `deleteMessage` |
| **DynamoDBRepository** | Generic Repository | Abstract DynamoDB CRUD operations                                         |

## Configuration and Shared References

Stacks and runtime components share configuration through **SSM Parameter Store** and **AWS Secrets Manager**:

```
/prod/messages/queue-url          → SQS Queue URL (MessagingStack → ApiStack, ExponentialBackoffStack)
/prod/messages/jwt-secret         → Secrets Manager ARN (ApiStack internal)
/prod/middy-lambda-layer-arn      → Middy Layer ARN (Shared across API handlers)
```

## Security Model

1. **Authentication**: JWT tokens (HS256) validated by custom authorizer
2. **Authorization**: API Gateway enforces authorizer on all routes
3. **Secrets**: JWT secret stored in AWS Secrets Manager (not SSM)
4. **Network**: All resources in us-east-1, no VPC (serverless only)

## DynamoDB Schema

**Table:** Messages  
**Primary Key:** `pk` (String) — Format: `EMAIL::${email}`  
**Sort Key:** `sk` (String) — Format: `CREATEDAT::${timestamp}`  
**Stream:** `NEW_AND_OLD_IMAGES` enabled

### Item Shape

```typescript
type Message = {
  firstName?: string
  lastName?: string
  email: string // Required
  phone?: string
  createdAt?: string // ISO timestamp; auto-set by MessageService
  data?: string
  retryCount?: number // Incremented on each retry cycle
  expirationAt?: string // ISO timestamp; record deleted when this passes
  retryDate?: string // YYYY-MM-DD; used by Scheduler to query candidates
}

// Stored record also includes repository-generated fields:
type MessageRecord = Message & {
  pk: string // EMAIL::${email}
  sk: string // CREATEDAT::${timestamp}
  id: string // 6-char hex (Nano ID)
}
```

## Technology Choices

| Technology                | Description                               |
| ------------------------- | ----------------------------------------- |
| Node.js 24.x              | LTS runtime, TypeScript execution via tsx |
| ARM64 (Graviton2)         | Lambda compute architecture               |
| Yarn 4.15.0               | Package manager                           |
| AWS CDK 2.x               | Infrastructure as code                    |
| API Gateway REST API (v1) | HTTP API with token authorizer support    |
| Middy                     | Middleware framework for Lambda handlers  |
| Jest + ts-jest            | Testing framework                         |

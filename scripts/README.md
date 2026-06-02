# Scripts

TypeScript scripts for testing the deployed stack against real AWS infrastructure. No mocks — these hit live resources.

## Prerequisites

- Stack deployed (`yarn deploy`)
- AWS credentials configured in your shell (`AWS_PROFILE` or `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`)
- A valid JWT token for the API (see root `create_token.js`)

## Configuration

Set the following environment variables before running any script. The easiest approach is to export them in your shell or use a `.env` file with `node --env-file=.env`.

| Variable                 | Required | Default    | Description                                             |
| ------------------------ | -------- | ---------- | ------------------------------------------------------- |
| `API_URL`                | Yes\*    | —          | API Gateway base URL (e.g. `https://xxx.execute-api.us-east-1.amazonaws.com/prod`) |
| `JWT_TOKEN`              | Yes\*    | —          | Bearer token for API authorization                      |
| `EMAIL`                  | Yes\*    | —          | Email address used as the DynamoDB partition key        |
| `TABLE_NAME`             | No       | `Messages` | DynamoDB table name                                     |
| `RETRY_COUNT`            | No       | `0`        | Starting retry count when seeding a retry record        |
| `IMMEDIATE`              | No       | `false`    | Set to `true` to make a seeded record immediately eligible for the scheduler |
| `SCHEDULER_FUNCTION_NAME`| Yes\*    | —          | Full Lambda function name for the scheduler (find in AWS console or CLI) |

\* Required by specific scripts — see below.

Finding the scheduler function name:

```bash
aws lambda list-functions \
  --query 'Functions[?contains(FunctionName, `scheduler`)].FunctionName' \
  --output text
```

## Scripts

### `send-message.ts`

Posts a message to `POST /messages` via API Gateway. The message goes to SQS, is consumed by the SQS handler, and persisted to DynamoDB. The DynamoDB INSERT event then triggers the relay Lambda.

**Required:** `API_URL`, `JWT_TOKEN`  
**Optional:** `EMAIL` (defaults to a generated address with the current timestamp)

```bash
API_URL=https://xxx.execute-api.us-east-1.amazonaws.com/prod \
JWT_TOKEN=your-token \
EMAIL=test@example.com \
yarn tsx scripts/send-message.ts
```

Expected output:

```
Sending message: { email: 'test@example.com', ... }
Status:   200
Response: Message queued
```

---

### `seed-retry.ts`

Writes a retry record directly to DynamoDB with computed `expirationAt` and `retryDate`. This bypasses the API and is the script-based replacement for `POST /retry`. Use this to prime the exponential backoff pipeline for testing.

**Required:** `EMAIL`  
**Optional:** `TABLE_NAME`, `RETRY_COUNT`, `IMMEDIATE`

```bash
EMAIL=test@example.com \
RETRY_COUNT=0 \
IMMEDIATE=true \
yarn tsx scripts/seed-retry.ts
```

With `IMMEDIATE=true`, `expirationAt` is set one second in the past so the scheduler picks the record up on its next run. Without it, `expirationAt` is set to `now + (2^RETRY_COUNT × 1h)`.

Expected output:

```
Seeding retry record:
{ "email": "test@example.com", "retryCount": 0, "expirationAt": "...", "retryDate": "2026-06-01", ... }

Done. retryDate: 2026-06-01, expirationAt: 2026-06-01T...
Record is immediately eligible — run invoke-scheduler.ts to trigger the cycle.
```

---

### `check-messages.ts`

Queries all DynamoDB records for a given email. Use this to inspect state before and after running other scripts.

**Required:** `EMAIL`  
**Optional:** `TABLE_NAME`

```bash
EMAIL=test@example.com yarn tsx scripts/check-messages.ts
```

Expected output:

```
Found 2 record(s) for test@example.com:

{ "pk": "EMAIL::test@example.com", "sk": "CREATEDAT::...", "retryCount": 0, ... }
---
{ "pk": "EMAIL::test@example.com", "sk": "CREATEDAT::...", "retryCount": 1, ... }
---
```

---

### `invoke-scheduler.ts`

Manually invokes the scheduler Lambda. The scheduler queries DynamoDB for expired retry records (by `retryDate` GSI), deletes them, and the resulting DynamoDB stream REMOVE event triggers the delete trigger Lambda which re-queues the message to SQS.

**Required:** `SCHEDULER_FUNCTION_NAME`

```bash
SCHEDULER_FUNCTION_NAME=SchedulerStack-indexschedulerlambdafunction-XXXX \
yarn tsx scripts/invoke-scheduler.ts
```

Expected output:

```
Invoking scheduler: SchedulerStack-...
Status: 200
Scheduler invoked successfully.
Check CloudWatch logs for deletion details, then wait a few seconds for the stream trigger to fire.
```

---

## Test Scenarios

### 1. Happy path — message submission

Verifies the full ingestion path: API Gateway → SQS → DynamoDB → relay trigger.

```bash
# Step 1: Send a message
API_URL=... JWT_TOKEN=... EMAIL=test@example.com \
yarn tsx scripts/send-message.ts

# Step 2: Wait ~5 seconds for SQS consumer to process

# Step 3: Verify the record is in DynamoDB
EMAIL=test@example.com yarn tsx scripts/check-messages.ts
```

You should see one record with no `retryCount`, `expirationAt`, or `retryDate`. The relay trigger will have logged the INSERT event in CloudWatch.

---

### 2. Retry pipeline simulation

Verifies the exponential backoff cycle: seed → scheduler deletes → stream fires → re-queue → re-persist with incremented retryCount.

```bash
# Step 1: Seed an immediately eligible retry record
EMAIL=test@example.com RETRY_COUNT=0 IMMEDIATE=true \
yarn tsx scripts/seed-retry.ts

# Step 2: Confirm the record exists
EMAIL=test@example.com yarn tsx scripts/check-messages.ts

# Step 3: Invoke the scheduler — it will find and delete the expired record
SCHEDULER_FUNCTION_NAME=... yarn tsx scripts/invoke-scheduler.ts

# Step 4: Wait ~10 seconds for the stream trigger and SQS consumer to process

# Step 5: Verify the record was re-persisted with retryCount=1
EMAIL=test@example.com yarn tsx scripts/check-messages.ts
```

The original record (retryCount=0) will be gone. A new record with retryCount=1 will appear.

---

### 3. Dead letter simulation

Verifies that a message at `MAX_RETRIES` (5) is logged and dropped rather than re-queued.

```bash
# Step 1: Seed a record already at retryCount=4 (one below the limit)
EMAIL=test@example.com RETRY_COUNT=4 IMMEDIATE=true \
yarn tsx scripts/seed-retry.ts

# Step 2: Invoke the scheduler — deletes the record, REMOVE event fires
SCHEDULER_FUNCTION_NAME=... yarn tsx scripts/invoke-scheduler.ts

# Step 3: Wait ~10 seconds for the stream trigger to process

# Step 4: Verify a retryCount=5 record was persisted
EMAIL=test@example.com yarn tsx scripts/check-messages.ts

# Step 5: Seed and invoke again with retryCount=5 already in place
#         The delete trigger will see retryCount >= MAX_RETRIES and dead-letter it
EMAIL=test@example.com RETRY_COUNT=5 IMMEDIATE=true \
yarn tsx scripts/seed-retry.ts

SCHEDULER_FUNCTION_NAME=... yarn tsx scripts/invoke-scheduler.ts

# Step 6: Check CloudWatch logs for the delete trigger — expect:
#         "Message exceeded max retries, dead lettered"
# Step 7: Confirm no new record was created
EMAIL=test@example.com yarn tsx scripts/check-messages.ts
```

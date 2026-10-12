# Reservation Work Sample

A TypeScript and PostgreSQL implementation of a safe inventory reservation function with idempotency and concurrency protection.

## Features

- Prevents stock from becoming negative.
- Ensures each idempotency key is processed at most once.
- Returns the original result when a request is retried.
- Rejects reuse of an idempotency key with different input.
- Stores successful and out-of-stock results.
- Uses database transactions to keep reservation changes atomic.

## Tech Stack

- Node.js
- TypeScript
- PostgreSQL
- `pg` for database access
- Vitest for automated testing

## Prerequisites

- Node.js and npm
- PostgreSQL
- A PostgreSQL database named `reservation_db`

## Setup

Install the dependencies:

```bash
npm install
```

Create a `.env` file in the project root:

```dotenv
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/reservation_db
```

Replace `YOUR_PASSWORD` with your local PostgreSQL password. Never commit real credentials.

Create the database tables:

```sql
CREATE TABLE products (
    id TEXT PRIMARY KEY,
    stock INTEGER NOT NULL CHECK (stock >= 0)
);

CREATE TABLE reservation_requests (
    idempotency_key TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    result JSONB
);
```

Add a sample product:

```sql
INSERT INTO products (id, stock)
VALUES ('p1', 5);
```

## Run the Application Checks

Type-check the code:

```bash
npm run typecheck
```

Run the automated tests:

```bash
npm test
```

## Concurrency and Idempotency Design

The implementation uses PostgreSQL transactions at the default READ COMMITTED isolation level.

A unique primary key on `idempotency_key` prevents duplicate claims. An atomic conditional stock update ensures inventory is reduced only when sufficient stock is available. The idempotency record, inventory change, and original result are committed in the same transaction.

If a request is retried with the same key and identical input, the saved result is returned. Reusing a key with different input is rejected.

## Test Coverage

The automated tests cover:

1. Successful stock reservation.
2. Retrying a reservation without deducting stock twice.
3. Concurrent requests competing for the final item.
4. Replaying an original out-of-stock result.
5. Rejecting reuse of a key with different input.

## AI Assistance Disclosure

ChatGPT was used to assist with implementation planning, code development, and test-case design. The resulting code and tests were run locally against PostgreSQL. The author is responsible for reviewing, understanding, and validating the final submission.

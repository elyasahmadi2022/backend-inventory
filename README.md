# Store Management Backend

Express, TypeScript, Prisma, and MySQL API for the multi-currency double-entry store management application.

## Requirements

- Node.js 20 or newer
- npm
- Docker with Docker Compose, or an existing MySQL 8 server

## Local installation

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create the environment file:

   ```bash
   cp .env.example .env
   ```

3. Start MySQL and phpMyAdmin:

   ```bash
   docker compose up -d
   ```

   MySQL is available at `127.0.0.1:3306`. phpMyAdmin is available at
   `http://localhost:8080`.

4. Generate Prisma Client and deploy the migrations:

   ```bash
   npm run db:generate
   npm run db:migrate
   ```

   `db:migrate` uses `prisma migrate deploy`, so it does not require a shadow
   database. Use `npm run db:migrate:dev` only while creating a new migration;
   its MySQL user must have access to the database configured by
   `SHADOW_DATABASE_URL`.

5. Seed currencies, accounts, permissions, and the initial administrator:

   ```bash
   npm run db:seed
   ```

6. Start the API:

   ```bash
   npm run dev
   ```

   The default API address is `http://localhost:4000`.

The initial administrator credentials are controlled by the `SEED_ADMIN_*`
values in `.env`. Change the default password outside local development.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the API with automatic reload |
| `npm run build` | Compile TypeScript |
| `npm start` | Run the compiled API |
| `npm run lint` | Check backend source code |
| `npm run db:generate` | Regenerate Prisma Client |
| `npm run db:migrate` | Deploy existing migrations |
| `npm run db:migrate:dev` | Create/apply a development migration |
| `npm run db:seed` | Seed required application data |
| `npm run db:reset` | Erase and recreate the development database |

`db:reset` is destructive and should never be used against production data.

## How accounting is stored

Every posted business operation creates a `JournalEntry`. Its `JournalLine`
records identify the account, currency, debit, credit, exchange rate, and base
amount. A journal must balance: total base debits equal total base credits.

- A purchase normally debits inventory and credits vendor payable.
- A sale credits revenue, debits customer receivable or cash, debits cost of
  goods sold, and credits inventory.
- Receiving customer money debits cash/bank and credits receivable.
- Paying a vendor debits payable and credits cash/bank.
- A money transfer credits the source account and debits the destination.
- A return posts reversing journal lines and an inventory return movement. It
  remains visible as history; the original transaction is not deleted.

Transaction amounts remain in their original currency. The base debit and
credit fields preserve the rate used when the operation was posted. Reports
that show native totals keep AFN, USD, and PKR separate.

Inventory quantities come from posted `InventoryMovement` records. Purchases
and customer returns add stock; sales and vendor returns remove stock. The
accounting inventory value is maintained by the journals created with those
movements.

## Main source areas

- `src/modules` — business modules, routes, validation, and database operations
- `src/modules/reports` — journal, ledger, income, balance-sheet, and summary reports
- `src/modules/sales` and `src/modules/purchases` — invoices, bills, payments, and returns
- `src/modules/accounting` — shared accounting rules and posting helpers
- `prisma/schema.prisma` — database schema
- `prisma/migrations` — database migrations
- `prisma/seed.ts` — initial application data

## Production basics

Set a strong `JWT_SECRET`, use a dedicated MySQL user, restrict database network
access, configure CORS for the frontend origin, run `npm run db:migrate` during
deployment, and store backups outside the application container.

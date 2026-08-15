# Store Management Backend Implementation Plan

## Project Structure

Each business module should follow this shape:

```text
src/modules/<module>/
  <module>.routes.ts
  <module>.controller.ts
  <module>.model.ts
  <module>.validation.ts
```

Shared infrastructure lives in:

```text
src/config/
src/db/
src/middleware/
src/types/
src/utils/
```

The Prisma database design lives in `prisma/schema.prisma`. Generated Prisma files live in `src/generated/prisma` and should not be edited manually.

For this REST API, MVC means:

- `routes`: define URLs, HTTP methods, auth middleware, and validation middleware.
- `controllers`: read request data and return HTTP responses.
- `models`: use Prisma and contain database/business operations.
- `validation`: request schemas used before controllers run.

## Phase 1: Users, Auth, And RBAC

Status: in progress

- Bootstrap first admin when no users exist.
- Login with JWT.
- Get current user.
- Admin user management.
- Role and permission checks.
- Main roles:
  - `admin`: full system control.
  - `manager`: operational accounting, inventory, sales, purchases, payments, and reports.
  - `staff`: limited sales, payment, product, and report access.

## Phase 2: Chart Of Accounts And Partners

Status: in progress

- Manage ledger accounts.
- Manage customers, vendors, sarafi contacts, and staff partners.
- Create partner ledger accounts by currency.
- Ensure every customer/vendor operation posts to a real account.

## Phase 3: Accounting Journal Engine

- Create journal entries and lines inside Prisma transactions.
- Validate total debits equal total credits in base currency.
- Prevent editing/deleting posted entries.
- Reverse posted entries with reversing journals.
- Maintain account balances by account and currency.

## Phase 4: Inventory

Status: product master data implemented; stock movement posting pending

- Manage categories, units, products, and locations.
- Post stock movements for purchases, sales, transfers, returns, and adjustments.
- Maintain inventory balances per product and location.
- Connect inventory movements to accounting journals.

## Phase 5: Sales

- Create sales invoices for customers.
- Post receivable/cash, revenue, inventory, and COGS journal lines.
- Move stock out of the selling location.
- Track paid, partially paid, and unpaid invoices.

## Phase 6: Purchases

- Create purchase bills for vendors.
- Post inventory/expense and payable/cash journal lines.
- Move stock into warehouse/store locations.
- Track paid, partially paid, and unpaid bills.

## Phase 7: Payments And Transfers

Status: money transfers implemented; customer/vendor payments pending

- Receive customer payments.
- Pay vendors.
- Transfer money between cash, bank, daskhil, and sarafi accounts.
- Record exchange rate differences as exchange gain or exchange loss.

## Phase 8: Reports

Status: daily, monthly, account ledger, account balances, cash balances, and inventory balances implemented

- Daily journal report.
- Account ledger report.
- Customer/vendor balance report.
- Inventory balance report.
- Sales and purchase reports.
- Profit and loss report.
- Cash/bank/sarafi/daskhil balances.

## Safety Rules

- Money must always move from one account to another account.
- Posted financial records are immutable.
- Mistakes are fixed by reversing entries.
- Database writes that affect money or inventory must use Prisma transactions.
- Services enforce business rules; controllers only handle HTTP.

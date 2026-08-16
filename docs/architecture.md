# Architecture overview

## Runtime

TexElectronic is a Vite/React routed application. `react-router-dom` provides real URL routes and a persistent application shell. During local development, a Vite middleware plugin exposes the `/api` endpoints from the same origin.

```text
React routes and DataProvider
          │
          ▼
      /api JSON
          │
          ▼
server/api-plugin.mjs
          │
          ▼
server/db.mjs transactions
          │
          ▼
data/texelectronic.sqlite
```

## Shared state

`src/data.jsx` is the only frontend boundary for state loading and mutations. Pages do not own duplicate product or inventory arrays. Successful mutations return the complete authoritative state, which replaces the client snapshot immediately.

## Database

SQLite tables:

- `products`: electronics catalogue identity, aliases, pricing, and JSON technical attributes
- `locations`: zone/rack/shelf/bin hierarchy and capacity
- `inventory`: transactional balance cache per product/location
- `movements`: immutable audit ledger
- `sales`: sale headers and totals
- `stock_counts`: count workflow headers
- `stock_count_items`: expected, counted, discrepancy, and approval state

SQLite uses WAL mode, foreign keys, constraints, and explicit transactions. `inventory` is maintained transactionally while `movements` is the audit source.

## Migration path

The domain boundary is deliberately isolated in `server/db.mjs`. Moving to PostgreSQL should replace SQL access behind the same operations rather than changing route components. A production deployment should add organization/branch columns, PostgreSQL migrations, secure sessions, server-side role middleware, and durable hosted APIs.

## Search

The M1 frontend ranks exact barcode/SKU/part-number matches ahead of exact aliases and technical text matches. Barcode scans use exact equality only. For the production PostgreSQL phase, the same boundary should move to indexed server-side search using `pg_trgm`, normalized tokens, and full-text search.

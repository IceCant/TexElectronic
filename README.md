# TexElectronic M1

Production-minded electronics-shop management demo built around **Find. Locate. Control.**

The original search/locator experience is preserved and now lives inside a connected routed application with persistent SQLite state, an inventory ledger, transactional transfers, POS sales, controlled stock counts, real Code 128 labels, responsive staff workflows, and a public web-order storefront.

## Run locally

```bash
npm install
npm run db:reset
npm run dev
```

Open [http://localhost:4173/dashboard](http://localhost:4173/dashboard).

The customer catalogue is available at [http://localhost:4173/store](http://localhost:4173/store).

The development server owns both the Vite frontend and the local `/api` endpoints. SQLite data is stored at `data/texelectronic.sqlite`.

## Demo identity

The local pilot is pre-authenticated as:

- User: **Alex Turner**
- Role: **Supervisor**
- Password: not required in this local development build

Authentication and production sessions remain an explicit deployment task; authorization boundaries are represented in the UI/domain language but the local pilot uses a trusted supervisor session.

## Routes

- `/dashboard` — restrained operational dashboard
- `/search` — technical component search, normalization, barcode scan, stock and locator map
- `/pos` — keyboard/scanner-oriented cart and cash/KHQR demo checkout
- `/inventory` — current stock, low stock, pending discrepancies, and movement ledger
- `/products` — filterable product catalogue management and product form
- `/products/:id` — identity, specifications, pricing, stock locations, actions, and movement history
- `/locations` — zone/rack/shelf/bin browser with capacities and products
- `/stock-counts` — discrepancy creation and supervisor approval
- `/labels` — Product, Price, Shelf/Bin, and Box Code 128 labels
- `/staff` — mobile-first action launcher
- `/admin` — dashboard alias
- `/store` — public searchable product catalogue with live availability
- `/store/products/:id` — public price, quantity tiers, and technical specifications
- `/store/cart` — cart and pickup/delivery web-order checkout
- `/store/track` — private customer tracking by order reference and matching phone number

## Product photography

Every seeded SKU now has its own transparent product packshot under `public/assets/products/`. Individual photos can be downloaded from the public product-detail page, and the complete set is available from the storefront footer as `texelectronic-product-packshots.zip`.

The catalogue packshots were generated for this prototype in a consistent neutral studio style. Replace them with manufacturer-authorized photography before a final commercial launch if exact physical representation is required.

## Connected demo flow

1. Open Dashboard and go to Search.
2. Search `220uf 25v`, open `25V220µF`, and confirm `B3-12`.
3. Move 100 pcs from `B3-12` to `C1-04`.
4. In POS, add `25V220UF`, set quantity to 50, and complete Cash payment.
5. Search immediately shows 50 fewer pieces; Inventory shows the Sale movement.
6. Create a Rack B stock count for `2A104J`, enter 2,768 against expected 2,800, then approve the −32 discrepancy.
7. Inventory shows the approved Count Adjustment.
8. Open Labels to preview a scannable Code 128 product or location label.
9. Use a narrow viewport to access persistent mobile navigation and the responsive locator.
10. Open `/store`, add a product to the cart, and submit a pickup or delivery order. The reservation updates shared stock immediately.
11. Follow **Track this order** from the confirmation. In `/staff`, move the order through Confirmed, Ready, and Completed; the customer tracking view reflects every update.
12. Cancel a new or confirmed order to release its reservation through an auditable compensating stock movement.

## Development style options

The earlier client options remain available through the small **Demo style** developer control:

- Style 1 — Precision Workbench
- Style 2 — Component Library
- Style 3 — Signal Console

The selection is stored locally and applies to both the admin/staff routes and the public storefront. The customer header exposes the same Style 1/2/3 selector, so a client can compare a complete end-to-end visual direction.

## Commands

```bash
npm run db:reset   # restore seeded products, locations, inventory, and ledger
npm run typecheck  # TypeScript module check for the JS/JSX prototype
npm run lint
npm test
npm run build
npm run check      # all checks above
```

## Current scope boundaries

- The demo API and SQLite database run through the Vite development server. The static Sites worker does not provide durable hosted database writes.
- Camera barcode capture is represented by an exact-match scanner modal/manual fallback; USB and Bluetooth scanners work as keyboard input.
- Product receive, damage/loss, recount, reject, and edit actions have their intended UI entry points; transfer, sale, web order, count creation, approval, and product save are the fully persistent M1 mutations.
- Public catalogue and tracking responses exclude cost price, internal rack/location data, delivery addresses, notes, and phone numbers. Tracking requires both the order reference and matching phone number.
- Web orders reserve stock atomically and support explicit New → Confirmed → Ready → Completed transitions. Cancellation safely restores reserved inventory. Online card payment remains a later production phase.
- The catalogue includes one optimized, downloadable packshot per seeded product. A production media library, upload flow, and manufacturer asset approvals remain a later phase.
- Secure login, role enforcement middleware, and production PostgreSQL are the next backend-hardening phase.

See [docs/architecture.md](docs/architecture.md), [docs/domain-rules.md](docs/domain-rules.md), and [design-qa.md](design-qa.md).
# TexElectronic

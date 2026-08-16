# Domain rules

## Inventory

- Users never overwrite a product's total quantity.
- Balances live per product/location.
- A transfer validates the source, decrements it, increments the destination, and creates transfer-out/transfer-in ledger records in one database transaction.
- A sale validates stock and authoritative server pricing, consumes physical locations, and creates Sale movements in one transaction.
- A web order validates live stock and authoritative server pricing, stores a customer/order snapshot, reserves physical stock, and creates Web Order movements in one transaction.
- Web-order status changes follow explicit transitions: New → Confirmed → Ready → Completed. New and Confirmed orders may be cancelled; completed and cancelled orders are terminal.
- Cancelling an eligible web order restores the exact product/location reservation through compensating Web Order Cancel ledger movements in the same transaction.
- Failed mutations throw descriptive errors and roll back completely.

## Stock count

- A count captures the expected balance at creation time.
- Entering a physical count creates a pending discrepancy; it does not change inventory.
- Only approval applies the counted balance and writes a Count Adjustment movement.
- Counts cannot be approved twice.

## Pricing

- The server selects the highest qualifying quantity break.
- Client-provided unit prices are ignored.
- Discounts cannot make a sale total negative.

## Search and barcode

- Barcode, SKU, and part-number exact matches outrank every fuzzy/technical match.
- Barcode scans never use fuzzy matching.
- Electronics unit normalization handles micro-symbol variants, compact capacitance syntax, `4K7`, and common resistance forms at the boundary.

## Boundary validation

Zod parses transfer, sale, web-order, and count payloads before core domain functions run. Delivery orders require an address. Invalid or ambiguous state fails loudly with a descriptive 400 response.

## Public catalogue

- Only active products are published.
- Customer responses contain identity, retail/quantity pricing, specifications, image, and total availability.
- Cost price, per-location balances, rack paths, and internal operational records are never included in the public catalogue response.
- Public tracking requires a normalized reference and matching phone number, returns a generic not-found response on mismatch, and exposes only fulfillment-safe order fields.

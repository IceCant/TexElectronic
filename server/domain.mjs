import { z } from "zod";

export const movementTypes = [
  "SALE", "PURCHASE_RECEIPT", "TRANSFER_OUT", "TRANSFER_IN", "DAMAGE",
  "LOSS", "RETURN", "OPENING_BALANCE", "COUNT_ADJUSTMENT",
  "WEB_ORDER", "WEB_ORDER_CANCEL",
];

export const transferInput = z.object({
  productId: z.string().min(1),
  fromLocationId: z.string().min(1),
  toLocationId: z.string().min(1),
  quantity: z.number().int().positive(),
  user: z.string().min(1).default("Alex Turner"),
  note: z.string().max(240).default("Mobile stock transfer"),
}).refine(value => value.fromLocationId !== value.toLocationId, {
  message: "Source and destination locations must be different",
  path: ["toLocationId"],
});

export const saleInput = z.object({
  items: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().positive() })).min(1),
  customer: z.string().min(1).default("Walk-in customer"),
  paymentMethod: z.enum(["CASH", "KHQR"]).default("CASH"),
  discount: z.number().min(0).default(0),
  user: z.string().min(1).default("Alex Turner"),
});

export const webOrderInput = z.object({
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.number().int().positive(),
  })).min(1),
  customerName: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(8).max(24),
  fulfillmentMethod: z.enum(["PICKUP", "DELIVERY"]),
  address: z.string().trim().max(240).default(""),
  note: z.string().trim().max(240).default(""),
}).superRefine((value, context) => {
  if (value.fulfillmentMethod !== "DELIVERY") return;
  if (value.address.length >= 5) return;
  context.addIssue({ code:"custom", path:["address"], message:"Delivery address is required" });
});

export const webOrderStatusInput = z.object({
  status: z.enum(["CONFIRMED", "READY", "COMPLETED", "CANCELLED"]),
  user: z.string().trim().min(1).max(100).default("Alex Turner"),
});

export const countInput = z.object({
  name: z.string().min(2),
  scopeType: z.enum(["BRANCH", "ZONE", "RACK", "SHELF", "BIN"]),
  scopeCode: z.string().min(1),
  productId: z.string().min(1),
  locationId: z.string().min(1),
  countedQty: z.number().int().nonnegative(),
  user: z.string().min(1).default("Alex Turner"),
});

export function chooseQuantityPrice(product, quantity, customerTier = "Retail") {
  if (!product) throw new Error("Product is required for pricing");
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Quantity must be a positive integer");
  const tiers = [...(product.priceTiers ?? [])].sort((a, b) => b.minQty - a.minQty);
  const quantityTier = tiers.find(tier => quantity >= tier.minQty);
  if (quantityTier) return quantityTier.price;
  const customerPrice = product.customerPrices?.[customerTier];
  return customerPrice ?? product.retailPrice;
}

export function normalizeElectronicsQuery(rawQuery) {
  if (typeof rawQuery !== "string") throw new Error("Search query must be a string");
  const compact = rawQuery.trim().toLowerCase().replace(/[μµ]/g, "u").replace(/\s+/g, " ");
  if (!compact) return "";
  return compact
    .replace(/(\d+(?:\.\d+)?)\s*u\s*f\b/g, "$1uf")
    .replace(/(\d+(?:\.\d+)?)\s*n\s*f\b/g, "$1nf")
    .replace(/(\d+(?:\.\d+)?)\s*v\b/g, "$1v")
    .replace(/\b4k7\b/g, "4700ohm")
    .replace(/\b4\.7k\b/g, "4700ohm")
    .replace(/\b1k\b/g, "1000ohm");
}

export function calculateDiscrepancy(expectedQty, countedQty) {
  if (!Number.isInteger(expectedQty) || !Number.isInteger(countedQty)) {
    throw new Error("Expected and counted quantities must be integers");
  }
  return countedQty - expectedQty;
}

export function assertSufficientStock(available, requested, context = "Stock movement") {
  if (requested <= 0) throw new Error(`${context} quantity must be positive`);
  if (available < requested) throw new Error(`${context} requires ${requested} pcs but only ${available} pcs are available`);
}

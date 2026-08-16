import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { assertSufficientStock, calculateDiscrepancy, chooseQuantityPrice, countInput, saleInput, transferInput, webOrderInput, webOrderStatusInput } from "./domain.mjs";
import { openingInventory, seedLocations, seedProducts } from "./seed.mjs";

const defaultPath = resolve("data/texelectronic.sqlite");
const productImageById = Object.freeze({
  "25v220uf-smd":"/assets/products/25v220uf-smd.png", "2a104j":"/assets/products/2a104j.png",
  "2a103":"/assets/products/2a103.png", "lm358":"/assets/products/lm358.png",
  "irf3205":"/assets/products/irf3205.png", "ne555":"/assets/products/ne555.png",
  "esp32-devkit":"/assets/products/esp32-devkit.png", "1n4007":"/assets/products/1n4007.png",
  "10k-quarter-w":"/assets/products/10k-quarter-w.png", "usb-c-female":"/assets/products/usb-c-female.png",
  "relay-12v":"/assets/products/relay-12v.png", "arduino-nano":"/assets/products/arduino-nano.png",
});
const allowedWebOrderTransitions = Object.freeze({
  NEW:new Set(["CONFIRMED","CANCELLED"]), CONFIRMED:new Set(["READY","CANCELLED"]),
  READY:new Set(["COMPLETED","CANCELLED"]), COMPLETED:new Set(), CANCELLED:new Set(),
});

function json(value) { return JSON.stringify(value ?? {}); }
function parse(value, fallback = {}) { try { return JSON.parse(value); } catch { return fallback; } }
function now() { return new Date().toISOString(); }
function reference(prefix) { return `${prefix}-${Date.now().toString(36).toUpperCase()}`; }

export function createStore(databasePath = defaultPath) {
  if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  function migrate() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY, sku TEXT NOT NULL UNIQUE, part_number TEXT NOT NULL,
        barcode TEXT NOT NULL UNIQUE, name TEXT NOT NULL, short_name TEXT NOT NULL,
        category TEXT NOT NULL, manufacturer TEXT NOT NULL, aliases_json TEXT NOT NULL,
        description TEXT NOT NULL, retail_price REAL NOT NULL, cost_price REAL NOT NULL,
        min_stock INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1,
        specs_json TEXT NOT NULL, customer_prices_json TEXT NOT NULL, price_tiers_json TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS locations (
        id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, zone TEXT NOT NULL,
        rack TEXT NOT NULL, shelf TEXT NOT NULL, bin TEXT NOT NULL, capacity INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS inventory (
        product_id TEXT NOT NULL REFERENCES products(id), location_id TEXT NOT NULL REFERENCES locations(id),
        quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0), updated_at TEXT NOT NULL,
        PRIMARY KEY(product_id, location_id)
      );
      CREATE TABLE IF NOT EXISTS movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT, product_id TEXT NOT NULL REFERENCES products(id),
        type TEXT NOT NULL, quantity INTEGER NOT NULL, from_location_id TEXT REFERENCES locations(id),
        to_location_id TEXT REFERENCES locations(id), user TEXT NOT NULL, reference TEXT NOT NULL,
        reason TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT, reference TEXT NOT NULL UNIQUE, customer TEXT NOT NULL,
        payment_method TEXT NOT NULL, subtotal REAL NOT NULL, discount REAL NOT NULL, total REAL NOT NULL,
        user TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS web_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT, reference TEXT NOT NULL UNIQUE,
        customer_name TEXT NOT NULL, phone TEXT NOT NULL, fulfillment_method TEXT NOT NULL,
        address TEXT NOT NULL, note TEXT NOT NULL, status TEXT NOT NULL,
        subtotal REAL NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS web_order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL REFERENCES web_orders(id),
        product_id TEXT NOT NULL REFERENCES products(id), sku TEXT NOT NULL,
        product_name TEXT NOT NULL, quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL, line_total REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS stock_counts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, scope_type TEXT NOT NULL,
        scope_code TEXT NOT NULL, status TEXT NOT NULL, counted_by TEXT NOT NULL,
        approved_by TEXT, created_at TEXT NOT NULL, approved_at TEXT
      );
      CREATE TABLE IF NOT EXISTS stock_count_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT, count_id INTEGER NOT NULL REFERENCES stock_counts(id),
        product_id TEXT NOT NULL REFERENCES products(id), location_id TEXT NOT NULL REFERENCES locations(id),
        expected_qty INTEGER NOT NULL, counted_qty INTEGER NOT NULL, difference INTEGER NOT NULL,
        status TEXT NOT NULL
      );
    `);
    const webOrderColumns = new Set(db.prepare("PRAGMA table_info(web_orders)").all().map(column => column.name));
    if (!webOrderColumns.has("updated_at")) db.exec("ALTER TABLE web_orders ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
  }

  function reset() {
    const transaction = db.transaction(() => {
      db.exec("DELETE FROM web_order_items; DELETE FROM web_orders; DELETE FROM stock_count_items; DELETE FROM stock_counts; DELETE FROM sales; DELETE FROM movements; DELETE FROM inventory; DELETE FROM locations; DELETE FROM products;");
      const productStmt = db.prepare(`INSERT INTO products VALUES (@id,@sku,@partNumber,@barcode,@name,@shortName,@category,@manufacturer,@aliases,@description,@retailPrice,@costPrice,@minStock,@active,@specs,@customerPrices,@priceTiers,@createdAt,@updatedAt)`);
      const timestamp = now();
      for (const product of seedProducts) productStmt.run({ ...product, aliases:json(product.aliases), specs:json(product.specs), customerPrices:json(product.customerPrices), priceTiers:json(product.priceTiers), active:product.active ? 1 : 0, createdAt:timestamp, updatedAt:timestamp });
      const locationStmt = db.prepare(`INSERT INTO locations (id,code,name,zone,rack,shelf,bin,capacity) VALUES (@id,@code,@name,@zone,@rack,@shelf,@bin,@capacity)`);
      for (const location of seedLocations) locationStmt.run(location);
      const inventoryStmt = db.prepare("INSERT INTO inventory (product_id,location_id,quantity,updated_at) VALUES (?,?,?,?)");
      const movementStmt = db.prepare("INSERT INTO movements (product_id,type,quantity,to_location_id,user,reference,reason,created_at) VALUES (?,?,?,?,?,?,?,?)");
      for (const [productId, locationId, quantity] of openingInventory) {
        inventoryStmt.run(productId, locationId, quantity, timestamp);
        movementStmt.run(productId, "OPENING_BALANCE", quantity, locationId, "System", "OPENING-M1", "Seeded opening balance", timestamp);
      }
      movementStmt.run("2a104j", "PURCHASE_RECEIPT", 500, null, "Sokha Lim", "PO-2026-0812", "Supplier receipt received at Warehouse", timestamp);
      movementStmt.run("irf3205", "DAMAGE", -2, "c1-04", "Dara Vann", "DMG-2026-014", "Bent leads found during count", timestamp);
    });
    transaction();
    return getState();
  }

  function rowToProduct(row) {
    if (!row) return null;
    const locations = db.prepare(`SELECT l.*, i.quantity FROM inventory i JOIN locations l ON l.id=i.location_id WHERE i.product_id=? AND i.quantity>0 ORDER BY i.quantity DESC`).all(row.id);
    const totalStock = locations.reduce((sum, location) => sum + location.quantity, 0);
    const primary = locations[0];
    return {
      id:row.id, sku:row.sku, partNumber:row.part_number, barcode:row.barcode, name:row.name,
      shortName:row.short_name, category:row.category, manufacturer:row.manufacturer,
      aliases:parse(row.aliases_json, []), description:row.description, retailPrice:row.retail_price,
      costPrice:row.cost_price, minStock:row.min_stock, active:Boolean(row.active), specs:parse(row.specs_json),
      customerPrices:parse(row.customer_prices_json), priceTiers:parse(row.price_tiers_json, []),
      totalStock, locations, primaryLocation:primary?.code ?? "Unassigned",
      primaryLocationPath:primary ? `${primary.zone} → Rack ${primary.rack} → Shelf ${primary.shelf} → Bin ${primary.bin}` : "Unassigned",
      image:productImageById[row.id] ?? "/assets/capacitor-220uf-25v.png",
    };
  }

  function listProducts() { return db.prepare("SELECT * FROM products ORDER BY category,name").all().map(rowToProduct); }
  function getProduct(id) { return rowToProduct(db.prepare("SELECT * FROM products WHERE id=? OR lower(sku)=lower(?)").get(id, id)); }
  function listLocations() {
    return db.prepare(`SELECT l.*, COALESCE(SUM(i.quantity),0) total_units, COUNT(CASE WHEN i.quantity>0 THEN 1 END) product_count FROM locations l LEFT JOIN inventory i ON i.location_id=l.id GROUP BY l.id ORDER BY l.zone,l.rack,l.shelf,l.bin`).all();
  }
  function listMovements(limit = 120) {
    return db.prepare(`SELECT m.*, p.sku, p.short_name product_name, fl.code from_code, tl.code to_code FROM movements m JOIN products p ON p.id=m.product_id LEFT JOIN locations fl ON fl.id=m.from_location_id LEFT JOIN locations tl ON tl.id=m.to_location_id ORDER BY m.id DESC LIMIT ?`).all(limit);
  }
  function listCounts() {
    return db.prepare(`SELECT sc.*, COUNT(sci.id) item_count, COALESCE(SUM(CASE WHEN sci.status='PENDING' THEN 1 ELSE 0 END),0) pending_count FROM stock_counts sc LEFT JOIN stock_count_items sci ON sci.count_id=sc.id GROUP BY sc.id ORDER BY sc.id DESC`).all().map(count => ({ ...count, items:db.prepare(`SELECT sci.*,p.sku,p.short_name product_name,l.code location_code FROM stock_count_items sci JOIN products p ON p.id=sci.product_id JOIN locations l ON l.id=sci.location_id WHERE count_id=?`).all(count.id) }));
  }

  function listWebOrders() {
    return db.prepare("SELECT * FROM web_orders ORDER BY id DESC LIMIT 40").all().map(order => ({
      ...order,
      items: db.prepare("SELECT product_id,sku,product_name,quantity,unit_price,line_total FROM web_order_items WHERE order_id=? ORDER BY id").all(order.id),
    }));
  }

  function publicWebOrder(order) {
    if (!order) return null;
    return {
      reference:order.reference, customerName:order.customer_name,
      fulfillmentMethod:order.fulfillment_method, status:order.status,
      subtotal:order.subtotal, createdAt:order.created_at, updatedAt:order.updated_at || order.created_at,
      items:db.prepare("SELECT sku,product_name,quantity,unit_price,line_total FROM web_order_items WHERE order_id=? ORDER BY id").all(order.id),
    };
  }

  function trackWebOrder(referenceValue, phoneValue) {
    const normalizedReference = String(referenceValue || "").trim().toUpperCase();
    const normalizedPhone = String(phoneValue || "").replace(/\D/g,"");
    if (!normalizedReference || normalizedPhone.length < 8) throw new Error("Order reference and phone number are required");
    const order = db.prepare("SELECT * FROM web_orders WHERE upper(reference)=?").get(normalizedReference);
    if (!order || order.phone.replace(/\D/g,"") !== normalizedPhone) throw new Error("Order not found. Check the reference and phone number");
    return publicWebOrder(order);
  }

  function getStorefront() {
    return {
      products: listProducts().filter(product => product.active).map(product => ({
        id:product.id, sku:product.sku, partNumber:product.partNumber, barcode:product.barcode,
        name:product.name, shortName:product.shortName, category:product.category,
        manufacturer:product.manufacturer, aliases:product.aliases, description:product.description,
        retailPrice:product.retailPrice, priceTiers:product.priceTiers, specs:product.specs,
        totalStock:product.totalStock, image:product.image,
      })),
    };
  }

  function getState() {
    const products = listProducts();
    const movements = listMovements();
    const counts = listCounts();
    const lowStock = products.filter(product => product.totalStock > 0 && product.totalStock <= product.minStock);
    const outOfStock = products.filter(product => product.totalStock === 0);
    const salesToday = db.prepare("SELECT COALESCE(SUM(total),0) value, COUNT(*) count FROM sales WHERE date(created_at)=date('now')").get();
    const webOrdersToday = db.prepare("SELECT COUNT(*) count FROM web_orders WHERE date(created_at)=date('now')").get();
    return {
      products, movements, locations:listLocations(), counts,
      sales:db.prepare("SELECT * FROM sales ORDER BY id DESC LIMIT 40").all(),
      webOrders:listWebOrders(),
      dashboard:{ totalSkus:products.length, totalUnits:products.reduce((sum,p)=>sum+p.totalStock,0), lowStock:lowStock.length, outOfStock:outOfStock.length, pendingAdjustments:counts.reduce((sum,count)=>sum+count.pending_count,0), activeCounts:counts.filter(count=>["IN_PROGRESS","PENDING_APPROVAL"].includes(count.status)).length, salesToday:salesToday.value, ordersToday:salesToday.count + webOrdersToday.count },
    };
  }

  const transferStock = db.transaction(rawInput => {
    const input = transferInput.parse(rawInput);
    const source = db.prepare("SELECT quantity FROM inventory WHERE product_id=? AND location_id=?").get(input.productId, input.fromLocationId);
    assertSufficientStock(source?.quantity ?? 0, input.quantity, "Transfer");
    const destinationExists = db.prepare("SELECT id FROM locations WHERE id=?").get(input.toLocationId);
    if (!destinationExists) throw new Error("Destination location does not exist");
    const timestamp = now(); const ref = reference("TRF");
    db.prepare("UPDATE inventory SET quantity=quantity-?, updated_at=? WHERE product_id=? AND location_id=?").run(input.quantity,timestamp,input.productId,input.fromLocationId);
    db.prepare(`INSERT INTO inventory (product_id,location_id,quantity,updated_at) VALUES (?,?,?,?) ON CONFLICT(product_id,location_id) DO UPDATE SET quantity=quantity+excluded.quantity,updated_at=excluded.updated_at`).run(input.productId,input.toLocationId,input.quantity,timestamp);
    const movement = db.prepare("INSERT INTO movements (product_id,type,quantity,from_location_id,to_location_id,user,reference,reason,created_at) VALUES (?,?,?,?,?,?,?,?,?)");
    movement.run(input.productId,"TRANSFER_OUT",-input.quantity,input.fromLocationId,input.toLocationId,input.user,ref,input.note,timestamp);
    movement.run(input.productId,"TRANSFER_IN",input.quantity,input.fromLocationId,input.toLocationId,input.user,ref,input.note,timestamp);
    return { reference:ref, state:getState() };
  });

  const completeSale = db.transaction(rawInput => {
    const input = saleInput.parse(rawInput);
    const saleReference = reference("SALE"); const timestamp = now();
    let subtotal = 0;
    for (const item of input.items) {
      const product = getProduct(item.productId);
      if (!product) throw new Error(`Product ${item.productId} does not exist`);
      assertSufficientStock(product.totalStock, item.quantity, `Sale of ${product.sku}`);
      subtotal += chooseQuantityPrice(product,item.quantity) * item.quantity;
    }
    const total = Math.max(0, subtotal - input.discount);
    db.prepare("INSERT INTO sales (reference,customer,payment_method,subtotal,discount,total,user,created_at) VALUES (?,?,?,?,?,?,?,?)").run(saleReference,input.customer,input.paymentMethod,subtotal,input.discount,total,input.user,timestamp);
    for (const item of input.items) {
      let remaining = item.quantity;
      const stocks = db.prepare("SELECT location_id,quantity FROM inventory WHERE product_id=? AND quantity>0 ORDER BY CASE WHEN location_id='c1-04' THEN 0 ELSE 1 END,quantity DESC").all(item.productId);
      for (const stock of stocks) {
        if (remaining === 0) break;
        const deduction = Math.min(remaining,stock.quantity);
        db.prepare("UPDATE inventory SET quantity=quantity-?,updated_at=? WHERE product_id=? AND location_id=?").run(deduction,timestamp,item.productId,stock.location_id);
        db.prepare("INSERT INTO movements (product_id,type,quantity,from_location_id,user,reference,reason,created_at) VALUES (?,?,?,?,?,?,?,?)").run(item.productId,"SALE",-deduction,stock.location_id,input.user,saleReference,`Cash sale to ${input.customer}`,timestamp);
        remaining -= deduction;
      }
    }
    return { reference:saleReference,total,state:getState() };
  });

  const createWebOrder = db.transaction(rawInput => {
    const input = webOrderInput.parse(rawInput);
    const orderReference = reference("WEB");
    const timestamp = now();
    const pricedItems = input.items.map(item => {
      const product = getProduct(item.productId);
      if (!product) throw new Error(`Product ${item.productId} does not exist`);
      assertSufficientStock(product.totalStock, item.quantity, `Order of ${product.sku}`);
      const unitPrice = chooseQuantityPrice(product, item.quantity);
      return { ...item, product, unitPrice, lineTotal:unitPrice * item.quantity };
    });
    const subtotal = pricedItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const orderInfo = db.prepare(`INSERT INTO web_orders
      (reference,customer_name,phone,fulfillment_method,address,note,status,subtotal,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(orderReference,input.customerName,input.phone,input.fulfillmentMethod,input.address,input.note,"NEW",subtotal,timestamp,timestamp);
    const itemStatement = db.prepare(`INSERT INTO web_order_items
      (order_id,product_id,sku,product_name,quantity,unit_price,line_total) VALUES (?,?,?,?,?,?,?)`);
    for (const item of pricedItems) {
      itemStatement.run(orderInfo.lastInsertRowid,item.productId,item.product.sku,item.product.name,item.quantity,item.unitPrice,item.lineTotal);
      let remainingQuantity = item.quantity;
      const stocks = db.prepare("SELECT location_id,quantity FROM inventory WHERE product_id=? AND quantity>0 ORDER BY quantity DESC").all(item.productId);
      for (const stock of stocks) {
        if (remainingQuantity === 0) break;
        const reservedQuantity = Math.min(remainingQuantity,stock.quantity);
        db.prepare("UPDATE inventory SET quantity=quantity-?,updated_at=? WHERE product_id=? AND location_id=?").run(reservedQuantity,timestamp,item.productId,stock.location_id);
        db.prepare("INSERT INTO movements (product_id,type,quantity,from_location_id,user,reference,reason,created_at) VALUES (?,?,?,?,?,?,?,?)").run(item.productId,"WEB_ORDER",-reservedQuantity,stock.location_id,"Online Store",orderReference,`Reserved for web order by ${input.customerName}`,timestamp);
        remainingQuantity -= reservedQuantity;
      }
    }
    return { reference:orderReference, subtotal, status:"NEW", storefront:getStorefront(), state:getState() };
  });

  const updateWebOrderStatus = db.transaction((orderId, rawInput) => {
    const input = webOrderStatusInput.parse(rawInput);
    const order = db.prepare("SELECT * FROM web_orders WHERE id=?").get(orderId);
    if (!order) throw new Error("Web order does not exist");
    const allowedStatuses = allowedWebOrderTransitions[order.status];
    if (!allowedStatuses) throw new Error(`Unknown web order status ${order.status}`);
    if (!allowedStatuses.has(input.status)) throw new Error(`Cannot move web order from ${order.status} to ${input.status}`);
    const timestamp = now();
    if (input.status === "CANCELLED") {
      const reservations = db.prepare(`SELECT product_id,from_location_id,SUM(quantity) reserved_quantity
        FROM movements WHERE reference=? AND type='WEB_ORDER' GROUP BY product_id,from_location_id`).all(order.reference);
      for (const reservation of reservations) {
        const restoredQuantity = -reservation.reserved_quantity;
        if (restoredQuantity <= 0) throw new Error(`Invalid reservation ledger for ${order.reference}`);
        db.prepare(`INSERT INTO inventory (product_id,location_id,quantity,updated_at) VALUES (?,?,?,?)
          ON CONFLICT(product_id,location_id) DO UPDATE SET quantity=quantity+excluded.quantity,updated_at=excluded.updated_at`).run(reservation.product_id,reservation.from_location_id,restoredQuantity,timestamp);
        db.prepare("INSERT INTO movements (product_id,type,quantity,to_location_id,user,reference,reason,created_at) VALUES (?,?,?,?,?,?,?,?)").run(reservation.product_id,"WEB_ORDER_CANCEL",restoredQuantity,reservation.from_location_id,input.user,order.reference,"Web order cancelled; reserved stock restored",timestamp);
      }
    }
    db.prepare("UPDATE web_orders SET status=?,updated_at=? WHERE id=?").run(input.status,timestamp,orderId);
    return { order:publicWebOrder(db.prepare("SELECT * FROM web_orders WHERE id=?").get(orderId)),state:getState() };
  });

  const createCount = db.transaction(rawInput => {
    const input = countInput.parse(rawInput);
    const expected = db.prepare("SELECT quantity FROM inventory WHERE product_id=? AND location_id=?").get(input.productId,input.locationId)?.quantity ?? 0;
    const difference = calculateDiscrepancy(expected,input.countedQty);
    const info = db.prepare("INSERT INTO stock_counts (name,scope_type,scope_code,status,counted_by,created_at) VALUES (?,?,?,?,?,?)").run(input.name,input.scopeType,input.scopeCode,"PENDING_APPROVAL",input.user,now());
    db.prepare("INSERT INTO stock_count_items (count_id,product_id,location_id,expected_qty,counted_qty,difference,status) VALUES (?,?,?,?,?,?,?)").run(info.lastInsertRowid,input.productId,input.locationId,expected,input.countedQty,difference,"PENDING");
    return { id:Number(info.lastInsertRowid),state:getState() };
  });

  const approveCount = db.transaction((countId, approver = "Supervisor Mei") => {
    const count = db.prepare("SELECT * FROM stock_counts WHERE id=?").get(countId);
    if (!count) throw new Error("Stock count does not exist");
    if (count.status !== "PENDING_APPROVAL") throw new Error(`Stock count is already ${count.status}`);
    const items = db.prepare("SELECT * FROM stock_count_items WHERE count_id=? AND status='PENDING'").all(countId);
    const timestamp = now(); const ref = `COUNT-${countId}`;
    for (const item of items) {
      db.prepare(`INSERT INTO inventory (product_id,location_id,quantity,updated_at) VALUES (?,?,?,?) ON CONFLICT(product_id,location_id) DO UPDATE SET quantity=excluded.quantity,updated_at=excluded.updated_at`).run(item.product_id,item.location_id,item.counted_qty,timestamp);
      if (item.difference !== 0) db.prepare("INSERT INTO movements (product_id,type,quantity,to_location_id,user,reference,reason,created_at) VALUES (?,?,?,?,?,?,?,?)").run(item.product_id,"COUNT_ADJUSTMENT",item.difference,item.location_id,approver,ref,`Approved count discrepancy: expected ${item.expected_qty}, counted ${item.counted_qty}`,timestamp);
      db.prepare("UPDATE stock_count_items SET status='APPROVED' WHERE id=?").run(item.id);
    }
    db.prepare("UPDATE stock_counts SET status='APPROVED',approved_by=?,approved_at=? WHERE id=?").run(approver,timestamp,countId);
    return { reference:ref,state:getState() };
  });

  function saveProduct(input) {
    const required = ["id","sku","name","partNumber","barcode","category","manufacturer"];
    for (const field of required) if (!input[field]) throw new Error(`${field} is required`);
    const existing = db.prepare("SELECT id FROM products WHERE id=?").get(input.id);
    const timestamp = now();
    const base = { ...input, shortName:input.shortName||input.sku, aliases:json(input.aliases||[]), description:input.description||"", retailPrice:Number(input.retailPrice), costPrice:Number(input.costPrice||0), minStock:Number(input.minStock||0), active:input.active===false?0:1, specs:json(input.specs||{}), customerPrices:json(input.customerPrices||{}), priceTiers:json(input.priceTiers||[]), updatedAt:timestamp };
    if (existing) db.prepare(`UPDATE products SET sku=@sku,part_number=@partNumber,barcode=@barcode,name=@name,short_name=@shortName,category=@category,manufacturer=@manufacturer,aliases_json=@aliases,description=@description,retail_price=@retailPrice,cost_price=@costPrice,min_stock=@minStock,active=@active,specs_json=@specs,customer_prices_json=@customerPrices,price_tiers_json=@priceTiers,updated_at=@updatedAt WHERE id=@id`).run(base);
    else db.prepare(`INSERT INTO products VALUES (@id,@sku,@partNumber,@barcode,@name,@shortName,@category,@manufacturer,@aliases,@description,@retailPrice,@costPrice,@minStock,@active,@specs,@customerPrices,@priceTiers,@createdAt,@updatedAt)`).run({ ...base,createdAt:timestamp });
    return { product:getProduct(input.id),state:getState() };
  }

  migrate();
  if (db.prepare("SELECT COUNT(*) count FROM products").get().count === 0) reset();
  return { db, reset, getState, getStorefront, getProduct, trackWebOrder, transferStock, completeSale, createWebOrder, updateWebOrderStatus, createCount, approveCount, saveProduct };
}

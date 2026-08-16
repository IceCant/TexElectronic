import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../server/db.mjs";
import { calculateDiscrepancy,chooseQuantityPrice,normalizeElectronicsQuery } from "../server/domain.mjs";

function withStore(run) {
  const store=createStore(":memory:");
  try { return run(store); } finally { store.db.close(); }
}

test("electronics normalization handles micro symbols and compact units",()=>{
  assert.equal(normalizeElectronicsQuery("220 μ F 25 V"),"220uf 25v");
  assert.equal(normalizeElectronicsQuery("4K7"),"4700ohm");
});

test("quantity pricing chooses the authoritative server tier",()=>withStore(store=>{
  const product=store.getProduct("2a104j");
  assert.equal(chooseQuantityPrice(product,1),.02);
  assert.equal(chooseQuantityPrice(product,100),.018);
  assert.equal(chooseQuantityPrice(product,1000),.014);
}));

test("stock transfer is atomic and preserves total stock",()=>withStore(store=>{
  const before=store.getProduct("2a104j");
  const result=store.transferStock({productId:"2a104j",fromLocationId:"b3-12",toLocationId:"c1-04",quantity:100,user:"Test Supervisor"});
  const after=result.state.products.find(product=>product.id==="2a104j");
  assert.equal(after.totalStock,before.totalStock);
  assert.equal(after.locations.find(location=>location.id==="b3-12").quantity,2700);
  assert.equal(after.locations.find(location=>location.id==="c1-04").quantity,450);
  const transferMovements=result.state.movements.filter(movement=>movement.reference===result.reference);
  assert.deepEqual(transferMovements.map(movement=>movement.quantity).sort((a,b)=>a-b),[-100,100]);
}));

test("failed transfer rolls back without changing either balance",()=>withStore(store=>{
  const before=store.getProduct("2a104j");
  assert.throws(()=>store.transferStock({productId:"2a104j",fromLocationId:"b3-12",toLocationId:"c1-04",quantity:99999,user:"Test"}),/only 2800 pcs/);
  const after=store.getProduct("2a104j");
  assert.deepEqual(after.locations,before.locations);
}));

test("cash sale decrements stock and writes sale movement",()=>withStore(store=>{
  const before=store.getProduct("2a104j").totalStock;
  const result=store.completeSale({items:[{productId:"2a104j",quantity:50}],customer:"Walk-in customer",paymentMethod:"CASH",discount:0,user:"Alex Turner"});
  const after=result.state.products.find(product=>product.id==="2a104j");
  assert.equal(after.totalStock,before-50);
  assert.equal(result.total,1);
  assert.ok(result.state.movements.some(movement=>movement.reference===result.reference&&movement.type==="SALE"&&movement.quantity===-50));
}));

test("web order atomically reserves stock and stores customer order",()=>withStore(store=>{
  const before=store.getProduct("esp32-devkit").totalStock;
  const result=store.createWebOrder({
    items:[{productId:"esp32-devkit",quantity:5}],
    customerName:"Sophea Chan",phone:"012345678",fulfillmentMethod:"PICKUP",
  });
  const product=result.storefront.products.find(item=>item.id==="esp32-devkit");
  assert.equal(product.totalStock,before-5);
  assert.equal(result.subtotal,30);
  assert.match(result.reference,/^WEB-/);
  assert.equal(result.state.webOrders[0].customer_name,"Sophea Chan");
  assert.equal(result.state.webOrders[0].items[0].quantity,5);
  assert.ok(result.state.movements.some(movement=>movement.reference===result.reference&&movement.type==="WEB_ORDER"));
}));

test("failed web order rolls back without creating an order",()=>withStore(store=>{
  const before=store.getProduct("esp32-devkit").totalStock;
  assert.throws(()=>store.createWebOrder({
    items:[{productId:"esp32-devkit",quantity:9999}],
    customerName:"Sophea Chan",phone:"012345678",fulfillmentMethod:"DELIVERY",address:"Phnom Penh",
  }),/only 84 pcs/);
  assert.equal(store.getProduct("esp32-devkit").totalStock,before);
  assert.equal(store.getState().webOrders.length,0);
}));

test("web order lifecycle is explicit and customer tracking hides internal data",()=>withStore(store=>{
  const created=store.createWebOrder({items:[{productId:"relay-12v",quantity:2}],customerName:"Dara Sok",phone:"012 555 777",fulfillmentMethod:"PICKUP"});
  const orderId=created.state.webOrders[0].id;
  assert.equal(store.updateWebOrderStatus(orderId,{status:"CONFIRMED",user:"Sokha Lim"}).order.status,"CONFIRMED");
  assert.equal(store.updateWebOrderStatus(orderId,{status:"READY",user:"Sokha Lim"}).order.status,"READY");
  assert.equal(store.updateWebOrderStatus(orderId,{status:"COMPLETED",user:"Sokha Lim"}).order.status,"COMPLETED");
  assert.throws(()=>store.updateWebOrderStatus(orderId,{status:"CANCELLED",user:"Sokha Lim"}),/Cannot move web order/);
  const tracked=store.trackWebOrder(created.reference,"012555777");
  assert.equal(tracked.status,"COMPLETED");
  assert.equal(tracked.items[0].sku,"RELAY-12V-10A");
  assert.equal("phone" in tracked,false);
  assert.equal("address" in tracked,false);
}));

test("cancelling a web order restores reserved stock once",()=>withStore(store=>{
  const before=store.getProduct("relay-12v").totalStock;
  const created=store.createWebOrder({items:[{productId:"relay-12v",quantity:5}],customerName:"Dara Sok",phone:"012555777",fulfillmentMethod:"PICKUP"});
  const orderId=created.state.webOrders[0].id;
  assert.equal(store.getProduct("relay-12v").totalStock,before-5);
  const cancelled=store.updateWebOrderStatus(orderId,{status:"CANCELLED",user:"Alex Turner"});
  assert.equal(cancelled.order.status,"CANCELLED");
  assert.equal(store.getProduct("relay-12v").totalStock,before);
  assert.ok(cancelled.state.movements.some(movement=>movement.reference===created.reference&&movement.type==="WEB_ORDER_CANCEL"&&movement.quantity===5));
  assert.throws(()=>store.updateWebOrderStatus(orderId,{status:"CANCELLED",user:"Alex Turner"}),/Cannot move web order/);
}));

test("count discrepancy changes no stock until approved",()=>withStore(store=>{
  const before=store.getProduct("2a104j");
  const expected=before.locations.find(location=>location.id==="b3-12").quantity;
  const created=store.createCount({name:"Rack B test",scopeType:"RACK",scopeCode:"Rack B",productId:"2a104j",locationId:"b3-12",countedQty:expected-32,user:"Counter A"});
  assert.equal(created.state.products.find(product=>product.id==="2a104j").totalStock,before.totalStock);
  assert.equal(calculateDiscrepancy(expected,expected-32),-32);
  const approved=store.approveCount(created.id,"Supervisor Mei");
  assert.equal(approved.state.products.find(product=>product.id==="2a104j").totalStock,before.totalStock-32);
  assert.ok(approved.state.movements.some(movement=>movement.reference===approved.reference&&movement.type==="COUNT_ADJUSTMENT"&&movement.quantity===-32));
}));

import assert from "node:assert/strict";
import test from "node:test";
import handler from "../api/index.mjs";

async function request(path,options) {
  return handler.fetch(new Request(`https://texelectronic-demo.vercel.app${path}`,options));
}

test("Vercel demo API serves seeded operations and storefront data",async()=>{
  await request("/api/reset",{ method:"POST" });
  const stateResponse = await request("/api/state");
  const storefrontResponse = await request("/api/storefront");
  assert.equal(stateResponse.status,200);
  assert.equal(storefrontResponse.status,200);
  assert.equal((await stateResponse.json()).products.length,12);
  assert.equal((await storefrontResponse.json()).products.length,12);
});

test("Vercel demo API accepts a web order",async()=>{
  await request("/api/reset",{ method:"POST" });
  const response = await request("/api/web-orders",{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({
      customerName:"Vercel Demo",
      phone:"012345678",
      fulfillmentMethod:"PICKUP",
      address:"",
      note:"Deployment check",
      items:[{ productId:"esp32-devkit",quantity:1 }],
    }),
  });
  const order = await response.json();
  assert.equal(response.status,201);
  assert.equal(order.status,"NEW");
  assert.match(order.reference,/^WEB-/);
});

test("Vercel SPA rewrite preserves API routes",async()=>{
  const response = await handler.fetch(new Request("https://texelectronic-demo.vercel.app/api/index?path=state"));
  assert.equal(response.status,200);
  assert.match(response.headers.get("content-type"),/^application\/json/);
  assert.equal((await response.json()).products.length,12);
});

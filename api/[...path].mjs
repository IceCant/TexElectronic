import { createStore } from "../server/db.mjs";

const allowedWebOrderTransitions = Object.freeze({
  NEW:new Set(["CONFIRMED","CANCELLED"]),
  CONFIRMED:new Set(["READY","CANCELLED"]),
  READY:new Set(["COMPLETED","CANCELLED"]),
  COMPLETED:new Set(),
  CANCELLED:new Set(),
});

const demoDatabasePath = "/tmp/texelectronic-demo.sqlite";
const store = globalThis.__texElectronicDemoStore ??= createStore(demoDatabasePath);

function jsonResponse(payload,status=200) {
  return globalThis.Response.json(payload,{ status,headers:{ "Cache-Control":"no-store" } });
}

async function readJson(request) {
  const body = await request.text();
  if (!body) return {};
  try { return JSON.parse(body); }
  catch { throw new Error("Request body must contain valid JSON"); }
}

function matchPath(pathname,pattern) {
  const names = [];
  const source = pattern.replace(/:[^/]+/g,token=>{names.push(token.slice(1));return "([^/]+)";});
  const match = pathname.match(new RegExp(`^${source}$`));
  if (!match) return null;
  return Object.fromEntries(names.map((name,index)=>[name,decodeURIComponent(match[index+1])]));
}

async function routeRequest(request) {
  const url = new globalThis.URL(request.url);
  const rewrittenPath = url.searchParams.get("path")?.replace(/^\/+/,"");
  const pathname = rewrittenPath ? `/api/${rewrittenPath}` : url.pathname;
  const { method } = request;

  if (method === "GET" && pathname === "/api/state") return jsonResponse(store.getState());
  if (method === "GET" && pathname === "/api/storefront") return jsonResponse(store.getStorefront());
  if (method === "GET" && pathname === "/api/web-orders/track") return jsonResponse(store.trackWebOrder(url.searchParams.get("reference"),url.searchParams.get("phone")));
  if (method === "POST" && pathname === "/api/reset") return jsonResponse(store.reset());

  const productMatch = matchPath(pathname,"/api/products/:id");
  if (method === "GET" && productMatch) {
    const product = store.getProduct(productMatch.id);
    return product ? jsonResponse(product) : jsonResponse({ error:"Product not found" },404);
  }
  if (method === "POST" && pathname === "/api/products") return jsonResponse(store.saveProduct(await readJson(request)));
  if (method === "POST" && pathname === "/api/transfers") return jsonResponse(store.transferStock(await readJson(request)));
  if (method === "POST" && pathname === "/api/sales") return jsonResponse(store.completeSale(await readJson(request)));
  if (method === "POST" && pathname === "/api/web-orders") return jsonResponse(store.createWebOrder(await readJson(request)),201);
  if (method === "POST" && pathname === "/api/stock-counts") return jsonResponse(store.createCount(await readJson(request)));

  const approveMatch = matchPath(pathname,"/api/stock-counts/:id/approve");
  if (method === "POST" && approveMatch) {
    const body = await readJson(request);
    return jsonResponse(store.approveCount(Number(approveMatch.id),body.approver));
  }

  const webOrderStatusMatch = matchPath(pathname,"/api/web-orders/:id/status");
  if (method === "POST" && webOrderStatusMatch) {
    const body = await readJson(request);
    const currentOrder = store.getState().webOrders.find(order=>order.id===Number(webOrderStatusMatch.id));
    if (!currentOrder) return jsonResponse({ error:"Web order does not exist" },404);
    const allowedStatuses = allowedWebOrderTransitions[currentOrder.status];
    if (!allowedStatuses?.has(body.status)) throw new Error(`Cannot move web order from ${currentOrder.status} to ${body.status}`);
    return jsonResponse(store.updateWebOrderStatus(Number(webOrderStatusMatch.id),body));
  }

  return jsonResponse({ error:"API route not found" },404);
}

export default {
  async fetch(request) {
    try { return await routeRequest(request); }
    catch (error) {
      const issues = error?.issues?.map(issue=>issue.message);
      return jsonResponse({ error:issues?.join("; ") || error?.message || "Request failed" },400);
    }
  },
};

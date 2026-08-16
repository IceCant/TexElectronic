import { createStore } from "./db.mjs";

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function matchPath(pathname, pattern) {
  const names = [];
  const source = pattern.replace(/:[^/]+/g, token => { names.push(token.slice(1)); return "([^/]+)"; });
  const match = pathname.match(new RegExp(`^${source}$`));
  if (!match) return null;
  return Object.fromEntries(names.map((name,index)=>[name,decodeURIComponent(match[index+1])]));
}

export function texElectronicApiPlugin({ databasePath } = {}) {
  const store = createStore(databasePath);
  return {
    name:"tex-electronic-api",
    configureServer(server) {
      server.middlewares.use(async (request,response,next) => {
        const url = new URL(request.url,"http://localhost");
        if (!url.pathname.startsWith("/api/")) return next();
        try {
          if (request.method === "GET" && url.pathname === "/api/state") return send(response,200,store.getState());
          if (request.method === "GET" && url.pathname === "/api/storefront") return send(response,200,store.getStorefront());
          if (request.method === "GET" && url.pathname === "/api/web-orders/track") return send(response,200,store.trackWebOrder(url.searchParams.get("reference"),url.searchParams.get("phone")));
          if (request.method === "POST" && url.pathname === "/api/reset") return send(response,200,store.reset());

          const productMatch = matchPath(url.pathname,"/api/products/:id");
          if (request.method === "GET" && productMatch) {
            const product = store.getProduct(productMatch.id);
            return product ? send(response,200,product) : send(response,404,{ error:"Product not found" });
          }
          if (request.method === "POST" && url.pathname === "/api/products") return send(response,200,store.saveProduct(await readJson(request)));
          if (request.method === "POST" && url.pathname === "/api/transfers") return send(response,200,store.transferStock(await readJson(request)));
          if (request.method === "POST" && url.pathname === "/api/sales") return send(response,200,store.completeSale(await readJson(request)));
          if (request.method === "POST" && url.pathname === "/api/web-orders") return send(response,201,store.createWebOrder(await readJson(request)));
          if (request.method === "POST" && url.pathname === "/api/stock-counts") return send(response,200,store.createCount(await readJson(request)));

          const approveMatch = matchPath(url.pathname,"/api/stock-counts/:id/approve");
          if (request.method === "POST" && approveMatch) {
            const body = await readJson(request);
            return send(response,200,store.approveCount(Number(approveMatch.id),body.approver));
          }
          const webOrderStatusMatch = matchPath(url.pathname,"/api/web-orders/:id/status");
          if (request.method === "POST" && webOrderStatusMatch) return send(response,200,store.updateWebOrderStatus(Number(webOrderStatusMatch.id),await readJson(request)));
          return send(response,404,{ error:"API route not found" });
        } catch (error) {
          const issues = error?.issues?.map(issue=>issue.message);
          return send(response,400,{ error:issues?.join("; ") || error.message || "Request failed" });
        }
      });
    },
  };
}

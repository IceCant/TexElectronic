import { createStore } from "./db.mjs";
const store=createStore();
const state=store.reset();
console.log(`Reset complete: ${state.products.length} products, ${state.dashboard.totalUnits.toLocaleString()} units, ${state.locations.length} locations.`);
store.db.close();

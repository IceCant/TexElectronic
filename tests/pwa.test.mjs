import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readManifest = async name => JSON.parse(
  await readFile(new URL(`../public/${name}.webmanifest`,import.meta.url),"utf8"),
);

test("shop and staff manifests describe separate installable apps",async () => {
  const shop = await readManifest("store");
  const staff = await readManifest("staff");

  assert.equal(shop.id,"/store");
  assert.equal(shop.start_url,"/store");
  assert.equal(shop.scope,"/store");
  assert.equal(staff.id,"/staff");
  assert.equal(staff.start_url,"/staff");
  assert.equal(staff.scope,"/");

  for (const manifest of [shop,staff]) {
    assert.equal(manifest.display,"standalone");
    assert.ok(manifest.icons.some(icon => icon.sizes === "192x192"));
    assert.ok(manifest.icons.some(icon => icon.sizes === "512x512"));
    assert.ok(manifest.icons.some(icon => icon.purpose === "maskable"));
  }
});

test("service worker never intercepts live API data",async () => {
  const serviceWorker = await readFile(new URL("../public/sw.js",import.meta.url),"utf8");
  assert.match(serviceWorker,/url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(serviceWorker,/request\.method !== "GET"/);
});

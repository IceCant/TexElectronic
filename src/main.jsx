import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App.jsx";
import "./styles.css";

const isStorefront = window.location.pathname.startsWith("/store");
const manifest = document.getElementById("app-manifest");
const appleTouchIcon = document.getElementById("apple-touch-icon");
const themeColor = document.querySelector('meta[name="theme-color"]');

if (manifest) manifest.href = isStorefront ? "/store.webmanifest" : "/staff.webmanifest";
if (appleTouchIcon) appleTouchIcon.href = isStorefront ? "/icons/shop-192.png" : "/icons/staff-192.png";
if (themeColor) themeColor.content = isStorefront ? "#11161b" : "#071524";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(error => {
      console.error("Tex Electronic service worker registration failed", error);
    });
  });
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter><App /></BrowserRouter>
  </React.StrictMode>,
);

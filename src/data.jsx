import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const DataContext = createContext(null);

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type":"application/json", ...(options.headers ?? {}) },
    body: options.body && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

export function DataProvider({ children }) {
  const [state,setState] = useState(null);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");

  const refresh = useCallback(async () => {
    try { setState(await request("/api/state")); setError(""); }
    catch (nextError) { setError(nextError.message); }
  },[]);

  useEffect(() => { refresh(); },[refresh]);

  const mutate = useCallback(async (path,body,successMessage) => {
    try {
      const payload = await request(path,{ method:"POST",body });
      if (payload.state) setState(payload.state); else if (payload.products) setState(payload); else await refresh();
      setNotice(successMessage || "Saved successfully"); setError("");
      window.setTimeout(()=>setNotice(""),2800);
      return payload;
    } catch (nextError) { setError(nextError.message); throw nextError; }
  },[refresh]);

  const value = useMemo(()=>({ state,error,notice,refresh,mutate,setError }),[state,error,notice,refresh,mutate]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) throw new Error("useData must be used within DataProvider");
  return context;
}

export function useProduct(id) {
  const { state } = useData();
  return state?.products.find(product => product.id === id || product.sku.toLowerCase() === String(id).toLowerCase());
}

export function formatMoney(value) {
  const number = Number(value || 0);
  return number < 1 ? `$${number.toFixed(3)}` : `$${number.toFixed(2)}`;
}

export function movementLabel(type) {
  return String(type).replaceAll("_"," ").replace(/\b\w/g,letter=>letter.toUpperCase());
}

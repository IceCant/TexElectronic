import { Navigate,Route,Routes } from "react-router-dom";
import { DataProvider } from "./data.jsx";
import { AppShell } from "./components/AppShell.jsx";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { SearchPage } from "./pages/SearchPage.jsx";
import { ProductsPage } from "./pages/ProductsPage.jsx";
import { ProductDetailPage } from "./pages/ProductDetailPage.jsx";
import { InventoryPage } from "./pages/InventoryPage.jsx";
import { PosPage } from "./pages/PosPage.jsx";
import { LabelsPage,LocationsPage,StaffPage,StockCountsPage } from "./pages/OperationsPages.jsx";
import { StorefrontApp } from "./pages/Storefront.jsx";

export function App() {
  return <Routes><Route path="/store/*" element={<StorefrontApp/>}/><Route path="/*" element={<DataProvider><Routes><Route element={<AppShell/>}><Route index element={<Navigate to="/dashboard" replace/>}/><Route path="/dashboard" element={<DashboardPage/>}/><Route path="/admin" element={<Navigate to="/dashboard" replace/>}/><Route path="/search" element={<SearchPage/>}/><Route path="/pos" element={<PosPage/>}/><Route path="/inventory" element={<InventoryPage/>}/><Route path="/products" element={<ProductsPage/>}/><Route path="/products/:id" element={<ProductDetailPage/>}/><Route path="/locations" element={<LocationsPage/>}/><Route path="/stock-counts" element={<StockCountsPage/>}/><Route path="/labels" element={<LabelsPage/>}/><Route path="/staff" element={<StaffPage/>}/><Route path="*" element={<Navigate to="/dashboard" replace/>}/></Route></Routes></DataProvider>}/></Routes>;
}

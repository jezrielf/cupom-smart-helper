import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import Scanner from "./pages/Scanner";
import Receipts from "./pages/Receipts";
import Supermarkets from "./pages/Supermarkets";
import PriceComparison from "./pages/PriceComparison";
import ProductCatalog from "./pages/ProductCatalog";
import ShoppingList from "./pages/ShoppingList";
import Analytics from "./pages/Analytics";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/scanner" element={<Scanner />} />
            <Route path="/cupons" element={<Receipts />} />
            <Route path="/supermercados" element={<Supermarkets />} />
            <Route path="/comparativo" element={<PriceComparison />} />
            <Route path="/produtos" element={<ProductCatalog />} />
            <Route path="/lista" element={<ShoppingList />} />
            <Route path="/analises" element={<Analytics />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

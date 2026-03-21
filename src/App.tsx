import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppSidebar } from "@/components/AppSidebar";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import PriceChanges from "./pages/PriceChanges";
import Export from "./pages/Export";
import Diagnostics from "./pages/Diagnostics";
import SettingsPage from "./pages/Settings";
import StoreDetail from "./pages/StoreDetail";
import ScrapingAudit from "./pages/ScrapingAudit";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import CWImportUploadPage from "./pages/cw-import/index";
import CWImportListPage from "./pages/cw-import/history";
import CWImportReviewPage from "./pages/cw-import/[jobId]";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function AppLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return <Auth />;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Dark sidebar */}
      <AppSidebar />

      {/* Light workspace */}
      <main className="flex-1 overflow-hidden flex flex-col">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/products" element={<Products />} />
          <Route path="/price-changes" element={<PriceChanges />} />
          <Route path="/export" element={<Export />} />
          <Route path="/diagnostics" element={<Diagnostics />} />
          <Route path="/scraping-audit" element={<ScrapingAudit />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/stores/:id" element={<StoreDetail />} />
          {/* CW Import pipeline */}
          <Route path="/cw-import" element={<CWImportUploadPage />} />
          <Route path="/cw-import/history" element={<CWImportListPage />} />
          <Route path="/cw-import/:jobId" element={<CWImportReviewPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppLayout />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

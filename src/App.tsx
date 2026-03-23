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
import { Loader2, AlertTriangle } from "lucide-react";
import React from "react";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

// ─── Error Boundary ──────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-8">
          <div className="max-w-lg w-full rounded-xl border border-destructive/30 bg-destructive/5 p-6 space-y-3">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <p className="font-semibold">App crashed — runtime error</p>
            </div>
            <p className="text-sm text-muted-foreground font-mono break-all">
              {this.state.error.message}
            </p>
            <pre className="text-xs text-muted-foreground overflow-auto max-h-48 bg-muted rounded p-3">
              {this.state.error.stack}
            </pre>
            <button
              className="text-xs underline text-muted-foreground hover:text-foreground"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/stores" element={<Stores />} />
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
        </ErrorBoundary>
      </main>
    </div>
  );
}

const App = () => (
  <ErrorBoundary>
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
  </ErrorBoundary>
);

export default App;


import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppSidebar } from "@/components/AppSidebar";
import { Loader2, AlertTriangle } from "lucide-react";
import React, { Suspense, lazy } from "react";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Products = lazy(() => import("./pages/Products"));
const PriceChanges = lazy(() => import("./pages/PriceChanges"));
const Export = lazy(() => import("./pages/Export"));
const Diagnostics = lazy(() => import("./pages/Diagnostics"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const StoreDetail = lazy(() => import("./pages/StoreDetail"));
const Stores = lazy(() => import("./pages/Stores"));
const ScrapingAudit = lazy(() => import("./pages/ScrapingAudit"));
const CanonicalReview = lazy(() => import("./pages/CanonicalReview"));
const Auth = lazy(() => import("./pages/Auth"));
const NotFound = lazy(() => import("./pages/NotFound"));
const CWImportUploadPage = lazy(() => import("./pages/cw-import/index"));
const CWImportListPage = lazy(() => import("./pages/cw-import/history"));
const CWImportReviewPage = lazy(() => import("./pages/cw-import/[jobId]"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

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

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[App/ErrorBoundary] render crash", error, errorInfo);
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

function RouterLogger() {
  const location = useLocation();

  React.useEffect(() => {
    console.info("[Router] route changed", location.pathname);
  }, [location.pathname]);

  return null;
}

function RouteLoader() {
  return (
    <div className="flex-1 bg-background flex items-center justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function AppLayout() {
  const { user, loading } = useAuth();

  console.info("[Layout] render", {
    loading,
    hasUser: !!user,
    pathname: typeof window !== "undefined" ? window.location.pathname : "unknown",
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return <Auth />;

  return (
    <div className="flex h-screen overflow-hidden bg-background p-5 gap-5">
      <AppSidebar />
      <main className="flex-1 overflow-hidden flex flex-col min-w-0 bg-background">
        <ErrorBoundary>
          <Suspense fallback={<RouteLoader />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/stores" element={<Stores />} />
              <Route path="/products" element={<Products />} />
              <Route path="/price-changes" element={<PriceChanges />} />
              <Route path="/export" element={<Export />} />
              <Route path="/diagnostics" element={<Diagnostics />} />
              <Route path="/scraping-audit" element={<ScrapingAudit />} />
              <Route path="/canonical-review" element={<CanonicalReview />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/stores/:id" element={<StoreDetail />} />
              <Route path="/cw-import" element={<CWImportUploadPage />} />
              <Route path="/cw-import/history" element={<CWImportListPage />} />
              <Route path="/cw-import/:jobId" element={<CWImportReviewPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}

const App = () => {
  console.info("[App] boot");

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <RouterLogger />
            <AuthProvider>
              <AppLayout />
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@supabase/supabase-js')) return 'supabase';
          if (id.includes('@tanstack/react-query')) return 'react-query';
          if (id.includes('react-router') || id.includes('react-dom') || id.includes('/react/')) return 'react-core';
          if (id.includes('@radix-ui') || id.includes('cmdk') || id.includes('vaul') || id.includes('sonner')) return 'ui-vendor';
          if (id.includes('recharts')) return 'charts';
          if (id.includes('xlsx')) return 'export-vendor';
          return 'vendor';
        },
      },
    },
  },
}));

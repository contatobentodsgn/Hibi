import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@heroui')) return 'heroui';
          if (id.includes('node_modules/lucide-react')) return 'icons';
          if (id.includes('node_modules/motion')) return 'motion';
          if (id.includes('/src/ui/redesign/')) return 'redesign';
        },
      },
    },
  },
});

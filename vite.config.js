import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Supports this preview environment while keeping host checks enabled.
    allowedHosts: ['terminal.local'],
  },
});

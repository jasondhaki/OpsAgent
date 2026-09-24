import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Tests run server code directly; the marker package would otherwise throw.
      'server-only': fileURLToPath(new URL('./node_modules/server-only/empty.js', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // Placeholders so modules importing env.ts load. Tests build their own local clients, and no
    // real keys (Telegram, AI) are ever set here, so those integrations stay no-ops (rule 9).
    env: { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test', SUPABASE_SERVICE_ROLE_KEY: 'test' },
  },
});

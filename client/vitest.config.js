import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Component tests (Build Spec §12): jsdom + Testing Library. Kept in a
// separate config so the production build is untouched.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
  },
});

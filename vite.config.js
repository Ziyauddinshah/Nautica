import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env=loadEnv(mode,process.cwd(),'');
  const target='http://127.0.0.1:'+(process.env.PORT||env.PORT||3001);
  return {
  plugins: [react()],
  base: '/',
  server: { proxy: { '/api': target } },
  preview: { proxy: { '/api': target } },
  test: { include: ['tests/**/*.{test,spec}.{js,jsx}'], environment: 'jsdom', setupFiles: './tests/setup.js', clearMocks: true },
};
});

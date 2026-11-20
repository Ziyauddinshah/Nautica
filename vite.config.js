import { defineConfig, loadEnv, normalizePath } from 'vite';
import { resolve } from 'node:path';
import {databasePath} from './server/database-path.js';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env=loadEnv(mode,process.cwd(),'');
  const database=normalizePath(databasePath({...env,...process.env,NODE_ENV:'development'}));
  const privateFiles=['**/.env','**/.env.*','**/*.{crt,pem,key}','**/.git/**','**/.cache/**','**/integration/**','**/data/**','**/*.sqlite','**/*.sqlite-*','**/server/**','**/scripts/**',database,database+'-wal',database+'-shm'];
  const target='http://127.0.0.1:'+(process.env.PORT||env.PORT||3001);
  return {
  plugins: [react()],
  base: '/',
  server: { fs: { strict: true, deny: privateFiles }, proxy: { '/api': target } },
  preview: { proxy: { '/api': target } },
  test: { include: ['tests/**/*.{test,spec}.{js,jsx}'], environment: 'jsdom', setupFiles: './tests/setup.js', clearMocks: true },
};
});

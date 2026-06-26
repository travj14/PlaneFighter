import { defineConfig } from 'vite';

const ALLOWED_HOSTS = ['fighter.payrollgm.com', 'payrollgm.com'];

export default defineConfig({
  // Relative asset URLs so the app works both at a domain root and under a
  // sub-path (e.g. payrollgm.com/fighter/).
  base: './',
  server: {
    open: true,
    allowedHosts: ALLOWED_HOSTS,
  },
  // `vite preview` (used by start.sh) enforces a Host allow-list; add the
  // domains it's served under so the reverse proxy isn't blocked.
  preview: {
    allowedHosts: ALLOWED_HOSTS,
  },
  build: {
    target: 'es2020',
  },
});


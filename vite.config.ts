import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages project site: https://<user>.github.io/wedding-guest-hub/
// Change `base` if your repo name differs.
export default defineConfig({
  plugins: [react()],
  base: '/wedding-guest-hub/',
})

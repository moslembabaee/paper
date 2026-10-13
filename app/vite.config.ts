import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { roadmapPlugin } from './src/roadmap/plugin.ts'

export default defineConfig({
  plugins: [
    roadmapPlugin(),
    tailwindcss(),
    react(),
  ],
})

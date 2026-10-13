import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { paperBridgePlugin } from './mcp/plugin.ts'
import { roadmapPlugin } from './src/roadmap/plugin.ts'

export default defineConfig({
  plugins: [
    roadmapPlugin(),
    paperBridgePlugin(),
    tailwindcss(),
    react(),
  ],
})

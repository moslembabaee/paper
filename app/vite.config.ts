import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { paperBridgePlugin } from './mcp/plugin.ts'
import { roadmapPlugin } from './src/roadmap/plugin.ts'
import { collaborationPlugin } from './collaboration/plugin.ts'

export default defineConfig({
  base: process.env.BASE_URL || './',
  plugins: [
    collaborationPlugin(),
    roadmapPlugin(),
    paperBridgePlugin(),
    tailwindcss(),
    react(),
  ],
})

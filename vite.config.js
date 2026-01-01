import { defineConfig } from "vite";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: ["es2021", "chrome100", "safari13"],
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      // Externalize Node.js modules that can't run in browser
      external: [
        'child_process',
        'readline'
      ]
    }
  },
  resolve: {
    alias: {
      // Provide shims for Node.js modules
      'events': resolve(__dirname, 'src/shims/events-shim.js'),
      'path': resolve(__dirname, 'src/shims/path-shim.js'),
      'url': resolve(__dirname, 'src/shims/url-shim.js'),
      'crypto': resolve(__dirname, 'src/shims/crypto-shim.js'),
      'process': resolve(__dirname, 'src/shims/process-shim.js'),
      'fs': resolve(__dirname, 'src/shims/fs'),
      'fs/promises': resolve(__dirname, 'src/shims/fs/promises.js'),
      'os': resolve(__dirname, 'src/shims/os-shim.js'),
      // Also alias node: prefixed imports
      'node:events': resolve(__dirname, 'src/shims/events-shim.js'),
      'node:path': resolve(__dirname, 'src/shims/path-shim.js'),
      'node:url': resolve(__dirname, 'src/shims/url-shim.js'),
      'node:crypto': resolve(__dirname, 'src/shims/crypto-shim.js'),
      'node:process': resolve(__dirname, 'src/shims/process-shim.js'),
      'node:fs': resolve(__dirname, 'src/shims/fs'),
      'node:fs/promises': resolve(__dirname, 'src/shims/fs/promises.js'),
      'node:os': resolve(__dirname, 'src/shims/os-shim.js')
    }
  },
  define: {
    // Define process as a global for inline references
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.browser': true,
    'process.platform': JSON.stringify('browser')
  }
});
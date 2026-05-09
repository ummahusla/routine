import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@flow-build/core': resolve('packages/core/src/index.ts'),
        '@flow-build/flowbuilder': resolve('packages/flowbuilder/src/index.ts')
      }
    },
    plugins: [externalizeDepsPlugin({ exclude: ['@flow-build/core', '@flow-build/flowbuilder'] })]
  },
  preload: {
    resolve: {
      alias: {
        '@flow-build/core': resolve('packages/core/src/index.ts')
      }
    },
    plugins: [externalizeDepsPlugin({ exclude: ['@flow-build/core', '@electron-toolkit/preload'] })]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})

import { execFileSync } from 'node:child_process'
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Regenerate packages/rote/src/skill-content.gen.ts when SKILL.md changes.
// The rote plugin imports the generated module at load time; without this,
// edits to SKILL.md don't propagate until the next manual `pnpm run gen`.
function rotateSkillRegenPlugin() {
  const skillPath = resolve('packages/rote/SKILL.md')
  const genScript = resolve('packages/rote/scripts/gen-skill.mjs')
  const regenerate = () => {
    try {
      execFileSync('node', [genScript], { stdio: 'inherit' })
    } catch (e) {
      console.warn('[rote-skill] regen failed:', e.message)
    }
  }
  return {
    name: 'rote-skill-regen',
    buildStart() {
      regenerate()
      this.addWatchFile?.(skillPath)
    },
    handleHotUpdate(ctx) {
      if (ctx.file === skillPath) {
        regenerate()
      }
      return undefined
    }
  }
}

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@flow-build/core': resolve('packages/core/src/index.ts'),
        '@flow-build/flowbuilder': resolve('packages/flowbuilder/src/index.ts'),
        '@flow-build/rote': resolve('packages/rote/src/index.ts')
      }
    },
    plugins: [
      rotateSkillRegenPlugin(),
      externalizeDepsPlugin({
        exclude: ['@flow-build/core', '@flow-build/flowbuilder', '@flow-build/rote']
      })
    ]
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

import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'resources/icon.svg')

const targets = [
  { out: 'resources/icon.png', size: 1024 },
  { out: 'build/icon.png', size: 1024 }
]

for (const { out, size } of targets) {
  const path = resolve(root, out)
  await mkdir(dirname(path), { recursive: true })
  await sharp(source, { density: 384 }).resize(size, size).png().toFile(path)
  console.log(`✓ ${out} (${size}×${size})`)
}

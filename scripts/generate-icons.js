import sharp from 'sharp'
import { mkdir, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const iconsDir = join(__dirname, '..', 'public', 'icons')

async function generateIcons() {
  await mkdir(iconsDir, { recursive: true })

  const sizes = [192, 512]
  const primaryColor = '#1E40AF'

  for (const size of sizes) {
    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${size}" height="${size}" fill="${primaryColor}" rx="${size / 8}"/>
        <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" 
              font-family="Inter, sans-serif" font-size="${size * 0.4}" font-weight="700" fill="white">E</text>
      </svg>
    `
    const png = await sharp(Buffer.from(svg))
      .png()
      .toBuffer()
    await writeFile(join(iconsDir, `icon-${size}.png`), png)
    console.log(`Created icon-${size}.png`)
  }
}

generateIcons().catch(console.error)

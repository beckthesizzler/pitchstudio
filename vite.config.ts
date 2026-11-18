import { defineConfig } from 'vite'
import path from 'path'
import fs from 'fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

/* The link picture. Make keeps an attached picture under src/imports with its own file name; this copies
   src/imports/og-image.png to /og-image.png in the build, a fixed address that Site settings
   (.figma/make/site.json, openGraph.image) point og:image at. Skipped quietly if the picture isn't there. */
function linkPicture() {
  const file = path.resolve(__dirname, 'src/imports/og-image.png')
  return {
    name: 'pitchstudio-link-picture',
    generateBundle(this: { emitFile: (f: { type: 'asset'; fileName: string; source: Uint8Array }) => string }) {
      if (fs.existsSync(file)) this.emitFile({ type: 'asset', fileName: 'og-image.png', source: fs.readFileSync(file) })
    },
  }
}

export default defineConfig({
  plugins: [
    linkPicture(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})

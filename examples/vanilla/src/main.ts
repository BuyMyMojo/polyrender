import { PolyRender } from '@polyrender/core'

const viewerEl = document.getElementById('viewer')!
const fileInput = document.getElementById('file-input') as HTMLInputElement

let viewer: PolyRender | null = null

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (!file) return

  // Destroy previous viewer if one exists
  if (viewer) {
    viewer.destroy()
    viewer = null
  }

  // Create a new PolyRender instance with the selected file
  viewer = new PolyRender(viewerEl, {
    source: {
      type: 'file',
      data: file,
      filename: file.name,
    },
    theme: 'dark',
    toolbar: true,
    pdf: {
      // In the bundled output, the worker is a sibling file in dist/
      workerSrc: './pdf.worker.min.mjs',
    },
    onReady: (info) => {
      console.log(`Loaded "${file.name}" — ${info.pageCount} page(s), format: ${info.format}`)
    },
    onError: (err) => {
      console.error('PolyRender error:', err)
    },
  })
})

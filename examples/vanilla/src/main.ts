import { DocView } from '@docview/core'

const viewerEl = document.getElementById('viewer')!
const fileInput = document.getElementById('file-input') as HTMLInputElement

let viewer: DocView | null = null

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (!file) return

  // Destroy previous viewer if one exists
  if (viewer) {
    viewer.destroy()
    viewer = null
  }

  // Create a new DocView instance with the selected file
  viewer = new DocView(viewerEl, {
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
      console.error('DocView error:', err)
    },
  })
})

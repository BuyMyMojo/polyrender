import { PolyRender } from '@polyrender/core'
import '../../../packages/core/src/styles.css'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

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
      workerSrc: pdfjsWorker,
    },
    onReady: (info) => {
      console.log(`Loaded "${file.name}" — ${info.pageCount} page(s), format: ${info.format}`)
    },
    onError: (err) => {
      console.error('PolyRender error:', err)
    },
  })
})

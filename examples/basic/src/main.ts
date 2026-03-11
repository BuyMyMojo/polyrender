import { DocView } from '@docview/core'
import '../../../packages/core/src/styles.css'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

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
      workerSrc: pdfjsWorker,
    },
    onReady: (info) => {
      console.log(`Loaded "${file.name}" — ${info.pageCount} page(s), format: ${info.format}`)
    },
    onError: (err) => {
      console.error('DocView error:', err)
    },
  })
})

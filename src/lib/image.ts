'use client'

interface CompressOptions {
  maxDimension?: number
  quality?: number
  mimeType?: string
}

/**
 * Resize + compress an image File in the browser.
 * Returns a new File that's roughly 5-10× smaller than the iPhone original,
 * while preserving plenty of detail for documenting repair work.
 */
export async function compressImage(
  file: File,
  { maxDimension = 1600, quality = 0.82, mimeType = 'image/jpeg' }: CompressOptions = {}
): Promise<File> {
  if (typeof window === 'undefined') return file
  if (!file.type.startsWith('image/')) return file
  // Animated formats — leave as-is
  if (file.type === 'image/gif') return file

  const dataUrl = await readAsDataURL(file)
  const img = await loadImage(dataUrl)

  const { width, height } = fitInside(img.naturalWidth, img.naturalHeight, maxDimension)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(img, 0, 0, width, height)

  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, mimeType, quality)
  )
  if (!blob) return file
  // If compression actually made it larger — keep the original
  if (blob.size >= file.size) return file

  const nameNoExt = file.name.replace(/\.[^.]+$/, '')
  const ext = mimeType === 'image/jpeg' ? 'jpg' : (mimeType.split('/')[1] || 'jpg')
  return new File([blob], `${nameNoExt}.${ext}`, { type: mimeType, lastModified: Date.now() })
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function fitInside(width: number, height: number, max: number) {
  if (width <= max && height <= max) return { width, height }
  const scale = width > height ? max / width : max / height
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  }
}

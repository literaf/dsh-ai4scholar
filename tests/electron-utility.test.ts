import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const LIB_ENTRY = new URL('../lib/index.js', import.meta.url)
const PDF_ENTRY = new URL('../lib/pdf.js', import.meta.url)

function makeSinglePagePdf(text: string): Uint8Array {
  const stream = `BT /F1 12 Tf 72 100 Td (${text}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (const [index, body] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}

describe.skipIf(!existsSync(LIB_ENTRY) || !existsSync(PDF_ENTRY))('Electron utility process compatibility', () => {
  it('imports the plugin and extracts a real PDF without browser DOM globals', async () => {
    const data = Buffer.from(makeSinglePagePdf('Electron utility PDF')).toString('base64')
    const script = `
      Object.defineProperty(process.versions, 'electron', { value: '43.3.0', configurable: true })
      Object.defineProperty(process, 'type', { value: 'utility', configurable: true })
      delete globalThis.DOMMatrix
      delete globalThis.ImageData
      delete globalThis.Path2D
      const plugin = await import(${JSON.stringify(LIB_ENTRY.href)})
      if (typeof plugin.apply !== 'function') throw new Error('plugin apply export missing')
      const { extractPdfText } = await import(${JSON.stringify(PDF_ENTRY.href)})
      const result = await extractPdfText(Buffer.from(${JSON.stringify(data)}, 'base64'))
      process.stdout.write(JSON.stringify(result))
    `
    const { stdout, stderr } = await execFileAsync(process.execPath, ['--input-type=module', '--eval', script], {
      timeout: 30_000,
    })
    expect(stderr).toBe('')
    expect(JSON.parse(stdout)).toMatchObject({ pages: 1 })
    expect(JSON.parse(stdout).text).toContain('Electron utility PDF')
  }, 35_000)
})

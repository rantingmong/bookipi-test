import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('./out', import.meta.url)))
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webp', 'image/webp'],
])

const server = createServer(async (request, response) => {
  const requestPath = new URL(request.url ?? '/', 'http://localhost').pathname
  const normalizedPath = requestPath.replace(/^\/+/, '')
  let target = resolve(root, normalizedPath)
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    response.writeHead(403)
    response.end()
    return
  }

  try {
    const targetStat = await stat(target)
    if (targetStat.isDirectory()) target = resolve(target, 'index.html')
  } catch {
    target = resolve(root, `${normalizedPath}.html`)
  }

  try {
    const body = await readFile(target)
    const type = contentTypes.get(extname(target))
    if (type) response.setHeader('Content-Type', type)
    response.setHeader('Cache-Control', 'no-store')
    response.writeHead(200)
    response.end(body)
  } catch {
    const body = await readFile(resolve(root, 'index.html'))
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    response.writeHead(200)
    response.end(body)
  }
})

const port = Number(process.env.PORT)
server.listen(port, '0.0.0.0', () => {
  process.stdout.write(`Storefront listening on port ${port}\n`)
})

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { dirname, relative, resolve, sep } from 'node:path'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import YAML from 'yaml'

const execFileAsync = promisify(execFile)
const root = resolve(import.meta.dirname, '..')
const apiRoot = resolve(root, 'packages/backend/src/api')
const generatedRoot = resolve(apiRoot, '.generated')
const parseYaml = async (path) => YAML.parse(await readFile(path, 'utf8'))

async function resolveList(ownerPath, key) {
  const owner = await parseYaml(ownerPath)
  const list = owner[key]
  if (!Array.isArray(list)) throw new Error(`${ownerPath} must define ${key} as a list`)
  return list.map((item) => resolve(dirname(ownerPath), item))
}

async function generateGroup(groupConfigPath) {
  const groupName = groupConfigPath.split(sep).at(-2)
  const endpointConfigs = await resolveList(groupConfigPath, 'x-endpoints')
  const operations = []
  const seenOperations = new Set()
  for (const endpointPath of endpointConfigs) {
    const endpoint = await parseYaml(endpointPath)
    for (const [route, methods] of Object.entries(endpoint.paths ?? {})) {
      for (const [method, operation] of Object.entries(methods)) {
        const key = `${method.toUpperCase()} ${route}`
        if (seenOperations.has(key)) throw new Error(`Duplicate API operation: ${key}`)
        seenOperations.add(key)
        operations.push({ operationId: operation.operationId, endpointPath, route, method })
      }
    }
  }
  const generatedDirectory = resolve(dirname(groupConfigPath), 'generated')
  await rm(generatedDirectory, { recursive: true, force: true })
  const bundlePath = resolve(generatedRoot, `${groupName}.openapi.yaml`)
  await mkdir(generatedRoot, { recursive: true })
  await execFileAsync('pnpm', ['exec', 'redocly', 'bundle', groupConfigPath, '--output', bundlePath, '--ext', 'yaml'])

  const generatorConfig = resolve(generatedRoot, `${groupName}.server.config.json`)
  const zodConfig = resolve(generatedRoot, `${groupName}.zod.config.json`)
  await writeFile(zodConfig, JSON.stringify({
    input_openapi: bundlePath,
    output: generatedDirectory,
    input_schema: resolve(generatedDirectory, 'schemas.ts'),
  }, null, 2))
  await writeFile(generatorConfig, JSON.stringify({
    input_openapi: bundlePath,
    output: generatedDirectory,
    framework: 'express',
    input_schema: resolve(generatedDirectory, 'schemas.ts'),
  }, null, 2))
  await execFileAsync('pnpm', ['exec', 'openapi-zod-ts', '--config', zodConfig])
  await execFileAsync('pnpm', ['exec', 'openapi-server', '--config', relative(root, generatorConfig)])

  const bindings = operations.map(({ operationId, endpointPath }) => {
    if (!operationId) throw new Error(`${endpointPath} operation is missing operationId`)
    const handlerPath = relative(dirname(groupConfigPath), resolve(dirname(endpointPath), 'handler.ts')).replaceAll(sep, '/')
    const importPath = `../${handlerPath.replace(/\.ts$/, '.js')}`
    return { operationId, importPath }
  })
  const imports = bindings.map(({ operationId, importPath }, index) => `import { ${operationId} as handler${index} } from '${importPath}'`).join('\n')
  const entries = bindings.map(({ operationId }, index) => `  ${operationId}: handler${index},`).join('\n')
  await writeFile(resolve(generatedDirectory, 'handlers.ts'), `${imports}\n\nexport const ${groupName}Handlers = {\n${entries}\n}\n`)
}

await rm(generatedRoot, { recursive: true, force: true })
await mkdir(generatedRoot, { recursive: true })
const rootGroups = await resolveList(resolve(apiRoot, 'openapi.yml'), 'x-groups')
for (const groupConfig of rootGroups) await generateGroup(groupConfig)

const rootSpecPath = resolve(apiRoot, 'openapi.yml')
await execFileAsync('pnpm', ['exec', 'redocly', 'bundle', rootSpecPath, '--output', resolve(generatedRoot, 'api.openapi.yaml'), '--ext', 'yaml'])
const storefrontGenerated = resolve(root, 'packages/storefront/src/lib/api/generated')
await mkdir(storefrontGenerated, { recursive: true })
const storefrontConfig = resolve(generatedRoot, 'storefront.zod.config.json')
await writeFile(storefrontConfig, JSON.stringify({
  input_openapi: resolve(generatedRoot, 'api.openapi.yaml'),
  output: storefrontGenerated,
  input_schema: resolve(storefrontGenerated, 'schemas.ts'),
}, null, 2))
await execFileAsync('pnpm', ['exec', 'openapi-zod-ts', '--config', storefrontConfig])

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const execFileAsync = promisify(execFile)
const root = resolve(import.meta.dirname, '..')
const output = resolve(root, '.artifacts/lambdas')
const packages = ['@bookipi/checkout-processor']

await mkdir(output, { recursive: true })

for (const packageName of packages) {
  const slug = packageName.slice('@bookipi/'.length)
  const staged = resolve(output, slug)
  const archive = resolve(output, `${slug}.zip`)
  await rm(staged, { recursive: true, force: true })
  await rm(archive, { force: true })
  await execFileAsync('pnpm', ['--filter', packageName, 'build'], { cwd: root })
  await execFileAsync(
    'pnpm',
    [
      '--config.inject-workspace-packages=true',
      '--filter',
      packageName,
      'deploy',
      '--prod',
      '--no-optional',
      staged,
    ],
    { cwd: root },
  )
  await execFileAsync('zip', ['-qyr', archive, '.'], { cwd: staged })
  process.stdout.write(`Packaged ${packageName} Lambda artifact.\n`)
}

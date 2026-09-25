import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const child = spawn('docker', ['compose', '-f', 'infra/compose.yml', 'down'], {
  cwd: root,
  env: {
    ...process.env,
    LOCALSTACK_AUTH_TOKEN: 'dummy',
    BETTER_AUTH_SECRET: 'dummy',
  },
  stdio: 'inherit',
})

child.on('error', (error) => {
  process.stderr.write(`Unable to stop the local stack: ${error.message}\n`)
  process.exitCode = 1
})

child.on('close', (code) => {
  if (code !== 0) process.exitCode = code || 1
})

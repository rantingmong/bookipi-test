import { defineConfig } from '@playwright/test'

if (!process.env.NEXT_PUBLIC_API_BASE_URL) {
  process.env.NEXT_PUBLIC_API_BASE_URL = 'http://127.0.0.1:3001'
}
if (!process.env.NEXT_PUBLIC_LISTING_ID) {
  process.env.NEXT_PUBLIC_LISTING_ID = 'sale-1'
}
if (!process.env.NEXT_PUBLIC_CHECKOUT_URL) {
  process.env.NEXT_PUBLIC_CHECKOUT_URL = 'http://127.0.0.1:3200/api/checkout'
}

const launchOptions = {}
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
  Object.assign(launchOptions, {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  })
}

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    browserName: 'chromium',
    launchOptions,
  },
  webServer: {
    command: 'pnpm dev --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: !process.env.CI,
  },
})

import { expect, test } from '@playwright/test'

test('shows mock outcome controls for an owned pending order', async ({
  page,
}) => {
  const storefrontOrigin = 'http://127.0.0.1:3100'

  await page.route('http://127.0.0.1:3001/api/auth/**', async (route) => {
    await fulfillSession(route, storefrontOrigin)
  })
  await page.route(
    'http://127.0.0.1:3001/api/orders/order-1',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: credentialedCorsHeaders(storefrontOrigin),
        body: JSON.stringify({
          orderId: 'order-1',
          customerId: 'customer-1',
          listingId: 'sale-1',
          slotId: 'sale-1:slot:0001',
          status: 'PENDING',
          createdAt: '2026-09-24T00:00:00.000Z',
          updatedAt: '2026-09-24T00:00:00.000Z',
        }),
      })
    },
  )

  await page.goto('/payment?orderId=order-1')

  await expect(
    page.getByRole('button', { name: 'Payment succeeded' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Payment failed' }),
  ).toBeVisible()
})

test('shows the shared order status page after mock success', async ({
  page,
}) => {
  const storefrontOrigin = 'http://127.0.0.1:3100'
  let paymentComplete = false

  await page.route('http://127.0.0.1:3001/api/auth/**', async (route) => {
    await fulfillSession(route, storefrontOrigin)
  })
  await page.route(
    'http://127.0.0.1:3001/api/orders/order-success**',
    async (route) => {
      const headers = credentialedCorsHeaders(storefrontOrigin)
      if (route.request().method() === 'POST') {
        paymentComplete = true
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers,
          body: JSON.stringify({
            orderId: 'order-success',
            customerId: 'customer-1',
            listingId: 'sale-1',
            slotId: 'sale-1:slot:0001',
            status: 'COMPLETE',
            createdAt: '2026-09-24T00:00:00.000Z',
            updatedAt: '2026-09-24T00:00:01.000Z',
          }),
        })
        return
      }
      let status = 'PENDING'
      if (paymentComplete) status = 'COMPLETE'
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers,
        body: JSON.stringify({
          orderId: 'order-success',
          customerId: 'customer-1',
          listingId: 'sale-1',
          slotId: 'sale-1:slot:0001',
          status,
          createdAt: '2026-09-24T00:00:00.000Z',
          updatedAt: '2026-09-24T00:00:01.000Z',
        }),
      })
    },
  )

  await page.goto('/payment?orderId=order-success')
  await page.getByRole('button', { name: 'Payment succeeded' }).click()
  await expect(page).toHaveURL(/\/order-status\?orderId=order-success$/)
  await expect(page.getByText('Payment complete.')).toBeVisible()
})

test('shows the shared order status page after mock failure', async ({
  page,
}) => {
  const storefrontOrigin = 'http://127.0.0.1:3100'
  let paymentCancelled = false

  await page.route('http://127.0.0.1:3001/api/auth/**', async (route) => {
    await fulfillSession(route, storefrontOrigin)
  })
  await page.route(
    'http://127.0.0.1:3001/api/orders/order-failure**',
    async (route) => {
      const headers = credentialedCorsHeaders(storefrontOrigin)
      if (route.request().method() === 'POST') {
        paymentCancelled = true
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers,
          body: JSON.stringify({
            orderId: 'order-failure',
            customerId: 'customer-1',
            listingId: 'sale-1',
            slotId: 'sale-1:slot:0001',
            status: 'CANCELLED',
            createdAt: '2026-09-24T00:00:00.000Z',
            updatedAt: '2026-09-24T00:00:01.000Z',
          }),
        })
        return
      }
      let status = 'PENDING'
      if (paymentCancelled) status = 'CANCELLED'
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers,
        body: JSON.stringify({
          orderId: 'order-failure',
          customerId: 'customer-1',
          listingId: 'sale-1',
          slotId: 'sale-1:slot:0001',
          status,
          createdAt: '2026-09-24T00:00:00.000Z',
          updatedAt: '2026-09-24T00:00:01.000Z',
        }),
      })
    },
  )

  await page.goto('/payment?orderId=order-failure')
  await page.getByRole('button', { name: 'Payment failed' }).click()
  await expect(page).toHaveURL(/\/order-status\?orderId=order-failure$/)
  await expect(page.getByText('Payment cancelled.')).toBeVisible()
})

test('keeps the mock payment page when the outcome request fails', async ({
  page,
}) => {
  const storefrontOrigin = 'http://127.0.0.1:3100'

  await page.route('http://127.0.0.1:3001/api/auth/**', async (route) => {
    await fulfillSession(route, storefrontOrigin)
  })
  await page.route(
    'http://127.0.0.1:3001/api/orders/order-error**',
    async (route) => {
      const headers = credentialedCorsHeaders(storefrontOrigin)
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          headers,
          body: JSON.stringify({ error: 'Unavailable' }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers,
        body: JSON.stringify({
          orderId: 'order-error',
          customerId: 'customer-1',
          listingId: 'sale-1',
          slotId: 'sale-1:slot:0001',
          status: 'PENDING',
          createdAt: '2026-09-24T00:00:00.000Z',
          updatedAt: '2026-09-24T00:00:00.000Z',
        }),
      })
    },
  )

  await page.goto('/payment?orderId=order-error')
  await page.getByRole('button', { name: 'Payment succeeded' }).click()
  await expect(page).toHaveURL(/\/payment\?orderId=order-error$/)
  await expect(
    page.getByText('The payment result request failed. Try again.'),
  ).toHaveCount(1)
})

test('shows listing counts and clears the customer order after home sign-out', async ({
  page,
}) => {
  const storefrontOrigin = 'http://127.0.0.1:3100'
  let signedOut = false

  await page.route('http://127.0.0.1:3001/api/auth/**', async (route) => {
    if (route.request().url().endsWith('/sign-out')) {
      signedOut = true
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: credentialedCorsHeaders(storefrontOrigin),
        body: JSON.stringify({ success: true }),
      })
      return
    }
    if (signedOut) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: credentialedCorsHeaders(storefrontOrigin),
        body: JSON.stringify({ session: null, user: null }),
      })
      return
    }
    await fulfillSession(route, storefrontOrigin)
  })
  await page.route('http://127.0.0.1:3001/api/listings/**', async (route) => {
    const saleTimes = saleTimesFor('open')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: credentialedCorsHeaders(storefrontOrigin),
      body: JSON.stringify({
        listingId: 'sale-1',
        productName: 'Bookipi Pro',
        saleStartsAt: saleTimes.saleStartsAt,
        saleEndsAt: saleTimes.saleEndsAt,
        stockTotal: 10,
        reserveSlots: 2,
        publicStock: 8,
        boughtUnits: 4,
        remainingUnits: 3,
      }),
    })
  })
  await page.route(
    'http://127.0.0.1:3001/api/orders/current?listingId=sale-1',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: credentialedCorsHeaders(storefrontOrigin),
        body: JSON.stringify({
          orderId: 'order-1',
          customerId: 'customer-1',
          listingId: 'sale-1',
          slotId: 'sale-1:slot:0001',
          status: 'PENDING',
          createdAt: '2026-09-24T00:00:00.000Z',
          updatedAt: '2026-09-24T00:00:00.000Z',
        }),
      })
    },
  )

  await page.goto('/')
  const sale = page.getByRole('region', { name: 'Sale' })
  await expect(sale.getByText('Units available: 3')).toBeVisible()
  await expect(sale.getByText('Units bought: 4')).toBeVisible()
  await expect(sale.getByText(/Total units/)).toBeHidden()
  await expect(sale.getByText(/Reserved units/)).toBeHidden()
  await expect(
    page.getByText('You have already ordered this sale.'),
  ).toBeVisible()
  await expect(page.getByText('Order order-1 (PENDING).')).toBeVisible()
  await expect(page.getByRole('link', { name: 'View order' })).toHaveAttribute(
    'href',
    '/payment?orderId=order-1',
  )
  await expect(
    page.getByRole('button', { name: 'Buy one unit' }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByText('You are not signed in.')).toBeVisible()
  await expect(
    page.getByText('You have already ordered this sale.'),
  ).toBeHidden()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeHidden()
})

for (const saleWindow of ['upcoming', 'ended'] as const) {
  test(`disables checkout when the sale is ${saleWindow}`, async ({ page }) => {
    const storefrontOrigin = 'http://127.0.0.1:3100'

    await installSessionAndListingRoutes(
      page,
      storefrontOrigin,
      undefined,
      saleWindow,
    )

    await page.goto('/')
    const sale = page.getByRole('region', { name: 'Sale' })
    let expectedMessage = 'The sale has not started.'
    if (saleWindow === 'ended') expectedMessage = 'The sale has ended.'
    await expect(sale.getByText(expectedMessage)).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Buy one unit' }),
    ).toBeDisabled()
  })
}

test('links a completed customer order to its status page', async ({
  page,
}) => {
  const storefrontOrigin = 'http://127.0.0.1:3100'

  await installSessionAndListingRoutes(page, storefrontOrigin)
  await page.route(
    'http://127.0.0.1:3001/api/orders/current**',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: credentialedCorsHeaders(storefrontOrigin),
        body: JSON.stringify({
          orderId: 'order-complete',
          customerId: 'customer-1',
          listingId: 'sale-1',
          slotId: 'sale-1:slot:0001',
          status: 'COMPLETE',
          createdAt: '2026-09-24T00:00:00.000Z',
          updatedAt: '2026-09-24T00:00:00.000Z',
        }),
      })
    },
  )

  await page.goto('/')
  await expect(page.getByText('Order order-complete (COMPLETE).')).toBeVisible()
  await expect(page.getByRole('link', { name: 'View order' })).toHaveAttribute(
    'href',
    '/order-status?orderId=order-complete',
  )
  await expect(
    page.getByRole('button', { name: 'Buy one unit' }),
  ).toBeDisabled()
})

test('allows repurchase after a confirmed cancellation', async ({ page }) => {
  const storefrontOrigin = 'http://127.0.0.1:3100'
  const checkoutUrl = 'http://127.0.0.1:3200/api/checkout'
  let paymentCancelled = false

  await installSessionAndListingRoutes(page, storefrontOrigin)
  await page.route(
    'http://127.0.0.1:3001/api/orders/current**',
    async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        headers: credentialedCorsHeaders(storefrontOrigin),
        body: JSON.stringify({ error: 'Not found' }),
      })
    },
  )
  await page.route(
    'http://127.0.0.1:3001/api/orders/order-cancel**',
    async (route) => {
      const headers = credentialedCorsHeaders(storefrontOrigin)
      if (route.request().method() === 'POST') {
        paymentCancelled = true
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers,
          body: JSON.stringify({
            orderId: 'order-cancel',
            customerId: 'customer-1',
            listingId: 'sale-1',
            slotId: 'sale-1:slot:0001',
            status: 'CANCELLED',
            createdAt: '2026-09-24T00:00:00.000Z',
            updatedAt: '2026-09-24T00:00:01.000Z',
          }),
        })
        return
      }
      let status = 'PENDING'
      if (paymentCancelled) status = 'CANCELLED'
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers,
        body: JSON.stringify({
          orderId: 'order-cancel',
          customerId: 'customer-1',
          listingId: 'sale-1',
          slotId: 'sale-1:slot:0001',
          status,
          createdAt: '2026-09-24T00:00:00.000Z',
          updatedAt: '2026-09-24T00:00:01.000Z',
        }),
      })
    },
  )
  await page.route(checkoutUrl, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: credentialedCorsHeaders(storefrontOrigin),
      })
      return
    }
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      headers: credentialedCorsHeaders(storefrontOrigin),
      body: JSON.stringify({
        orderId: 'order-cancel',
        status: 'PENDING',
        redirectUrl: '/payment?orderId=order-cancel',
      }),
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Buy one unit' }).click()
  await page.getByRole('button', { name: 'Payment failed' }).click()
  await expect(page).toHaveURL(/\/order-status\?orderId=order-cancel$/)
  await expect(page.getByText('Payment cancelled.')).toBeVisible()
  await page.goBack()
  await page.goBack()
  await expect(page).toHaveURL('/')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Buy one unit' })).toBeEnabled()
})

test('retries direct checkout with the same key and opens the payment result', async ({
  page,
  context,
}) => {
  const storefrontOrigin = 'http://127.0.0.1:3100'
  const checkoutUrl = 'http://127.0.0.1:3200/api/checkout'
  const checkoutBodies: Array<Record<string, unknown>> = []
  const checkoutCookies: string[] = []
  let sessionReadCount = 0
  let postCount = 0
  let releaseRetry: (() => void) | undefined

  await context.addCookies([
    {
      name: 'checkout-session',
      value: 'session-cookie',
      url: 'http://127.0.0.1:3200',
      sameSite: 'Lax',
    },
  ])

  await page.route('http://127.0.0.1:3001/api/auth/**', async (route) => {
    sessionReadCount += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': storefrontOrigin,
        'access-control-allow-credentials': 'true',
      },
      body: JSON.stringify({
        session: { id: 'session-1', userId: 'customer-1' },
        user: {
          id: 'customer-1',
          name: 'Sam Customer',
          email: 'sam@example.test',
        },
      }),
    })
  })

  await page.route('http://127.0.0.1:3001/api/listings/**', async (route) => {
    const saleTimes = saleTimesFor('open')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': storefrontOrigin,
        'access-control-allow-credentials': 'true',
      },
      body: JSON.stringify({
        listingId: 'sale-1',
        productName: 'Bookipi Pro',
        saleStartsAt: saleTimes.saleStartsAt,
        saleEndsAt: saleTimes.saleEndsAt,
        stockTotal: 10,
        reserveSlots: 2,
        publicStock: 8,
        boughtUnits: 0,
        remainingUnits: 8,
      }),
    })
  })
  await page.route(
    'http://127.0.0.1:3001/api/orders/current?listingId=sale-1',
    async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        headers: credentialedCorsHeaders(storefrontOrigin),
        body: JSON.stringify({ error: 'Not found' }),
      })
    },
  )

  await page.route(checkoutUrl, async (route) => {
    const request = route.request()
    const headers = {
      'access-control-allow-origin': storefrontOrigin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    }
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers })
      return
    }
    checkoutBodies.push(request.postDataJSON() as Record<string, unknown>)
    checkoutCookies.push(request.headers().cookie ?? '')
    postCount += 1
    if (postCount === 1) {
      await route.abort('failed')
      return
    }
    await new Promise<void>((resolve) => {
      releaseRetry = resolve
    })
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      headers,
      body: JSON.stringify({
        orderId: 'order-1',
        status: 'PENDING',
        redirectUrl: '/payment?orderId=order-1',
      }),
    })
  })

  await page.goto('/')
  await expect(page.getByText('Bookipi Pro')).toBeVisible()
  await expect(page.getByText('Signed in as Sam Customer')).toBeVisible()
  await page.getByRole('button', { name: 'Buy one unit' }).click()
  await expect(
    page.getByRole('region', { name: 'Purchase' }).getByRole('alert'),
  ).toContainText('Retry this request')
  await page.getByRole('button', { name: 'Buy one unit' }).click()
  const purchase = page.getByRole('region', { name: 'Purchase' })
  await expect(purchase.getByRole('button')).toContainText('Sending request…')
  await expect(purchase.getByRole('button')).toBeDisabled()
  await expect(purchase.getByText(/Retry this request/)).toBeHidden()
  await expect.poll(() => releaseRetry !== undefined).toBe(true)
  releaseRetry?.()
  await expect(page).toHaveURL(/\/payment\?orderId=order-1$/)

  expect(checkoutBodies).toHaveLength(2)
  expect(checkoutBodies[0]).toEqual({
    listingId: 'sale-1',
    idempotencyKey: expect.any(String),
  })
  expect(checkoutBodies[1]).toEqual(checkoutBodies[0])
  expect(checkoutBodies[0]).not.toHaveProperty('customerId')
  expect(checkoutCookies).toEqual([
    'checkout-session=session-cookie',
    'checkout-session=session-cookie',
  ])
  expect(sessionReadCount).toBeGreaterThanOrEqual(2)
})

test('shows sign-in guidance for an explicit unauthenticated checkout response', async ({
  page,
  context,
}) => {
  const storefrontOrigin = 'http://127.0.0.1:3100'
  const checkoutUrl = 'http://127.0.0.1:3200/api/checkout'

  await context.addCookies([
    {
      name: 'checkout-session',
      value: 'session-cookie',
      url: 'http://127.0.0.1:3200',
      sameSite: 'Lax',
    },
  ])

  await installSessionAndListingRoutes(page, storefrontOrigin)
  await page.route(checkoutUrl, async (route) => {
    const headers = credentialedCorsHeaders(storefrontOrigin)
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers })
      return
    }
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      headers,
      body: JSON.stringify({ error: 'UNAUTHENTICATED' }),
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Buy one unit' }).click()
  const purchase = page.getByRole('region', { name: 'Purchase' })
  await expect(purchase.getByRole('alert')).toContainText('Your session ended')
  await expect(
    purchase.getByRole('link', { name: 'Sign in and try again.' }),
  ).toHaveAttribute('href', '/login')
})

test('rechecks an expired session after a generic readable 403 error', async ({
  page,
  context,
}) => {
  const storefrontOrigin = 'http://127.0.0.1:3100'
  const checkoutUrl = 'http://127.0.0.1:3200/api/checkout'
  let sessionReadCount = 0

  await context.addCookies([
    {
      name: 'checkout-session',
      value: 'expired-session-cookie',
      url: 'http://127.0.0.1:3200',
      sameSite: 'Lax',
    },
  ])

  await installSessionAndListingRoutes(
    page,
    storefrontOrigin,
    async (route) => {
      sessionReadCount += 1
      if (sessionReadCount === 1) {
        await fulfillSession(route, storefrontOrigin)
        return
      }
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        headers: credentialedCorsHeaders(storefrontOrigin),
        body: JSON.stringify({ message: 'Unauthorized' }),
      })
    },
  )
  await page.route(checkoutUrl, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: credentialedCorsHeaders(storefrontOrigin),
      })
      return
    }
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      headers: credentialedCorsHeaders(storefrontOrigin),
      body: JSON.stringify({ error: 'Forbidden' }),
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Buy one unit' }).click()
  const purchase = page.getByRole('region', { name: 'Purchase' })
  await expect(purchase.getByRole('alert')).toContainText('Your session ended')
  await expect(
    purchase.getByRole('link', { name: 'Sign in and try again.' }),
  ).toBeVisible()
  expect(sessionReadCount).toBeGreaterThanOrEqual(2)
})

test('keeps a readable API Gateway denial retryable for an active session', async ({
  page,
  context,
}) => {
  const storefrontOrigin = 'http://127.0.0.1:3100'
  const checkoutUrl = 'http://127.0.0.1:3200/api/checkout'
  const checkoutBodies: Array<Record<string, unknown>> = []
  let postCount = 0
  let sessionReadCount = 0

  await context.addCookies([
    {
      name: 'checkout-session',
      value: 'active-session-cookie',
      url: 'http://127.0.0.1:3200',
      sameSite: 'Lax',
    },
  ])

  await installSessionAndListingRoutes(
    page,
    storefrontOrigin,
    async (route) => {
      sessionReadCount += 1
      await fulfillSession(route, storefrontOrigin)
    },
  )
  await page.route(checkoutUrl, async (route) => {
    const headers = credentialedCorsHeaders(storefrontOrigin)
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers })
      return
    }
    checkoutBodies.push(
      route.request().postDataJSON() as Record<string, unknown>,
    )
    postCount += 1
    if (postCount === 1) {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        headers,
        body: JSON.stringify({
          message:
            'User is not authorized to access this resource with an explicit deny',
        }),
      })
      return
    }
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      headers,
      body: JSON.stringify({
        orderId: 'order-2',
        status: 'PENDING',
        redirectUrl: '/payment?orderId=order-2',
      }),
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Buy one unit' }).click()
  const purchase = page.getByRole('region', { name: 'Purchase' })
  await expect(purchase.getByRole('alert')).toContainText('Retry this request')
  await expect(purchase.getByRole('alert')).not.toContainText(
    'Your session ended',
  )
  await page.getByRole('button', { name: 'Buy one unit' }).click()
  await expect(page).toHaveURL(/\/payment\?orderId=order-2$/)

  expect(sessionReadCount).toBeGreaterThanOrEqual(2)
  expect(checkoutBodies).toHaveLength(2)
  expect(checkoutBodies[1]).toEqual(checkoutBodies[0])
})

function credentialedCorsHeaders(origin: string) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
  }
}

async function fulfillSession(
  route: import('@playwright/test').Route,
  origin: string,
) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: credentialedCorsHeaders(origin),
    body: JSON.stringify({
      session: { id: 'session-1', userId: 'customer-1' },
      user: {
        id: 'customer-1',
        name: 'Sam Customer',
        email: 'sam@example.test',
      },
    }),
  })
}

async function installSessionAndListingRoutes(
  page: import('@playwright/test').Page,
  origin: string,
  sessionHandler?: (route: import('@playwright/test').Route) => Promise<void>,
  saleWindow: 'upcoming' | 'open' | 'ended' = 'open',
) {
  await page.route('http://127.0.0.1:3001/api/auth/**', async (route) => {
    if (sessionHandler) {
      await sessionHandler(route)
      return
    }
    await fulfillSession(route, origin)
  })
  await page.route('http://127.0.0.1:3001/api/listings/**', async (route) => {
    const saleTimes = saleTimesFor(saleWindow)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: credentialedCorsHeaders(origin),
      body: JSON.stringify({
        listingId: 'sale-1',
        productName: 'Bookipi Pro',
        saleStartsAt: saleTimes.saleStartsAt,
        saleEndsAt: saleTimes.saleEndsAt,
        stockTotal: 10,
        reserveSlots: 2,
        publicStock: 8,
        boughtUnits: 0,
        remainingUnits: 8,
      }),
    })
  })
  await page.route(
    'http://127.0.0.1:3001/api/orders/current**',
    async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        headers: credentialedCorsHeaders(origin),
        body: JSON.stringify({ error: 'Not found' }),
      })
    },
  )
}

function saleTimesFor(saleWindow: 'upcoming' | 'open' | 'ended') {
  const now = Date.now()
  if (saleWindow === 'upcoming') {
    return {
      saleStartsAt: new Date(now + 60_000).toISOString(),
      saleEndsAt: new Date(now + 3_600_000).toISOString(),
    }
  }
  if (saleWindow === 'ended') {
    return {
      saleStartsAt: new Date(now - 3_600_000).toISOString(),
      saleEndsAt: new Date(now - 60_000).toISOString(),
    }
  }
  return {
    saleStartsAt: new Date(now - 60_000).toISOString(),
    saleEndsAt: new Date(now + 3_600_000).toISOString(),
  }
}

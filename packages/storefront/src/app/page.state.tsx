'use client'

import {
  authClient,
  revalidateCurrentSession,
  signOut,
} from '@/lib/features/auth.client'
import { classifyCheckoutFailure } from '@/lib/features/checkout-failure'
import {
  CheckoutRequestError,
  submitCheckout,
} from '@/lib/features/checkout.client'
import { readListingStatus } from '@/lib/features/listing.client'
import { readCurrentOrder } from '@/lib/features/order.client'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import useSWRMutation from 'swr/mutation'

export function usePageState() {
  const [clockNow, setClockNow] = useState<number | null>(null)
  const router = useRouter()
  const session = authClient.useSession()
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL
  const listingId = process.env.NEXT_PUBLIC_LISTING_ID
  const checkoutUrl = process.env.NEXT_PUBLIC_CHECKOUT_URL
  const attemptKey = useRef<string | null>(null)
  let listingKey: string | null = null
  if (apiBaseUrl && listingId) {
    listingKey = `listing:${apiBaseUrl}:${listingId}`
  }
  const listing = useSWR(
    listingKey,
    () => readListingStatus(apiBaseUrl as string, listingId as string),
    { revalidateOnFocus: false },
  )
  useEffect(() => {
    setClockNow(Date.now())
    const clockInterval = window.setInterval(() => {
      setClockNow(Date.now())
    }, 1000)
    return () => window.clearInterval(clockInterval)
  }, [])
  const customerId = session.data?.user.id
  let customerOrderKey: string[] | null = null
  if (apiBaseUrl && listingId && customerId) {
    customerOrderKey = ['listing-order', apiBaseUrl, listingId, customerId]
  }
  const customerOrder = useSWR(
    customerOrderKey,
    () => readCurrentOrder(apiBaseUrl as string, listingId as string),
    { revalidateOnFocus: false },
  )

  const signOutMutation = useSWRMutation(
    'home-auth-sign-out',
    async () => {
      let result
      try {
        result = await signOut()
      } catch {
        throw new Error('The sign-out request failed.')
      }
      if (result.error) {
        if (result.error.message) throw new Error(result.error.message)
        throw new Error('The sign-out request failed.')
      }
      await customerOrder.mutate(undefined, { revalidate: false })
      await session.refetch()
      return true
    },
    { throwOnError: false },
  )
  const checkout = useSWRMutation(
    'checkout',
    async (
      _key,
      {
        arg,
      }: {
        arg: { listingId: string; checkoutUrl: string; idempotencyKey: string }
      },
    ) => {
      try {
        return await submitCheckout(
          arg.checkoutUrl,
          arg.listingId,
          arg.idempotencyKey,
        )
      } catch (error) {
        throw await classifyCheckoutFailure(error, revalidateCurrentSession)
      }
    },
    { throwOnError: false },
  )

  const sessionState = (() => {
    let state = 'loading'
    if (session.error) state = 'error'
    if (!session.isPending && session.data) state = 'authenticated'
    if (!session.isPending && !session.data && !session.error) {
      state = 'anonymous'
    }
    return state
  })()

  const configurationMessage = (() => {
    let message = ''
    if (!apiBaseUrl) {
      message = 'Set NEXT_PUBLIC_API_BASE_URL to read the sale.'
    }
    if (!listingId) {
      message = 'Set NEXT_PUBLIC_LISTING_ID to select the sale.'
    }
    return message
  })()
  const listingState = (() => {
    let state = 'loading'
    if (!apiBaseUrl) state = 'configuration-error'
    if (!listingId) state = 'configuration-error'
    if (listing.error) state = 'error'
    if (listing.data) state = 'ready'
    return state
  })()
  const listingErrorMessage = (() => {
    if (listing.error) return 'The sale status request failed.'
    return ''
  })()
  const saleWindowState = (() => {
    if (!listing.data || clockNow === null) return 'checking'
    const saleStartsAt = Date.parse(listing.data.saleStartsAt)
    const saleEndsAt = Date.parse(listing.data.saleEndsAt)
    if (!Number.isFinite(saleStartsAt) || !Number.isFinite(saleEndsAt)) {
      return 'checking'
    }
    if (clockNow < saleStartsAt) return 'upcoming'
    if (clockNow >= saleEndsAt) return 'ended'
    return 'open'
  })()
  const signOutError = (() => {
    if (signOutMutation.error) return signOutMutation.error.message
    return ''
  })()
  const signOutState = (() => {
    if (signOutMutation.isMutating) return 'pending'
    return 'idle'
  })()
  const customerOrderState = (() => {
    let state = 'none'
    if (customerId && customerOrderKey && customerOrder.isLoading) {
      state = 'loading'
    }
    if (customerOrder.data) state = 'ordered'
    if (customerOrder.error) state = 'error'
    return state
  })()
  const canPurchaseForCustomerOrder = Boolean(
    customerOrderKey && !customerOrder.data && !checkout.data,
  )

  const purchaseState = (() => {
    let state = 'idle'
    if (checkout.data) state = 'accepted'
    if (checkout.error) {
      state = 'retryable'
      if (checkout.error instanceof CheckoutRequestError) {
        if (
          checkout.error.status === 401 ||
          checkout.error.code === 'UNAUTHENTICATED'
        ) {
          state = 'unauthenticated'
        } else if (checkout.error.code === 'SOLD_OUT') {
          state = 'sold-out'
        } else if (checkout.error.code !== 'CHECKOUT_RETRYABLE') {
          state = 'rejected'
        }
      }
    }
    if (checkout.isMutating) state = 'pending'
    return state
  })()

  const purchaseMessage = (() => {
    let message = ''
    if (purchaseState === 'accepted') {
      message = 'Checkout is accepted. Opening the payment page.'
    }
    if (purchaseState === 'retryable') {
      message =
        'Checkout did not finish. Retry this request to use the same purchase key.'
    }
    if (purchaseState === 'unauthenticated') {
      message = 'Your session ended. Sign in before you try again.'
    }
    if (purchaseState === 'sold-out') message = 'The sale is sold out.'
    if (purchaseState === 'rejected') {
      message = 'The sale cannot accept this purchase.'
      if (checkout.error instanceof CheckoutRequestError) {
        if (checkout.error.code === 'LISTING_UNPUBLISHED') {
          message = 'This sale is not available yet.'
        }
        if (checkout.error.code === 'SALE_CLOSED') {
          message = 'The sale is closed.'
        }
        if (checkout.error.code === 'ACTIVE_ORDER_EXISTS') {
          message = 'You already have an active order for this sale.'
        }
        if (checkout.error.code === 'RESERVATION_CANCELLED') {
          message =
            'This checkout attempt was cancelled. Reload the page to start a new attempt.'
        }
      }
    }
    if (purchaseState === 'pending') {
      message = 'Sending your purchase request…'
    }
    return message
  })()

  async function purchase() {
    if (
      !session.data ||
      !listingId ||
      !checkoutUrl ||
      checkout.isMutating ||
      saleWindowState !== 'open' ||
      !canPurchaseForCustomerOrder
    )
      return
    if (!attemptKey.current) attemptKey.current = crypto.randomUUID()
    try {
      const result = await checkout.trigger({
        listingId,
        checkoutUrl,
        idempotencyKey: attemptKey.current,
      })
      if (result) {
        router.push(result.redirectUrl)
      }
    } catch {
      // SWR exposes the request error in the page state.
    }
  }

  async function leaveSession() {
    await signOutMutation.trigger()
  }

  const customerOrderLink = (() => {
    if (customerOrder.data) {
      if (customerOrder.data.status === 'PENDING') {
        return `/payment?orderId=${encodeURIComponent(customerOrder.data.orderId)}`
      }
      return `/order-status?orderId=${encodeURIComponent(customerOrder.data.orderId)}`
    }
    return '/'
  })()

  const paymentRedirect = (() => {
    if (checkout.data) return checkout.data.redirectUrl
    return '/payment'
  })()

  return {
    configurationMessage,
    listing: listing.data,
    listingState,
    listingErrorMessage,
    saleWindowState,
    session,
    sessionState,
    customerOrder: customerOrder.data,
    customerOrderLink,
    customerOrderState,
    canPurchaseForCustomerOrder,
    leaveSession,
    signOutPending: signOutMutation.isMutating,
    signOutState,
    signOutError,
    checkoutConfigured: Boolean(checkoutUrl),
    purchase,
    purchasePending: checkout.isMutating,
    purchaseState,
    purchaseMessage,
    paymentRedirect,
  }
}

export type HomePageState = ReturnType<typeof usePageState>

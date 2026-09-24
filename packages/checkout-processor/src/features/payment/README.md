# Payment feature

The payment feature creates the mock payment redirect for a reserved order. It validates the order UUID and returns a relative storefront path. It does not call a provider, store session data, or make a network request.

Checkout starts the session only after SQS accepts the reservation event. A same-key retry can create the same redirect from the stored order ID.

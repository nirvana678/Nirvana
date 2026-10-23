# PayHero MPESA STK Push integration

This document records PayHero's MPESA STK Push and payment callback contract, and how Nirvana uses it. PayHero's live API host is `https://backend.payhero.co.ke/api/v2`.

## Setup

1. Create a PayHero account and register an MPESA payment channel.
2. In PayHero, create API credentials and copy the username and password. Find the numeric **Payment Channel ID** under **Payment Channels → My Payment Channels**. This is the ID Nirvana sends in `channel_id`; it is not a PayHero account ID.
3. Set these values in `backend/.env` and restart the backend:

   ```dotenv
   PAYHERO_API_USERNAME=your_api_username
   PAYHERO_API_PASSWORD=your_api_password
   PAYHERO_CHANNEL_ID=133
   PUBLIC_API_URL=https://api.example.com
   ```

   `PUBLIC_API_URL` is optional for local development. In production it must be the public HTTPS origin of the API, without a trailing slash; PayHero will call `{PUBLIC_API_URL}/api/payments/callback`.

4. Check `GET /api/payments/config` on the Nirvana API. It returns `{"onlineAvailable":true}` when credentials and a positive integer channel ID are present.

Keep PayHero credentials server-side. Never put them in frontend configuration, browser code, or source control. Use PayHero test credits/account where available before live collections.

## Initiate an STK Push

**POST** `https://backend.payhero.co.ke/api/v2/payments`

Headers:

```http
Authorization: Basic <base64(username:password)>
Content-Type: application/json
```

Required JSON fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `amount` | integer | Amount to collect, in KES (for example `100`) |
| `phone_number` | string | Customer's Kenyan mobile number (for example `0787677676`) |
| `channel_id` | integer | Registered PayHero payment channel ID |
| `provider` | string | Use `m-pesa` |

Optional JSON fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `external_reference` | string | Merchant reference used to match a payment to your records |
| `customer_name` | string | Customer's name |
| `callback_url` | string | HTTPS URL for PayHero's payment result callback |
| `credential_id` | string | Registered credential ID when using your own Daraja API keys |

Example:

```bash
curl -X POST 'https://backend.payhero.co.ke/api/v2/payments' \
  -H 'Authorization: Basic <base64(username:password)>' \
  -H 'Content-Type: application/json' \
  -d '{"amount":100,"phone_number":"0787677676","channel_id":133,"provider":"m-pesa","external_reference":"INV-009","customer_name":"John Doe","callback_url":"https://example.com/callback.php"}'
```

Successful request (`201 Created`):

```json
{
  "success": true,
  "status": "QUEUED",
  "reference": "E8UWT7CLUW",
  "CheckoutRequestID": "ws_CO_15012024164321519708344109"
}
```

`QUEUED` means the request was accepted for processing; it does not mean the customer paid. Wait for a result and verify it before marking an order or appointment paid.

## Payment callback

PayHero POSTs a JSON result to the `callback_url` supplied when initiating payment. The example callback is:

```json
{
  "forward_url": "",
  "response": {
    "Amount": 10,
    "CheckoutRequestID": "ws_CO_14012024103543427709099876",
    "ExternalReference": "INV-009",
    "MerchantRequestID": "3202-70921557-1",
    "MpesaReceiptNumber": "SAE3YULR0Y",
    "Phone": "+254709099876",
    "ResultCode": 0,
    "ResultDesc": "The service request is processed successfully.",
    "Status": "Success"
  },
  "status": true
}
```

Match `response.ExternalReference` to the reference sent in the request. `CheckoutRequestID` identifies the MPESA checkout request. Nirvana matches the callback against that reference, the expected amount, and the checkout request ID when available; it does not accept a browser claim as proof of payment.

Nirvana creates its own `NIRPAY-…` external reference for each attempt. Its public callback route is `POST /api/payments/callback`. The backend matches the callback's external reference, amount, and checkout request ID (when available) before accepting its final success or failure result. The client can also poll `GET /api/payments/:id/status` while the payment page remains open; that route reconciles against PayHero's transaction-status endpoint. See [PayHero's transaction status documentation](https://docs.payhero.co.ke/docs/get-transaction-status).

For a final failed/cancelled callback, Nirvana immediately records a failed attempt and returns a customer-safe message: cancelled prompt, insufficient M-Pesa funds, unaccepted PIN, expired prompt, or a general retry message. Provider diagnostics and server/token errors are never returned as the customer's failure reason. If the prompt is merely taking time and PayHero has not sent a final result, the payment stays pending; Nirvana tells the customer that no final result has arrived yet rather than claiming a failure. A matching success callback marks the payment successful immediately.

## Abuse protection

- More than 10 successive failed or cancelled STK requests to the same phone can block that number from this account for 24 hours.
- More than 50 failed requests in a sliding 6-hour window can restrict the account for 4 hours; at 500 failures the restriction is 24 hours, and at 1,000 it is 72 hours.
- Avoid retry loops and repeated prompts to the same phone. Let the customer check their phone and payment status before offering another attempt.

## Troubleshooting checklist

- `onlineAvailable` is false: check that username, password, and a positive numeric channel ID are set in the backend environment, then restart the API.
- The provider rejects a request: confirm the channel belongs to the account and supports MPESA, the phone number is valid, and the account is not restricted by abuse protection.
- Prompt starts but order remains pending: confirm `PUBLIC_API_URL` is reachable over HTTPS and PayHero can POST to `/api/payments/callback`. Check backend logs and the PayHero transaction status.
- Local development without a public HTTPS callback: keep the payment status page open so it can poll. This is not a production replacement for a reachable callback.
- Never mark an order paid based only on an HTTP 201/`QUEUED` response; that only confirms the STK request was accepted.

## Source documentation

- [Initiate MPESA STK Push](https://docs.payhero.co.ke/docs/post-initiate-mpesa-stk-push-request)
- [Payment Callback](https://docs.payhero.co.ke/docs/payment-callback)
- [Authorization](https://docs.payhero.co.ke/docs/authorization)
- [Get Transaction Status](https://docs.payhero.co.ke/docs/get-transaction-status)

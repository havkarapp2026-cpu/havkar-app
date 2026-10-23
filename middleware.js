import { isolatedPreviewApiBlock } from "./api/preview-isolation.cjs";

export default function middleware(request) {
  const decision = isolatedPreviewApiBlock(new URL(request.url).pathname);

  if (!decision) {
    return;
  }

  return new Response(JSON.stringify(decision.body), {
    status: decision.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export const config = {
  matcher: [
    "/api/pi-approve",
    "/api/pi-complete",
    "/api/pi-a2u-testnet",
    "/api/stripe-webhook",
    "/api/create-event-checkout",
    "/api/trade-crypto",
    "/api/translate",
    "/api/flights",
    "/api/flight-offer",
    "/api/flight-order",
    "/api/accommodation-review",
    "/api/business-application-notify"
  ]
};

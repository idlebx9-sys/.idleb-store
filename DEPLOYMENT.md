# IDLEB STORE deployment

## Global admin catalog sync

The admin catalog (products, categories, images and store settings) is now stored in Cloudflare KV so changes are visible to all visitors/devices.

One-time Cloudflare setup:

1. The project declares a `STORE_DATA` KV binding without a hard-coded account-specific ID. Current Wrangler supports automatic provisioning of KV resources on deployment; if Cloudflare asks to create/bind the KV namespace, approve it.
2. If your dashboard does not auto-provision it, go to Workers & Pages → your Worker → Settings → Bindings → Add → KV Namespace, use variable name `STORE_DATA`, select/create a KV namespace, then Deploy.
3. Keep Build command: `npm run build` and output directory: `dist`.
4. Redeploy.

The app uses `/api/store` for global catalog reads/writes. The admin editor accepts image URLs or images from the device gallery; gallery images are resized client-side before being stored in KV.

For stronger admin API protection, add a Cloudflare Worker secret named `ADMIN_API_KEY`. If omitted, the current frontend admin password is used as the API key (convenient but not a true secret because the frontend is static).

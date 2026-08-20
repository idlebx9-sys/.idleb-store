IDLEB STORE — FINAL FIX FILES

Replace ONLY these files in the project:
1) src/App.tsx
2) src/index.css
3) worker.ts

The files include:
- Cloudflare KV persistence for users, topups and complaints.
- Admin topup approval credits the user's remote wallet exactly once.
- Customer wallet is refreshed from KV automatically.
- Mobile navigation drawer is layered above page content.
- Responsive admin layout for phones.
- Complete App.tsx syntax (fixes the Unexpected end of file at line 802).

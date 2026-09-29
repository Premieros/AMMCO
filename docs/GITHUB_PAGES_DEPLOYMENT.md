# AMMCO GitHub Pages Deployment Architecture

## Decision
AMMCO is deployed through GitHub Pages, not Vercel.

Repository:
- `Premieros/AMMCO`

Backend:
- Supabase project `yumeijsyiphzdsulsubf` only.

## Required architecture

GitHub Pages serves a static frontend only.

Therefore:
- authentication uses the Supabase browser client;
- ordinary RLS-protected reads/writes use the Supabase browser client;
- privileged operations and workbook processing move to Supabase Edge Functions;
- secrets never ship in the frontend bundle;
- Excel files remain in the private Supabase Storage bucket;
- processing results are written only to AMMCO tables under RLS/service-side authorization.

## Migration from current Next.js server routes

Current server routes under `src/app/api` are temporary and must not be part of the final GitHub Pages runtime.

Target flow:

1. Browser authenticates with Supabase.
2. User selects branch and workbook.
3. Browser requests a signed/authorized upload path or invokes an Edge Function.
4. Workbook is uploaded to private AMMCO Storage.
5. Edge Function validates authorization and processes the workbook.
6. Parsed normalized data is written to AMMCO tables.
7. Static dashboard reads approved reporting views through RLS.

## GitHub Pages path
Production path must work under:

`/AMMCO/`

All routing, assets, and navigation must respect this base path.

## Security
No Supabase secret/service-role key may appear in:
- GitHub repository files,
- GitHub Pages environment output,
- browser JavaScript,
- HTML,
- static JSON assets.

Only the public/publishable Supabase key may be used by the frontend.

## Verification before publishing
- TypeScript passes
- Static export succeeds
- no server-only route dependency remains in production navigation
- auth redirect URLs include GitHub Pages origin
- Supabase RLS/security advisors are clean
- workbook upload/process flow works against `yumeijsyiphzdsulsubf`
- expense analytics and branch filtering work from approved imports

# youhu-website

Static bilingual marketing site for `youhu.space`.

The site is intended to be served on Vercel with clean URLs such as `/apply`
and `/manifesto`, while the source files remain flat `.html` files. It can also
be built into a public-only `dist/` directory for Nginx. Fonts are self-hosted
under `assets/fonts`; the rendered site does not contact Google Fonts.

## Local checks and static build

```sh
npm ci
npm run verify
npm run build:static
```

`npm run verify` runs the application-handler tests and checks that HTML has no
inline script or style, all site assets and WOFF2 fonts are local, and the Nginx
example remains compatible with the strict CSP. It also syntax-checks the
deployment script. See `ops/nginx/README.md` for a staged, reversible Nginx
deployment flow and the local-only `ops/deploy.sh --check` mode. No production
deployment is performed unless `ops/deploy.sh` is deliberately run without
`--check`.

## Founder application delivery

The application page now posts to `/api/apply`.

To make website submissions send directly to `support@youhu.space` on Vercel,
set these environment variables in the Vercel project:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`

Optional:

- `APPLY_TO_EMAIL` defaults to `support@youhu.space`
- `APPLY_FROM_EMAIL` defaults to `SMTP_USER`

If those variables are missing, `/api/apply` returns
`email_not_configured`; configure and test email delivery before exposing the
application form in production.

Never place SMTP values in HTML, JavaScript, Nginx files, or the static build.
For self-hosted Nginx, `/api/apply` must be proxied to a compatible application
endpoint; the Vercel handler is intentionally retained for Vercel deployments.

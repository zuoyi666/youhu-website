# youhu-website

Static bilingual marketing site for `youhu.space`.

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

If those variables are missing, the website falls back to generating a
copyable application draft so the applicant can still send it manually.

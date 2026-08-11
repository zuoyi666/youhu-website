# Nginx static hosting

This repository can produce a public-only static directory for Nginx. The
output intentionally excludes the Vercel function, tests, deployment notes,
package metadata, and any local environment files.

## Prepare a release

From the repository root:

```sh
npm ci
npm run verify
npm run build:static
```

`dist/` is the only directory that should become the Nginx document root.
Copy it into a new, explicitly named release directory such as
`/srv/youhu-website/releases/2026-08-12-01/`, verify the copied files, and only
then update `/srv/youhu-website/current` to point at that release. Keep the
previous release directory for rollback.

Do not copy `.env`, `.vercel`, `node_modules`, `api/`, or repository history to
the public directory. Do not place SMTP credentials in Nginx or frontend files.

For the repeatable SSH deployment flow, first run the complete local-only check:

```sh
./ops/deploy.sh --check
```

After the server administrator has installed and audited
`/usr/local/sbin/youhu-activate-website`, deploy through the SSH config alias
`youhu-prod` with:

```sh
./ops/deploy.sh
```

Override the alias when needed with `YOUHU_WEBSITE_HOST=user@host`. The script
runs `npm ci`, all verification, and the static build; creates a temporary
archive and SHA-256 digest; uploads it; and invokes the fixed root helper with
`sudo -n`. It never writes directly to the Nginx document root. `--check`
performs the same local preparation without connecting to the deployment host
or making a remote change. `npm ci` may still contact the configured package
registry when its cache does not contain a dependency.

## Nginx configuration

Include `youhu-space.locations.conf` inside the existing HTTPS `server` block.
The host-level configuration remains responsible for certificates, HTTP to
HTTPS redirection, access logs, compression, and operational rate limits.

The example sends `/api/apply` to `127.0.0.1:8000`. Before a DNS cutover, deploy
and verify a compatible local POST handler at that address, or change the
upstream to the separately managed application service. The handler must keep
the same request shape, size limits, validation, honeypot behavior, email
escaping, and JSON response contract as `api/apply.js`.

The checked-in Vercel function remains available when the site is deployed on
Vercel; it is not copied into the Nginx static root.

The example CSP permits scripts, styles, fonts, images, and network requests
only from the same origin and blocks framing. It contains neither
`unsafe-inline` nor `unsafe-eval`. Keep the CSP report-only during a staging
smoke test if the surrounding host config injects any additional resources,
then enforce the header after those resources are removed or explicitly
reviewed.

## Pre-cutover checks

Run `npm run verify` from the exact source revision used for the release, then
check the staged hostname:

```sh
curl --fail --silent --show-error --head https://staging.example/
curl --fail --silent --show-error --head https://staging.example/apply
curl --fail --silent --show-error --head https://staging.example/assets/site.css
curl --fail --silent --show-error --request POST \
  --header 'Content-Type: application/json' \
  --data '{}' https://staging.example/api/apply
```

Confirm that the HTML, CSS, JavaScript, images, and WOFF2 files return from the
staged host; clean routes do not redirect unexpectedly; the CSP header is
present on both success and error responses; and an intentionally incomplete
application receives the expected JSON validation error. Submit a complete
test application only to a designated test mailbox, never the production
support inbox.

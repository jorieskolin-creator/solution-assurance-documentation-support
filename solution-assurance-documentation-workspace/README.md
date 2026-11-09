# Solution Assurance Documentation Workspace

UI draft 0.1 for the Frame Purpose and Permission documentation flow.

## Scope

- Record setup and Vivicta lifecycle stage
- Intended use, output role, impact and permission documentation
- Data-source and evidence-reference registers
- Explicit not-applicable rationale and owner
- Documentation coverage and evidence-reference integrity checks
- Human documentation confirmation, invalidated by subsequent edits
- Standalone HTML export and print/PDF output

This frontend-only draft does not provide automated classification, risk scoring, assurance findings, gate decisions, remediation analysis, authentication, direct Saidot integration or Solution Assurance Engine integration.

## Data boundary

Records are stored in the current browser's localStorage. They do not sync across browsers or devices, and clearing browser data removes them. No record content is sent to an external AI or governance service. The HTML export contains no scripts.

## Run

```sh
npm ci
npm run dev
```

## Build

```sh
npm run build
npm run preview
```

The production output is written to `dist/`.

## Deploy to Railway

The repository includes a root-level multi-stage `Dockerfile`, so Railway can deploy directly from the repository root. The build stage uses Node 24, installs the locked dependencies with `npm ci`, and builds the frontend from `solution-assurance-documentation-workspace/`. The runtime stage serves only the generated `dist/` files with Caddy. No backend, database or application secrets are required.

1. In Railway, create a project and deploy from the GitHub repository `jorieskolin-creator/solution-assurance-documentation-support`.
2. Open the service's **Settings** and leave **Root Directory** empty or set it to `/`. If it was previously set to the frontend subdirectory, reset it to `/` to use the root Dockerfile.
3. Railway detects the root `Dockerfile` automatically. Leave custom build and start commands empty, and remove any Dockerfile path override pointing elsewhere.
4. Set the deployment health-check path to `/`.
5. Deploy the service and generate a domain under **Settings → Networking**.

The Caddy configuration listens on Railway's injected `PORT` (default `8080` locally), accepts all hostnames, and falls back to `index.html` for frontend routes. Railway handles public HTTPS. Do not use `npm run dev` or `npm run preview` as the production start command.

The root `.dockerignore` excludes the separate governance documents, local dependencies, build output and environment files from the build context. The final image contains the built frontend and Caddy configuration only.

To build and run the same container locally, run from the repository root:

```sh
docker build -t solution-assurance-documentation-workspace .
docker run --rm -p 8080:8080 -e PORT=8080 solution-assurance-documentation-workspace
```

If an earlier deployment reports `Railpack could not determine how to build the app`, redeploy the latest commit containing the root Dockerfile. That failure happened because Railpack inspected the repository root while the Node application was in a subdirectory.

Railway hosting does not change the data boundary: records remain in each user's browser localStorage and are not stored by the Railway service.

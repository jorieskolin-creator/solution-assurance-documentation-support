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
npm install
npm run dev
```

## Build

```sh
npm run build
npm run preview
```

The production output is written to `dist/`.

## Deploy to Railway

The workspace uses Node 24 (see `.nvmrc`) and Railway's default Railpack builder. No backend, database, environment variables or custom Node production server are required.

1. In Railway, create a project and deploy from the GitHub repository `jorieskolin-creator/solution-assurance-documentation-support`.
2. Open the service's **Settings** and set **Root Directory** to `/solution-assurance-documentation-workspace`. This is required because the repository also contains separate governance documents.
3. Use **Railpack** as the builder. Leave custom build and start commands empty: Railpack detects Vite, installs dependencies, runs `npm run build`, and serves `dist/` as a static single-page application with Caddy.
4. Set the deployment health-check path to `/`.
5. Deploy the service and generate a domain under **Settings → Networking**.

Do not use `npm run dev` or `npm run preview` as the Railway start command. A custom start command disables Railpack's automatic static-site serving.

Railway hosting does not change the data boundary: records remain in each user's browser localStorage and are not stored by the Railway service.

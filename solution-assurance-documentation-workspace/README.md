# Solution Assurance Documentation Workspace

UI draft 0.1 for the Frame Purpose and Permission documentation flow.

## Scope

- Record setup and Vivicta lifecycle stage
- Intended use, output role, impact and permission documentation
- Data-source and evidence-reference registers
- Explicit not-applicable rationale and owner
- Documentation coverage and evidence-reference integrity checks
- Human documentation confirmation, invalidated by subsequent edits
- Step 02 Failure Mode Register with 15 archetypes, custom entries, anchored severity / occurrence / detectability, and an Outstanding Work list
- Local Markdown import and copy, printable HTML with an inert JSON handoff, standalone JSON, and print/PDF

The register documents credible failures and claimed controls. It does not compute a Risk Priority Number, assess residual risk, prove effectiveness, or approve a release. Document declarations (Q1), code/config references (Q2), and test/evidence references (Q3) are distinct. `NOT_RUN` is not a test result.

## Data boundary

Drafts stay in this browser's localStorage. They do not sync across devices, and clearing browser data removes them. The optional AI feature sends only three categories selected in its dialog after consent; it does not send record text, files, or evidence. The app does not send drafts to Saidot or the Solution Assurance Engine.

Exports omit raw source excerpts and apply best-effort redaction and reference filtering. Do not enter credentials, restricted customer data or raw evidence payloads; review exported content before sharing. The HTML contains no executable scripts. For valid handoffs, it includes the same inert JSON as the separate JSON download. `integrity.payload_sha256` hashes the RFC 8785 canonical payload excluding `integrity`; it is not a signature. Honest gaps and unconfirmed drafts can be exported. Compilation blockers prevent the machine handoff but not the printable summary.

## Local Markdown import

In Step 02, paste or select `Documentation/02-Risk-and-Impact.md` with a `## Failure Mode Register` table. Import appends by default. Missing registers preserve existing rows. Copy Markdown Table generates the supported column format for editing in the source document; observed statuses and provenance are derived on import, not copied as declarations.

Optionally upload a snapshot index JSON with a `files` object keyed by repository-relative path. Its values can be empty objects or contain a `status` string (`NOT_RUN` and `SPECIFICATION ONLY` are recognized). Optional top-level `filePath` and `snapshotHash` identify the supplied source. The index is supplied by the reviewer, not verified against a remote repository. No paths or links are fetched and no repository files or tests are run. A listed test artifact is only a reference, not proof of execution or effectiveness.

## Run

```sh
npm ci
npm run dev
```

## Build

```sh
npm run lint
npm test
npm run build
npm run preview
```

The production output is written to `dist/`.

## Deploy to Railway

The root multi-stage `Dockerfile` builds the frontend on Node 24. The runtime uses Caddy to serve `dist/` and proxies only `/api/ai/*` to the optional AI endpoint on a loopback-only Node listener. One Railway service is sufficient; **Postgres and Redis are not needed.** No provider credentials are needed for the manual workflow.

1. In Railway, create a project and deploy from the GitHub repository `jorieskolin-creator/solution-assurance-documentation-support`.
2. Open the service's **Settings** and leave **Root Directory** empty or set it to `/`. If it was previously set to the frontend subdirectory, reset it to `/` to use the root Dockerfile.
3. Railway detects the root `Dockerfile` automatically. Leave custom build and start commands empty, and remove any Dockerfile path override pointing elsewhere.
4. Set the deployment health-check path to `/`.
5. Deploy the service and generate a domain under **Settings → Networking**.

The Caddy configuration listens on Railway's injected `PORT` (default `8080` locally), accepts all hostnames, and falls back to `index.html` for frontend routes. Railway handles public HTTPS. Do not use `npm run dev` or `npm run preview` as the production start command.

The root `.dockerignore` excludes the separate governance documents, local dependencies, build output and environment files from the build context. Provider credentials are runtime-only; do not set `VITE_*` variables for them.

To build and run the same container locally, run from the repository root:

```sh
docker build -t solution-assurance-documentation-workspace .
docker run --rm -p 8080:8080 -e PORT=8080 solution-assurance-documentation-workspace
```

If an earlier deployment reports `Railpack could not determine how to build the app`, redeploy the latest commit containing the root Dockerfile. That failure happened because Railpack inspected the repository root while the Node application was in a subdirectory.

### AI-assisted drafting

AI drafting is available by default when `GEMINI_API_KEY` and `XAI_API_KEY` are set as Railway **runtime** variables. No enable flag, separate access token, or user-entered credential is needed. If either key is absent, only the manual workflow is available. Keep the keys on the server.

No model is called until a user chooses three categories and consents. Gemini (`gemini-4-hydrogen`) ranks vetted draft candidates; Grok (`grok-4.7`) is attempted only when Gemini is temporarily unavailable. The user reviews and explicitly accepts each draft. The models do not assign severity, provide evidence, or edit the record directly. Accepted suggestions retain their model provenance.

Anyone who can reach a public deployment can request suggestions. Each process permits up to six suggestion requests per minute, 60 per rolling day, and two requests in flight. One request may call both providers. The counters reset on restart and are not shared across replicas. Use one replica and set provider-side spending limits before exposing a public service. Verify both providers in staging with approved synthetic inputs. CI tests use mocks and do not need keys.

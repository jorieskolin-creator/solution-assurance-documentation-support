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

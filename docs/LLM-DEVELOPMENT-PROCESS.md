# LLM-Assisted Development Process

## Purpose

Use an LLM as a pair programmer while building Pantry Next. The developer remains responsible for product decisions, security review, and confirming compliance requirements. Work in small, reviewable changes and require explanations for unfamiliar code.

## Project context documents

Keep the documentation set current:

- `PROJECT.md` — broader Pantry product context and future direction.
- `ROADMAP.md` — planned work and current phase.
- `DECISIONS.md` — dated decisions and superseded choices.
- `MANUAL-SETUP.md` — operator setup and operational actions.
- `APP-FEATURES.md` — user-visible features and flows.
- `IMPLEMENTATION.md` — architecture and stack.

Record confirmed requirements as facts and label unresolved assumptions clearly.

## Development approach

### 1. Work safely

- Use fictional records, synthetic documents, and test accounts.
- Never put real client information, production credentials, access tokens, or private keys into an LLM prompt.
- Keep secrets out of source control and browser code.
- Commit a known-good state before substantial changes.

### 2. Build one vertical slice at a time

Start with a small slice that exercises the real boundary: browser assets, Worker routing, authentication, authorization, Hyperdrive database access, and tests. Do not build the entire product at once.

Use the strict TypeScript Worker and Supabase setup. Run Worker tests with Node.js 26’s native TypeScript type-stripping. Keep initial database bootstrap separate from future schema changes and verify that local tests use isolated fixtures rather than production.

### 3. Give bounded tasks

Each request should describe one result, its boundaries, affected files, and acceptance criteria. Ask for a plan before broad or security-sensitive changes. Inspect the diff and run relevant checks after each bounded change.

### 4. Require security behavior and negative tests

For every access-control change, specify both allowed and denied cases. Test authorization at the Worker/API and database boundaries, not only by hiding UI controls.

Review in particular:

- organization membership and role resolution from trusted records;
- cross-organization denial;
- role restrictions;
- CSRF and origin checks;
- private TV credentials;
- setup-link expiry and one-use behavior;
- protection of secrets and private files.

### 5. Verify platform behavior

Use current official Cloudflare and Supabase documentation for platform-specific behavior. Do not rely on memory for changing APIs, provider schemas, quotas, or security settings.

## Review loop

1. State the desired outcome, constraints, and acceptance criteria.
2. Propose the affected files and implementation approach.
3. Review security and data-boundary decisions.
4. Make one bounded change.
5. Inspect the diff.
6. Run relevant checks. For the Worker, run `npm run typecheck`, `npm test`, and a Wrangler dry run when bundling or deployment configuration changes.
7. Record durable decisions in `DECISIONS.md`.
8. Commit the verified change before the next substantial task.

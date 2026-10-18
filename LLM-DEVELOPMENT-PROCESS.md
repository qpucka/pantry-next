# LLM-Assisted Development Process

## Purpose

Use an LLM as a pair programmer and TypeScript tutor while building the client, household, appointment, and service-event system. The developer remains responsible for product decisions, security review, and confirming compliance requirements. The LLM should work in small, reviewable changes and explain its work.

## Project context documents

Before substantial implementation, create and maintain these short Markdown files in the project root:

- `PROJECT.md` — purpose, users, current scope, and out-of-scope features.
- `SECURITY.md` — roles, household access boundaries, private-file requirements, and required security tests.
- `DECISIONS.md` — important choices, rationale, date, and what might cause a decision to be revisited.
- `TASKS.md` — the next small tasks and how each will be verified.

Keep these documents concise and current. Record confirmed requirements as facts and label unresolved assumptions clearly. For example, record the seven-year TEFAP form retention period as an organizational requirement confirmed by the organization. Do not assume that this alone confirms an electronic signature or intake method is acceptable; document that workflow after it has been confirmed with the appropriate Minnesota TEFAP contact or regional food bank.

## Development approach

### 1. Work in a safe local environment

- Use fictional records, synthetic documents, and test accounts during development.
- Never paste real client information, production credentials, access tokens, or private keys into an LLM prompt.
- Keep secrets out of source control and browser code.
- Use version control. Commit a known-good state before substantial LLM-assisted changes so changes can be reviewed or reverted.

### 2. Build one vertical slice at a time

Start with a small prototype that exercises the foundational system without attempting to build the entire product:

1. A staff user signs in.
2. Staff creates a household and adds a person.
3. Staff records a service event, such as a food distribution with a weight.
4. Staff uploads and retrieves a fake TEFAP PDF using private storage.
5. Tests confirm an unauthorized user cannot access another household's data or document.

Use local development tools and migrations where possible. Keep schema changes versioned and repeatable. Do not use the prototype to replace the physical TEFAP process or store real client data until the relevant electronic workflow has been confirmed and the security/recovery checks have passed.

### 3. Give the LLM bounded tasks

Each request should describe one result, its boundaries, and acceptance criteria. Ask the LLM to propose the changes before editing when a task is broad or security-sensitive. Avoid requests to build the entire application at once.

Example:

> Add a database migration for households and household members. Do not add authentication or UI. Include constraints and tests or queries showing invalid membership data is rejected. First summarize the proposed changes. Explain the design and any assumptions.

After reviewing and understanding the change, run the tests and inspect the diff before accepting it. Ask the LLM to explain unfamiliar code or SQL rather than accepting code that cannot be understood or maintained.

### 4. Require security behavior and negative tests

For every access-control change, specify both allowed and denied cases. Test authorization at the database/API boundary, not only by checking whether the UI hides a button.

Example:

> Add a policy that lets a client read records for their linked household only. Include a test where access succeeds for that household and fails for a different household. Explain what prevents a user from changing a request parameter to bypass the rule.

Review the policy, grants, and tests yourself. Tests are necessary evidence, not a substitute for reviewing the authorization design. In particular:

- Determine organization membership and role from trusted records, not from untrusted request parameters.
- Enforce least privilege for admin, staff, volunteer, and client roles.
- Make household membership and client-account linking explicit and verifiable.
- Keep TEFAP PDFs in private storage and authorize access to each file.
- Keep each completed TEFAP form as a distinct record; renewals or corrections must not silently replace prior forms.
- Test cross-household and, if multi-organization access is introduced, cross-organization denial.

### 5. Learn TypeScript as part of implementation

When generated code uses unfamiliar language or platform features, ask the LLM to:

- Explain the relevant TypeScript concepts in the diff.
- Distinguish standard TypeScript/JavaScript from Cloudflare Workers-specific APIs.
- Identify assumptions and uncertainty.
- Link to current official documentation.
- Provide a small exercise or test that helps confirm understanding.

Use official Cloudflare and Supabase documentation as the reference for platform-specific behavior. Do not rely on an LLM's memory for changing product APIs, plan limits, or compliance claims.

## Review loop for every task

1. State the desired outcome, constraints, and acceptance criteria.
2. Ask for a brief plan and affected files for non-trivial changes.
3. Review the proposed design, especially assumptions about privacy, authorization, and records.
4. Make one bounded change.
5. Inspect the diff and ask for explanations of anything unclear.
6. Run relevant tests, including negative authorization tests where applicable.
7. Record durable decisions or changed requirements in the project context documents.
8. Commit the verified change before moving to the next substantial task.

## Suggested implementation order

1. Create the project context documents: `PROJECT.md`, `SECURITY.md`, `DECISIONS.md`, and `TASKS.md`.
2. Set up the local TypeScript/Cloudflare Worker and Supabase development workflow.
3. Model households, people, and memberships with migrations and tests.
4. Add staff authentication and role enforcement.
5. Implement service programs and service events, including food weight and household counts where relevant.
6. Implement private document storage and TEFAP-form metadata/retention behavior using synthetic PDFs.
7. Validate role boundaries, household isolation, document retrieval, exports, and backup/restore procedures.
8. Only then plan a controlled pilot with real workflows and data.

## Reference documentation

- [Cloudflare Workers TypeScript](https://developers.cloudflare.com/workers/languages/typescript/)
- [Cloudflare Workers local development](https://developers.cloudflare.com/workers/local-development/)
- [Supabase local development and CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Supabase database testing](https://supabase.com/docs/guides/database/testing)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)

# Roadmap

Pantry Next is being built in two broad stages:

1. Establish a reusable multi-tenant foundation and a functioning waiting-room app that can be used by multiple organizations.
2. Expand that foundation into a distributable pantry-management application with client records, services, appointments, waiting-room operations, electronic forms, identity options, and payments.

The roadmap describes planned work, not completed behavior.

## Product strategy

The first release is deliberately narrower than the eventual product. It must prove that multiple organizations can safely share one application and database foundation while independently operating their own waiting room. The initial waiting-room app should be useful on its own, not merely a prototype for later features.

Once that foundation is working, development proceeds by adding pantry-management capabilities to the same multi-tenant product:

- client and household records;
- arbitrary service definitions and service tracking;
- appointment scheduling and capacity management;
- waiting-room and check-in workflows;
- electronic form handling and private document storage;
- email and SMS one-time-passcode login;
- Stripe integration and payment handling.

## Current phase

**Phase 1 — Multi-tenant foundation and waiting-room app**

Completed foundation:

- Supabase project provisioning through Terraform.
- Initial database bootstrap through `supabase/setup/*.sql`.
- Hyperdrive provisioning after the database role exists.
- Terraform-created Cloudflare Worker with Hyperdrive and Durable Object bindings.
- Initial Durable Object migration.
- Later Worker deployments through Wrangler version upload and deployment, inheriting existing bindings.
- Worker API foundation for authentication, organization registration, queue operations, and realtime notifications.

The application is not production-ready. The browser interfaces, security review, platform-admin bootstrap, and several workflows remain incomplete.

## Next work

### 1. Stabilize the foundation

- Confirm Supabase Auth settings for registration without email delivery.
- Verify the deployed Worker against Supabase through Hyperdrive.
- Review database role privileges and reduce them if the application design permits.
- Add local development and integration setup that cannot target production accidentally.

### 2. Complete identity and organization administration

- Complete registration, sign-in, sign-out, and session refresh behavior.
- Add platform-admin bootstrap through a protected, rerunnable workflow.
- Add the platform-admin organization list.
- Implement one-time staff setup links with selected role, expiry, one-use consumption, and replacement/revocation.
- Add authorization tests for every role and organization boundary.

### 3. Complete waiting-room workflows

- Add organization settings for appointment times, number mode, and timezone.
- Complete the staff/admin check-in and edit flows.
- Complete the tablet queue and shopping-status flow.
- Complete the TV queue and view-only pairing flow.
- Ensure queue clearing is confirmed, atomic, and resets number assignment correctly.
- Complete authenticated realtime subscriptions and client refetch behavior.

### 4. Validate the release

- Test concurrent check-ins, queue ordering, timestamps, queue clearing, and tenant isolation.
- Test role restrictions, CSRF protections, setup links, and TV credentials.
- Run strict TypeScript checks, tests, Worker dry runs, and integration tests in CI.
- Document operational recovery, password rotation, and deployment procedures.

## Phase 2 — Distributable pantry-management product

After the multi-tenant foundation and waiting-room app are independently useful, expand the product for distribution to multiple pantry organizations:

- client and household records;
- arbitrary service definitions, service events, and service tracking;
- appointment scheduling, recurring availability, booking limits, cancellation, and rescheduling;
- integrated waiting-room and check-in workflows;
- electronic form handling and private document storage;
- email one-time-passcode login;
- SMS one-time-passcode login after provider and cost review;
- Stripe integration, subscriptions or other organization billing, and payment handling;
- TEFAP-related intake and document workflows based on confirmed requirements.

These are later product capabilities, not requirements for the initial waiting-room release.

# Pantry Next Project Context

## Purpose

Build a food pantry application that supports clients and staff in managing pantry services. The initial product direction is a working appointment system that can be useful on its own while the rest of the application is developed.

## Design philosophy

Give clients as much freedom as possible to handle their own business, while always offering staff assistance as an alternative. Design for a wide range of technical ability, from clients with no experience using technology to expert users. Prefer clear, accessible self-service with a practical assisted path; do not make self-service a requirement for receiving help.

Make setup and everyday use simple for busy, non-technical people. Minimize steps, jargon, and repeated setup work; provide clear, forgiving workflows and practical recovery/help paths. Treat this as a foundational design concept across all interfaces, including staff-operated and public displays.

Keep operating costs low during initial development and adoption by preferring suitable free service tiers. Design integrations so the project can migrate providers or move to paid tiers if usage, reliability, or service needs outgrow free offerings. Do not treat free-tier limits or availability as guaranteed; identify and monitor relevant constraints.

## Initial product direction

The user's preferred starting point is an appointment-focused release with:

- A public page where clients can make appointments; clients must log in to book. New clients can create an account, create their required household profile during registration, sign in, and book. One client login account represents one household; multiple client login accounts for the same household are not allowed. Staff accounts are separate. Clients may request an email change themselves, and staff may help change the login email after verifying the client's authority over that household account. Confirm the new address with an OTP before it replaces the current login email.
- Initial client login should use email one-time passcodes (OTP).
- Add text-message one-time codes (SMS OTP) in a later development phase; the intended direction is to offer both channels. Evaluate provider configuration and SMS costs before adding SMS.
- Staff ability to make appointments for clients.
- Staff-performed check-in initially; add client self-check-in later while retaining staff check-in.
- The waiting-room workflow has three interfaces: (1) a staff screen where staff can see and adjust all waiting-room information/statuses; (2) a waiting-room display showing clients/households currently waiting, identified by first name and last initial; food-market households leave this display when moved from waiting to shopping; and (3) a waiting-room tablet interface showing those waiting and allowing status changes from waiting to the next service status (label and full status flow TBD).

This initial system should be independently usable before the rest of the application is complete. The exact appointment rules, roles, identity model, and check-in workflow remain to be determined; do not treat unstated details as requirements.

## Core data and services

- The household is the basic building block of the data model.
- The Minnesota TEFAP manual is the authority for what data must be collected to meet TEFAP requirements. The organization also wants the ages, genders, and ethnicities of each household member recorded. Clients self-report these during registration and can update them later. Verify the current manual and exact field definitions before implementing intake; do not infer requirements from this summary.
- All services are connected to a household; appointments are for a household, not an individual in isolation.
- Staff can publish appointments for any service, using specific dated slots, recurring schedules, or both.
- Staff set a booking limit for every appointment slot, counted in households.
- For food-market shopping, only one member of a household may attend and shop at a time.
- Clients can cancel appointments at any time and should be able to reschedule themselves, subject to availability and slot capacity.
- The food pantry, referred to by the organization as the **food market**, will be the most common service.

## Broader context

The broader project is a food pantry application. Household and client records, service events, food distribution tracking, and private TEFAP document workflows may be needed, guided by the project specification and confirmed organizational requirements. Keep future capabilities out of the initial appointment slice unless required to make that slice safe and useful.

## Product decisions

Confirmed decisions and unresolved questions belong in `DECISIONS.md` as they are established. Use synthetic records during development; do not put real client data or credentials in development prompts or source control.

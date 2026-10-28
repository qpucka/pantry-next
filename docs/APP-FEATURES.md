# App Features and Flows

## Scope

The initial release is a multi-organization waiting-room application. One Cloudflare Worker serves multiple organizations backed by one Supabase project.

The app has three interfaces:

1. **Organization interface:** Organization Administrators and Staff check clients in, edit entries, manage queue actions, and use organization settings according to their role.
2. **Tablet:** Staff or Tablet Users view the waiting queue and move clients from `checked-in` to `shopping`.
3. **TV:** a simple display of the current waiting queue. It uses view-only access rather than an interactive staff login.
4. **Platform administration:** Platform Administrators manage the PantryNext installation and its organizations separately from organization operations.

## Queue flow

1. Staff check in a client.
2. The Worker records the check-in time and sets status to `checked-in`.
3. Appointment clients appear in appointment-time order; ties use check-in time.
4. Walk-ins appear in check-in-time order.
5. Staff or volunteers move a client to `shopping` from the tablet or an authorized Organization Administrator or Staff interface.
6. Shopping clients leave the waiting queue.
7. Staff clear the queue at the end of service after confirmation.
8. Clearing permanently deletes the queue entries and resets number assignment.

The initial app does not retain client entries or visit history after the queue is cleared.

## Check-in data

A client entry includes:

- first name, required;
- last name, optional;
- configured appointment time or Walk-in, required;
- status, assigned automatically;
- check-in timestamp, assigned by the Worker;
- optional sequential display number.

Organizations may use either name-based display or number-based display. In number mode, the TV and tablet show only the number while the Organization Administrator or Staff interface can show names and numbers.

## Roles

- **Organization Administrator:** all organization interfaces, settings, and account-management capabilities within that organization.
- **Staff:** check-in, edit, status changes, and confirmed queue clearing; no organization settings or account management.
- **Tablet User:** tablet interface and permitted queue status action only.
- **Platform Administrator:** platform-level organization list and future platform actions across the PantryNext installation.

Every authenticated operation is authorized against the user’s membership in the selected organization. Organization identifiers from the browser are not trusted for tenant access.

## Registration and authentication

Initial organization registration collects:

- organization name;
- first administrator email;
- first administrator password;
- browser IANA timezone.

The initial app does not send email or require email verification. Account recovery requires human assistance. Organization admins create one-time staff setup links, select the recipient role, and provide the link in person. Links expire after 24 hours and can be used once.

The browser receives HttpOnly session cookies from the Worker. Application data is accessed through Worker endpoints; the browser does not connect directly to Postgres. Platform Administrator access and Organization Administrator access are separate permissions, even when one person holds both.

## Realtime behavior

The database remains the source of truth.

- A successful queue mutation commits to Postgres first.
- The Worker then sends a small change notification to the organization’s Durable Object room.
- Connected clients refetch authorized current state through the Worker.
- Reconnecting clients refetch to recover missed notifications.
- Notifications are not authoritative data and do not contain queue records.

TV pairing and its view-only realtime handshake remain implementation work.

## Broader product direction

The broader Pantry product will later add household accounts, appointment booking, food-market services, distribution records, and related TEFAP workflows. Those capabilities are documented in `PROJECT.md` and are not part of this initial waiting-room scope.

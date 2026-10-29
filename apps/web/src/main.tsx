import { FormEvent, ReactNode, useEffect, useState } from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const commitSha = import.meta.env.VITE_COMMIT_SHA || "local";

interface User {
  id: string;
  email?: string;
}

interface Membership {
  organization_id: string;
  organization_name: string;
  role: "org_admin" | "staff" | "tablet" | string;
}

interface SessionResponse {
  user: User;
}

interface RegisterResponse {
  organizationId: string;
  organizationName: string;
}

interface OrganizationsResponse {
  memberships: Membership[];
}

interface PlatformOrganizationsResponse {
  organizations: Array<{
    id: string;
    name: string;
    timezone: string;
    created_at: string;
  }>;
}

interface RegisterForm {
  organizationName: string;
  email: string;
  password: string;
  timezone: string;
}

interface ApiError extends Error {
  status: number;
}

type AuthView = "landing" | "sign-in" | "register";

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(typeof body?.error === "string" ? body.error : "Something went wrong. Please try again.") as ApiError;
    error.status = response.status;
    throw error;
  }
  return body as T;
}

function initialTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago";
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [platformOrganizations, setPlatformOrganizations] = useState<PlatformOrganizationsResponse["organizations"]>([]);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [authView, setAuthView] = useState<AuthView>("landing");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [signupNotice, setSignupNotice] = useState("");

  async function loadSession(): Promise<void> {
    try {
      const session = await api<SessionResponse>("/api/auth/me");
      setUser(session.user);
      try {
        const platform = await api<PlatformOrganizationsResponse>("/api/platform/organizations");
        setIsPlatformAdmin(true);
        setPlatformOrganizations(platform.organizations);
        setMemberships([]);
      } catch (requestError) {
        if (requestError instanceof Error && "status" in requestError && requestError.status === 403) {
          const organizations = await api<OrganizationsResponse>("/api/organizations");
          setIsPlatformAdmin(false);
          setPlatformOrganizations([]);
          setMemberships(organizations.memberships);
        } else {
          throw requestError;
        }
      }
    } catch {
      setUser(null);
      setIsPlatformAdmin(false);
      setPlatformOrganizations([]);
      setMemberships([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSession();
  }, []);

  function showAuthView(nextView: "sign-in" | "register"): void {
    setAuthView(nextView);
    setError("");
    setSignupNotice("");
  }

  function returnToLanding(): void {
    setAuthView("landing");
    setError("");
    setSignupNotice("");
  }

  async function handleSignIn(email: string, password: string): Promise<void> {
    setBusy(true);
    setError("");
    try {
      await api<SessionResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await loadSession();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(form: RegisterForm): Promise<void> {
    setBusy(true);
    setError("");
    setSignupNotice("");
    try {
      const registration = await api<RegisterResponse>("/api/register", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setSignupNotice(`${registration.organizationName} was created successfully.`);
      await loadSession();
    } catch (requestError) {
      if (requestError instanceof Error && "status" in requestError && requestError.status === 503) {
        setError(`${requestError.message} You can return to sign in without creating another account.`);
      } else if (requestError instanceof Error && "status" in requestError && requestError.status === 409) {
        setError(requestError.message);
      } else {
        setError(requestError instanceof Error ? requestError.message : "Sign-up failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout(): Promise<void> {
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/logout", { method: "POST" });
      setUser(null);
      setMemberships([]);
      setAuthView("landing");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Sign-out failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <Page><div className="loading" role="status">Loading your PantryNext account…</div></Page>;
  }

  if (user) {
    return (
      <Page>
        <section className="card workspace" aria-labelledby="workspace-title">
          <div className="card-heading">
            <div>
              <p className="eyebrow">PantryNext</p>
              <h1 id="workspace-title">{isPlatformAdmin ? "Platform administration" : "Your organizations"}</h1>
            </div>
            <button className="button button-secondary" type="button" onClick={() => void handleLogout()} disabled={busy}>
              Sign out
            </button>
          </div>
          <p className="message">Signed in as <strong>{user.email || "your account"}</strong>.</p>
          {isPlatformAdmin ? (
            <PlatformAdminOrganizations organizations={platformOrganizations} />
          ) : (
            <OrganizationMemberships memberships={memberships} />
          )}
          {signupNotice && <div className="success" role="status">{signupNotice}</div>}
          {error && <ErrorMessage message={error} />}
        </section>
      </Page>
    );
  }

  if (authView === "landing") {
    return (
      <Page>
        <section className="card landing-card" aria-labelledby="landing-title">
          <p className="eyebrow">PantryNext</p>
          <h1 id="landing-title">Simple organization management</h1>
          <p className="message">A clear, shared place for your organization to get work done.</p>
          <div className="choice-list">
            <button className="button" type="button" onClick={() => showAuthView("sign-in")}>Log in</button>
            <button className="button button-secondary choice-secondary" type="button" onClick={() => showAuthView("register")}>Sign up</button>
          </div>
        </section>
      </Page>
    );
  }

  return (
    <Page>
      <section className="card auth-card" aria-labelledby="auth-title">
        <button className="back-link" type="button" onClick={returnToLanding}>← Back</button>
        <p className="eyebrow">PantryNext</p>
        <h1 id="auth-title">{authView === "sign-in" ? "Log in" : "Sign up"}</h1>
        <p className="message">
          {authView === "sign-in" ? "Log in to access your organizations." : "Create your PantryNext organization and account."}
        </p>
        {error && <ErrorMessage message={error} />}
        {authView === "sign-in" ? (
          <SignInForm busy={busy} onSubmit={(email, password) => void handleSignIn(email, password)} />
        ) : (
          <RegisterForm busy={busy} onSubmit={(form) => void handleRegister(form)} />
        )}
      </section>
    </Page>
  );
}

function OrganizationMemberships({ memberships }: { memberships: Membership[] }) {
  if (memberships.length === 0) return <div className="empty-state">You do not belong to an organization yet.</div>;
  return (
    <div className="organization-list">
      {memberships.map((membership) => (
        <article className="organization" key={membership.organization_id}>
          <div>
            <h2>{membership.organization_name}</h2>
            <p>{formatRole(membership.role)}</p>
          </div>
          <span className="status-badge">Ready</span>
        </article>
      ))}
    </div>
  );
}

function PlatformAdminOrganizations({ organizations }: { organizations: PlatformOrganizationsResponse["organizations"] }) {
  if (organizations.length === 0) return <div className="empty-state">No organizations have been created yet.</div>;
  return (
    <div>
      <p className="section-label">Organizations</p>
      <div className="organization-list">
        {organizations.map((organization) => (
          <article className="organization" key={organization.id}>
            <div>
              <h2>{organization.name}</h2>
              <p>{organization.timezone}</p>
            </div>
            <span className="status-badge">Active</span>
          </article>
        ))}
      </div>
    </div>
  );
}

function SignInForm({ busy, onSubmit }: { busy: boolean; onSubmit: (email: string, password: string) => void }) {
  const [showPassword, setShowPassword] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit(String(form.get("email") || "").trim(), String(form.get("password") || ""));
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>Email<input name="email" type="email" autoComplete="email" required /></label>
      <label>
        Password
        <PasswordInput name="password" autoComplete="current-password" showPassword={showPassword} onToggle={() => setShowPassword((visible) => !visible)} />
      </label>
      <button className="button" type="submit" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
    </form>
  );
}

function RegisterForm({ busy, onSubmit }: { busy: boolean; onSubmit: (form: RegisterForm) => void }) {
  const [showPassword, setShowPassword] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      organizationName: String(form.get("organizationName") || "").trim(),
      email: String(form.get("email") || "").trim(),
      password: String(form.get("password") || ""),
      timezone: String(form.get("timezone") || "").trim(),
    });
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>Organization name<input name="organizationName" type="text" autoComplete="organization" maxLength={160} required /></label>
      <label>Email<input name="email" type="email" autoComplete="email" required /></label>
      <label>
        Password
        <PasswordInput name="password" autoComplete="new-password" minLength={12} maxLength={128} showPassword={showPassword} onToggle={() => setShowPassword((visible) => !visible)} />
        <span className="hint">Use at least 12 characters.</span>
      </label>
      <label>Time zone<input name="timezone" type="text" defaultValue={initialTimezone()} maxLength={80} required /></label>
      <button className="button" type="submit" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
    </form>
  );
}

function PasswordInput({
  name,
  autoComplete,
  minLength,
  maxLength,
  showPassword,
  onToggle,
}: {
  name: string;
  autoComplete: string;
  minLength?: number;
  maxLength?: number;
  showPassword: boolean;
  onToggle: () => void;
}) {
  return (
    <span className="password-input">
      <input
        name={name}
        type={showPassword ? "text" : "password"}
        autoComplete={autoComplete}
        minLength={minLength}
        maxLength={maxLength}
        required
      />
      <button className="password-toggle" type="button" onClick={onToggle} aria-label={showPassword ? "Hide password" : "Show password"}>
        {showPassword ? "Hide" : "Show"}
      </button>
    </span>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return <div className="error" role="alert">{message}</div>;
}

function formatRole(role: string): string {
  return role.replace("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Page({ children }: { children: ReactNode }) {
  return (
    <main className="shell">
      {children}
      <footer className="build-info">Build {commitSha}</footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

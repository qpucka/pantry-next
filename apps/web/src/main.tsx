import { FormEvent, useEffect, useState } from "react";
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

interface OrganizationsResponse {
  memberships: Membership[];
}

interface RegisterForm {
  organizationName: string;
  email: string;
  password: string;
  timezone: string;
}

type View = "sign-in" | "register";

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
    const message = typeof body?.error === "string" ? body.error : "Something went wrong. Please try again.";
    throw new Error(message);
  }
  return body as T;
}

function initialTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago";
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [view, setView] = useState<View>("sign-in");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadSession(): Promise<void> {
    try {
      const session = await api<SessionResponse>("/api/auth/me");
      setUser(session.user);
      const organizations = await api<OrganizationsResponse>("/api/organizations");
      setMemberships(organizations.memberships);
    } catch {
      setUser(null);
      setMemberships([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSession();
  }, []);

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
    try {
      await api("/api/register", {
        method: "POST",
        body: JSON.stringify(form),
      });
      await loadSession();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Registration failed.");
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
      setView("sign-in");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Sign-out failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <Page><div className="loading" role="status">Loading your pantry workspace…</div></Page>;
  }

  if (user) {
    return (
      <Page>
        <section className="card workspace" aria-labelledby="workspace-title">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Pantry Next</p>
              <h1 id="workspace-title">Your organizations</h1>
            </div>
            <button className="button button-secondary" type="button" onClick={() => void handleLogout()} disabled={busy}>
              Sign out
            </button>
          </div>
          <p className="message">Signed in as <strong>{user.email || "your account"}</strong>.</p>
          {error && <ErrorMessage message={error} />}
          {memberships.length === 0 ? (
            <div className="empty-state">You do not belong to an organization yet.</div>
          ) : (
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
          )}
        </section>
      </Page>
    );
  }

  return (
    <Page>
      <section className="card auth-card" aria-labelledby="auth-title">
        <p className="eyebrow">Pantry Next</p>
        <h1 id="auth-title">{view === "sign-in" ? "Welcome back" : "Create your pantry"}</h1>
        <p className="message">
          {view === "sign-in" ? "Sign in to manage your organization’s waiting room." : "Set up an organization and invite your team as the app grows."}
        </p>
        <div className="tabs" role="tablist" aria-label="Account actions">
          <button className={view === "sign-in" ? "tab active" : "tab"} type="button" onClick={() => { setView("sign-in"); setError(""); }}>Sign in</button>
          <button className={view === "register" ? "tab active" : "tab"} type="button" onClick={() => { setView("register"); setError(""); }}>Register</button>
        </div>
        {error && <ErrorMessage message={error} />}
        {view === "sign-in" ? (
          <SignInForm busy={busy} onSubmit={(email, password) => void handleSignIn(email, password)} />
        ) : (
          <RegisterForm busy={busy} onSubmit={(form) => void handleRegister(form)} />
        )}
      </section>
    </Page>
  );
}

function SignInForm({ busy, onSubmit }: { busy: boolean; onSubmit: (email: string, password: string) => void }) {
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit(String(form.get("email") || "").trim(), String(form.get("password") || ""));
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>Email<input name="email" type="email" autoComplete="email" required /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      <button className="button" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}

function RegisterForm({ busy, onSubmit }: { busy: boolean; onSubmit: (form: RegisterForm) => void }) {
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
      <label>Password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /><span className="hint">Use at least 12 characters.</span></label>
      <label>Time zone<input name="timezone" type="text" defaultValue={initialTimezone()} maxLength={80} required /></label>
      <button className="button" type="submit" disabled={busy}>{busy ? "Creating organization…" : "Create organization"}</button>
    </form>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return <div className="error" role="alert">{message}</div>;
}

function formatRole(role: string): string {
  return role.replace("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Page({ children }: { children: React.ReactNode }) {
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

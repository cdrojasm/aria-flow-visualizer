import { FormEvent, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { isOidcEnabled } from "@/lib/api/auth.functions";

const FALLBACK_REDIRECT = "/dashboard";

function safeRedirect(value: string | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") && value !== "/login"
    ? value
    : FALLBACK_REDIRECT;
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const { user, signIn } = useRole();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oidcEnabled, setOidcEnabled] = useState(false);
  const destination = safeRedirect(redirect);

  useEffect(() => {
    isOidcEnabled().then(setOidcEnabled).catch(() => setOidcEnabled(false));
  }, []);

  useEffect(() => {
    if (user) navigate({ to: destination as never, replace: true });
  }, [destination, navigate, user]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signIn(email, password);
    } catch {
      setError("Correo o contraseña inválidos.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl"
      >
        <div className="mb-5 flex items-center gap-2 text-text-primary">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          <h1 className="text-lg font-bold">Acceso a ARIA</h1>
        </div>
        <label className="block text-sm font-medium">
          Correo
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
          />
        </label>
        <label className="mt-4 block text-sm font-medium">
          Contraseña
          <input
            required
            type="password"
            minLength={8}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
          />
        </label>
        {error && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <button
          disabled={loading}
          className="mt-5 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {loading ? "Ingresando…" : "Ingresar"}
        </button>
        {oidcEnabled && (
          <a href="/api/v0/auth/oidc/start" className="mt-3 block w-full rounded-md border border-border px-4 py-2 text-center text-sm font-medium">
            Ingresar con Nauthilus
          </a>
        )}
      </form>
    </main>
  );
}

import { Brand } from "../components";

export const metadata = { title: "Sign in · CREEPTEE HQ" };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const configured = Boolean(process.env.APP_PASSWORD);
  return (
    <main className="login">
      <form method="post" action="/api/login" className="panel">
        <h1 style={{ display: "contents" }}>
          <Brand />
        </h1>
        {configured ? (
          <>
            <label htmlFor="password" className="lbl">
              Password
            </label>
            <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
            {error && <p className="err">That password didn&apos;t match. Try again.</p>}
            <button type="submit" className="btn primary">
              Enter the crypt
            </button>
          </>
        ) : (
          <p className="err">
            No password is set yet. Add an <code>APP_PASSWORD</code> environment variable, then redeploy.
          </p>
        )}
      </form>
    </main>
  );
}

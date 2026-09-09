/**
 * Refusing to shoot before there is anything to shoot.
 *
 * Without this the first thing that happens is the take reporting
 * `net::ERR_CONNECTION_REFUSED` from inside `Demo.open`, with a stack pointing
 * into the fixture — which says nothing about the actual problem. The demo has
 * one precondition it can check and it is not the script's to fix, so it names
 * it instead.
 *
 * One probe where PFA has two: Halcyon is a static Vite app with no API behind
 * it and no account to sign in to, so the front answering is the whole question.
 */

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

async function reachable(url: string): Promise<boolean> {
  try {
    // Any answer at all is enough — a redirect still proves something is
    // listening, which is the whole question here.
    await fetch(url, { signal: AbortSignal.timeout(3000), redirect: "manual" });
    return true;
  } catch {
    return false;
  }
}

export default async function preflight(): Promise<void> {
  if (await reachable(`${BASE_URL}/`)) {
    return;
  }

  throw new Error(
    "\n\n  The demo cannot record yet:\n\n" +
      `  - Nothing is listening on ${BASE_URL}.\n` +
      "    The demo films the console; it does not start it. In another shell:\n" +
      "      pnpm dev\n" +
      "    Vite's default port is 5173 — if it announced another one, set E2E_BASE_URL.\n",
  );
}

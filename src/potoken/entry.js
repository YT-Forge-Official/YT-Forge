/**
 * PO Token minter — runs inside a hidden renderer.
 *
 * YouTube gates streaming URLs behind a "Proof of Origin" token that only a
 * real browser can produce: BotGuard ships an obfuscated JS VM that has to be
 * executed against a live DOM before Google's WAA service will hand back an
 * integrity token. We happen to *be* a browser, so instead of shipping a
 * headless-Chrome or jsdom sidecar (the usual yt-dlp answer) we run the VM in
 * an offscreen window and hand the resulting token to yt-dlp.
 *
 * Network calls are bridged to the main process (see preload.js) so this page
 * never needs cross-origin privileges of its own.
 */
import { getChallenge, BotGuardClient } from 'bgutils-js/botguard';
import { WebPoMinter } from 'bgutils-js/webpo';
import { buildURL, getHeaders } from 'bgutils-js/utils';

// YouTube's public BotGuard program id. Not a secret — it selects which
// challenge WAA serves, and every web client sends this exact value.
const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';

async function bridgeFetch(url, init = {}) {
  const res = await window.__potBridge.fetch(String(url), {
    method: init.method || 'GET',
    headers: init.headers || {},
    body: typeof init.body === 'string' ? init.body : undefined,
  });
  if (res.error) throw new Error(res.error);
  return new Response(res.body, { status: res.status, statusText: res.statusText });
}

/**
 * A minter is good for many tokens, so building one is the expensive part
 * (a WAA round trip plus a BotGuard VM run). Keep the promise, not the
 * result, so concurrent callers share one in-flight build.
 */
let minterPromise = null;
let minterBuiltAt = 0;

// WAA reports an `estimatedTtlSecs` (usually 12h). Rebuild well before that;
// a stale minter yields tokens the video server rejects with a 403.
let minterTtlMs = 6 * 60 * 60 * 1000;

async function buildMinter() {
  const challenge = await getChallenge({
    requestKey: REQUEST_KEY,
    fetchFunction: bridgeFetch,
  });

  const script = challenge?.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue;
  if (!script) throw new Error('BotGuard challenge carried no interpreter script');

  // Defines challenge.globalName on window as a side effect.
  new Function(script)();

  const client = await BotGuardClient.create({
    program: challenge.program,
    globalName: challenge.globalName,
    globalObject: window,
  });

  // BotGuard fills this array with the minter factory during the snapshot.
  const webPoSignalOutput = [];
  const botguardResponse = await client.snapshot({ webPoSignalOutput });

  const res = await bridgeFetch(buildURL('GenerateIT', false), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify([REQUEST_KEY, botguardResponse]),
  });
  if (!res.ok) throw new Error(`WAA GenerateIT returned ${res.status}`);

  const [integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken] = await res.json();
  if (!integrityToken) throw new Error('WAA GenerateIT returned no integrity token');

  if (Number.isFinite(estimatedTtlSecs) && estimatedTtlSecs > 0) {
    minterTtlMs = Math.max(estimatedTtlSecs * 1000 * 0.5, 60 * 1000);
  }

  return WebPoMinter.create(
    { integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken },
    webPoSignalOutput,
  );
}

/**
 * @param {string} contentBinding video id (what YouTube's own web client binds
 *   to), or a visitor/datasync id for session-bound tokens.
 */
window.__mintPoToken = async (contentBinding) => {
  if (!contentBinding) throw new Error('mintPoToken needs a content binding');

  if (minterPromise && Date.now() - minterBuiltAt > minterTtlMs) minterPromise = null;

  if (!minterPromise) {
    minterBuiltAt = Date.now();
    minterPromise = buildMinter().catch((err) => {
      // Don't cache a failed build — the next call should get a fresh attempt.
      minterPromise = null;
      throw err;
    });
  }

  const minter = await minterPromise;
  return minter.mintAsWebsafeString(contentBinding);
};

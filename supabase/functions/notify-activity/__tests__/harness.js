/**
 * Runs the REAL `notify-activity/index.ts` — the deployed source, not a copy — inside jest.
 *
 * Why not just read the code and assert on it: the two things most worth proving here are which
 * signing key a request uses and what bytes actually go on the wire, and both are decided at
 * runtime, several branches deep. A test that re-implements the selection would agree with itself
 * forever. This one loads the file, strips its two Deno/npm imports, runs it through babel's
 * TypeScript preset, and evaluates it with every ambient it touches replaced by a spy:
 *
 *   Deno.env  -> a fixed secret table (fake .p8s whose *bytes* identify which key was chosen)
 *   Deno.serve -> captures the request handler instead of listening
 *   crypto.subtle -> records which key material was imported; signs with a constant
 *   fetch     -> records URL + headers + body, and replies with whatever the test scripts
 *   createClient / serviceClient -> a chainable fake whose queries the test answers
 *
 * So a test can drive the whole handler and then read the exact APNs URL, the exact `kid` in the
 * provider JWT, and the exact serialized payload.
 */

const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const SOURCE = path.join(__dirname, '..', 'index.ts');

// Fake PEMs. The base64 body decodes to a marker string, so `crypto.subtle.importKey` receiving it
// is direct evidence of *which* key the function chose — the thing a wrong pairing gets wrong.
const SANDBOX_PEM = `-----BEGIN PRIVATE KEY-----\n${Buffer.from('SANDBOX-KEY-MATERIAL').toString('base64')}\n-----END PRIVATE KEY-----`;
const PRODUCTION_PEM = `-----BEGIN PRIVATE KEY-----\n${Buffer.from('PRODUCTION-KEY-MATERIAL').toString('base64')}\n-----END PRIVATE KEY-----`;

const DEFAULT_ENV = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  APNS_KEY_P8: SANDBOX_PEM,
  APNS_KEY_ID: 'SANDBOXKEY',
  APNS_KEY_P8_PRODUCTION: PRODUCTION_PEM,
  APNS_KEY_ID_PRODUCTION: 'PRODKEY123',
  APNS_TEAM_ID: 'TEAMID1234',
};

let compiled = null;
function compile() {
  if (compiled) return compiled;
  const source = fs.readFileSync(SOURCE, 'utf8');
  // The two module imports are the only things `new Function` cannot host; everything they provide
  // is injected as a parameter instead.
  const withoutImports = source.replace(/^import[^;]*;$/gm, '');
  compiled = babel.transformSync(withoutImports, {
    filename: 'index.ts',
    configFile: false,
    babelrc: false,
    presets: [[require.resolve('@babel/preset-typescript'), { allExtensions: true }]],
  }).code;
  return compiled;
}

class FakeResponse {
  constructor(body, init) {
    this.bodyText = body;
    this.status = init?.status ?? 200;
    this.headers = init?.headers;
  }
  async json() {
    return JSON.parse(this.bodyText);
  }
  async text() {
    return this.bodyText;
  }
}

/** What `postToApns` needs from a fetch result: ok/status, a drainable body, and text(). */
function apnsReply({ status = 200, reason = null }) {
  const bodyText = reason === null ? '' : JSON.stringify({ reason });
  return {
    ok: status >= 200 && status < 300,
    status,
    body: { cancel: async () => undefined },
    text: async () => bodyText,
  };
}

/**
 * A chainable stand-in for supabase-js' query builder. It records the whole chain and hands it to
 * the test's `query` callback, so a test says what each table returns rather than mocking methods.
 */
function makeServiceClient(query, writes) {
  function builder(table) {
    const state = { table, op: 'select', filters: [], payload: null };
    const self = {
      select(columns) { state.columns = columns; return self; },
      delete() { state.op = 'delete'; return self; },
      update(payload) { state.op = 'update'; state.payload = payload; return self; },
      eq(column, value) { state.filters.push(['eq', column, value]); return self; },
      or(expr) { state.filters.push(['or', expr]); return self; },
      is(column, value) { state.filters.push(['is', column, value]); return self; },
      not(column, op, value) { state.filters.push(['not', column, op, value]); return self; },
      order(column, opts) { state.order = [column, opts]; return self; },
      maybeSingle() { return Promise.resolve(settle(true)); },
      then(resolve, reject) { return Promise.resolve(settle(false)).then(resolve, reject); },
    };
    function settle(single) {
      if (state.op !== 'select') {
        writes.push({ ...state, filters: [...state.filters] });
        return { data: null, error: null };
      }
      const result = query({ ...state, filters: [...state.filters], single });
      return result ?? { data: single ? null : [], error: null };
    }
    return self;
  }
  return { from: builder };
}

function decodeJwtHeader(jwt) {
  const [header] = jwt.split('.');
  return JSON.parse(Buffer.from(header.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

function decodeJwtClaims(jwt) {
  const claims = jwt.split('.')[1];
  return JSON.parse(Buffer.from(claims.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

/**
 * Load the function.
 *
 * @param query   answers a database read: `({ table, op, filters, single }) => ({ data, error })`
 * @param apns    answers an APNs POST: `(call, index) => ({ status, reason })`
 * @param env     overrides for the secret table
 * @param user    the caller `auth.getUser()` resolves to
 */
function loadNotifyActivity({ query = () => ({ data: null, error: null }), apns = () => ({ status: 200 }), env = {}, user = { id: 'sender-uuid' } } = {}) {
  const captured = {};
  const apnsCalls = [];
  const importedKeys = [];
  const writes = [];
  const secrets = { ...DEFAULT_ENV, ...env };

  const DenoStub = {
    env: { get: (name) => (name in secrets ? secrets[name] : undefined) },
    serve: (handler) => { captured.handler = handler; },
  };

  const cryptoStub = {
    subtle: {
      importKey: async (_format, keyData, _algo, _extractable, _usages) => {
        const marker = Buffer.from(keyData).toString('utf8');
        importedKeys.push(marker);
        return { marker };
      },
      sign: async (_algo, key) => new TextEncoder().encode(`sig-${key.marker}`),
    },
  };

  const fetchStub = async (url, init) => {
    const call = {
      url,
      headers: init.headers,
      body: init.body,
      jwt: String(init.headers.authorization).replace(/^bearer /, ''),
    };
    call.jwtHeader = decodeJwtHeader(call.jwt);
    call.jwtClaims = decodeJwtClaims(call.jwt);
    call.payload = JSON.parse(init.body);
    apnsCalls.push(call);
    return apnsReply(apns(call, apnsCalls.length - 1) ?? { status: 200 });
  };

  const createClientStub = () => ({
    auth: { getUser: async () => ({ data: { user }, error: user ? null : new Error('no user') }) },
  });
  const serviceClientStub = () => makeServiceClient(query, writes);

  const quietConsole = { error: () => {}, log: () => {}, warn: () => {} };

  // eslint-disable-next-line no-new-func
  const run = new Function(
    'Deno', 'crypto', 'fetch', 'Response', 'createClient', 'serviceClient', 'jsonHeaders', 'console', 'TextEncoder', 'btoa', 'atob',
    compile(),
  );
  run(DenoStub, cryptoStub, fetchStub, FakeResponse, createClientStub, serviceClientStub, { 'Content-Type': 'application/json' }, quietConsole, TextEncoder, btoa, atob);

  return {
    apnsCalls,
    importedKeys,
    writes,
    async post(body, headers = { Authorization: 'Bearer caller-jwt' }) {
      const req = {
        method: 'POST',
        headers: { get: (name) => headers[name] ?? null },
        json: async () => body,
      };
      const res = await captured.handler(req);
      return { status: res.status, body: await res.json() };
    },
  };
}

module.exports = {
  loadNotifyActivity,
  SANDBOX_PEM,
  PRODUCTION_PEM,
  DEFAULT_ENV,
  SANDBOX_MARKER: 'SANDBOX-KEY-MATERIAL',
  PRODUCTION_MARKER: 'PRODUCTION-KEY-MATERIAL',
};

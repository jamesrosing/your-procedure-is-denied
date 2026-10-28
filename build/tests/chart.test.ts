import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAuthorityStatus, policyStatusExecutor, POLICY_STATUS_TOOL } from '../src/chart.js';

type Captured = { url: string; headers: Record<string, string> };

function fakeFetch(status: number, body: unknown, captured: Captured[] = []): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => { headers[k] = v; });
    captured.push({ url: String(input), headers });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

// The live shape, as returned on Oct 28, 2026 (one row kept per case).
const INDEX = {
  generated_at: '2026-09-29T04:58:00.233Z',
  corpus: { documents: 37838, policies: 25014 },
  authorities: [
    { id: 'cms', name: 'Centers for Medicare & Medicaid Services', kind: 'federal_agency', access_class: null, documents: 14676, cataloged: 13960, policies: 357, last_changed: '2026-09-27T06:42:47.268Z', oldest_check: '2026-09-28T01:05:46.494Z', endpoints: { total: 14534, retired: 15, delisted: 0 } },
    { id: 'aetna', name: 'Aetna', kind: 'national_payer', access_class: null, documents: 0, cataloged: 0, policies: 0, last_changed: null, oldest_check: null, endpoints: { total: 0, retired: 0, delisted: 0 } },
  ],
  policies: [{ id: 'cms:NCD-20.4', authority_id: 'cms', external_id: 'NCD-20.4', title: 'Implantable Cardioverter Defibrillators', effective_start: '2018-02-15', effective_end: null, catalog_status: 'cataloged' }],
};

describe('parseAuthorityStatus', () => {
  test('reads the live shape, trims timestamps to the day, and still finds rows under older names', () => {
    const s = parseAuthorityStatus(INDEX, 'cms');
    assert.deepEqual(s, { id: 'cms', name: 'Centers for Medicare & Medicaid Services', lastChange: '2026-09-27', lastCheck: '2026-09-28', policies: 357, documents: 14676 });
    assert.deepEqual(parseAuthorityStatus(INDEX.authorities, 'CMS')?.lastChange, '2026-09-27');
    assert.deepEqual(parseAuthorityStatus({ rows: INDEX.authorities }, 'cms')?.policies, 357);
    assert.deepEqual(parseAuthorityStatus([{ id: 'cms', lastChange: '2026-09-27', 'last-check': '2026-09-28' }], 'cms'), { id: 'cms', lastChange: '2026-09-27', lastCheck: '2026-09-28' });
    assert.deepEqual(parseAuthorityStatus([{ id: 'cms', authority: 'CMS', last_change: '2026-09-27', oldest_live_check: '2026-09-28' }], 'cms'), { id: 'cms', name: 'CMS', lastChange: '2026-09-27', lastCheck: '2026-09-28' });
  });

  test('an authority with nothing indexed reports no dates; an unknown authority is null', () => {
    assert.deepEqual(parseAuthorityStatus(INDEX, 'aetna'), { id: 'aetna', name: 'Aetna', policies: 0, documents: 0 });
    assert.equal(parseAuthorityStatus(INDEX, 'nope'), null);
    assert.equal(parseAuthorityStatus('not json shaped', 'cms'), null);
  });
});

describe('policyStatusExecutor', () => {
  const CALL = { name: 'policy_status', input: { authority: 'cms', code: '92928', date_of_service: '2026-02-03' } };

  test('sends the key as a bearer token with the code and date, and answers with the freshness line labeled as a live CHART query', async () => {
    const captured: Captured[] = [];
    const run = policyStatusExecutor({ apiKey: 'secret-key', fetch: fakeFetch(200, INDEX, captured) });
    const out = await run(CALL);
    assert.ok(out);
    assert.equal(out.ok, true);
    assert.equal(out.live, true);
    assert.equal(captured[0]!.headers['authorization'], 'Bearer secret-key');
    assert.match(captured[0]!.url, /^https:\/\/chart\.hemeehr\.com\/v1\/coverage-index\?code=92928&as_of=2026-02-03$/);
    assert.match(out.content, /last change 2026-09-27/);
    assert.match(out.content, /last live check 2026-09-28/);
    assert.match(out.content, /live CHART query, prior-work data source/);
    assert.match(out.content, /criteria in this request are unchanged/);
    assert.equal(out.note, 'cms: criteria last changed 2026-09-27, last checked 2026-09-28');
    assert.ok(!out.content.includes('secret-key'));
  });

  test('defaults the authority to cms and ignores other tools', async () => {
    const run = policyStatusExecutor({ apiKey: 'k', fetch: fakeFetch(200, INDEX) });
    const out = await run({ name: 'policy_status', input: { code: '92928', date_of_service: '2026-02-03' } });
    assert.equal(out?.ok, true);
    assert.match(out!.content, /\(cms\)/);
    assert.equal(await run({ name: 'read_entry', input: { id: 'note-001' } }), null);
  });

  test('a 402 or 401 says the key is the problem and tells the model to proceed without it; a bad code or date never leaves the process', async () => {
    const paid = policyStatusExecutor({ apiKey: 'k', fetch: fakeFetch(402, { error: 'PAYMENT_REQUIRED' }) });
    const out = await paid(CALL);
    assert.equal(out?.ok, false);
    assert.equal(out?.live, true);
    assert.match(out!.content, /HTTP 402: key missing/);
    assert.match(out!.content, /criteria you were given still apply/);
    const captured: Captured[] = [];
    const run = policyStatusExecutor({ apiKey: 'k', fetch: fakeFetch(200, INDEX, captured) });
    assert.equal((await run({ name: 'policy_status', input: { code: 'drop table', date_of_service: '2026-02-03' } }))?.ok, false);
    assert.equal((await run({ name: 'policy_status', input: { code: '92928', date_of_service: 'yesterday' } }))?.ok, false);
    assert.equal(captured.length, 0);
  });

  test('one metered query per authority, code, and date for the life of the executor; failures are not cached', async () => {
    const captured: Captured[] = [];
    const run = policyStatusExecutor({ apiKey: 'k', fetch: fakeFetch(200, INDEX, captured) });
    const first = await run(CALL);
    const second = await run({ name: 'policy_status', input: { authority: 'CMS', code: '92928', date_of_service: '2026-02-03' } });
    await run({ name: 'policy_status', input: { code: '33533', date_of_service: '2026-02-03' } });
    assert.equal(captured.length, 2);
    assert.equal(second?.ok, true);
    assert.equal(second?.content, first?.content);
    assert.match(second!.note!, /cached this run/);
    const uncached = policyStatusExecutor({ apiKey: 'k', fetch: fakeFetch(200, INDEX, captured), cache: false });
    await uncached(CALL); await uncached(CALL);
    assert.equal(captured.length, 4);
    let status = 402;
    const flaky = policyStatusExecutor({ apiKey: 'k', fetch: (async (...a: Parameters<typeof fetch>) => fakeFetch(status, status === 200 ? INDEX : { error: 'x' })(...a)) as typeof fetch });
    assert.equal((await flaky(CALL))?.ok, false);
    status = 200;
    assert.equal((await flaky(CALL))?.ok, true);
  });

  test('a network failure is reported by error class, not thrown into the tool loop', async () => {
    const run = policyStatusExecutor({ apiKey: 'k', fetch: (async () => { throw new TypeError('fetch failed'); }) as typeof fetch });
    const out = await run(CALL);
    assert.equal(out?.ok, false);
    assert.match(out!.content, /CHART unreachable: TypeError/);
  });

  test('the tool definition names the three inputs and says it returns no policy text', () => {
    assert.equal(POLICY_STATUS_TOOL.name, 'policy_status');
    const props = (POLICY_STATUS_TOOL.inputSchema as { properties: Record<string, unknown> }).properties;
    assert.deepEqual(Object.keys(props).sort(), ['authority', 'code', 'date_of_service']);
    assert.match(POLICY_STATUS_TOOL.description, /does not return policy text/);
    assert.match(POLICY_STATUS_TOOL.description, /pre-existing/);
  });
});

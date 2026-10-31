// policy_status: a third tool for the agentic proposer, a live query against
// CHART (chart.hemeehr.com), the author's pre-existing coverage index. It is a
// new integration of a hosted API, in the same category as the model call,
// and it is labeled as a prior-work data source wherever its answer appears.
//
// What it returns: when the named authority's coverage material last changed
// and was last checked, from the census-wide coverage index. It never returns
// policy text. The synthetic payers here are fictional, so the lookup is keyed
// on a real authority id (CMS by default) and the procedure code, and no
// patient data is sent: the request carries an authority id, a code, and a date.
import type { ToolCall, ToolDefinition, ToolOutcome } from './provider.js';

export const CHART_BASE_URL = 'https://chart.hemeehr.com';
export const DEFAULT_AUTHORITY = 'cms';

export const POLICY_STATUS_TOOL: ToolDefinition = {
  name: 'policy_status',
  description:
    'Live query against CHART, a pre-existing coverage index of US payer policy. Returns when the named authority\'s coverage material last changed and was last checked, so you can say whether the criteria you were given are current. It does not return policy text: the criteria in this request are the criteria. Use authority "cms" unless told otherwise.',
  inputSchema: {
    type: 'object',
    required: ['code', 'date_of_service', 'why'],
    properties: {
      authority: { type: 'string', description: 'CHART authority id, e.g. cms, ma-uhc, cigna; defaults to cms' },
      code: { type: 'string', description: 'the CPT, HCPCS, or ICD-10 code on the denial' },
      date_of_service: { type: 'string', description: 'YYYY-MM-DD' },
      // The API returns only redacted thinking, so the model states its reason here; the trace and the viewer show it.
      why: { type: 'string', description: 'one sentence: what you want to learn from this query and why now' },
    },
    additionalProperties: false,
  },
};

export interface AuthorityStatus {
  id: string;
  name?: string;
  lastChange?: string;
  lastCheck?: string;
  policies?: number;
  documents?: number;
}

const KEYS = {
  name: ['authority', 'name', 'label'],
  lastChange: ['last_changed', 'last_change', 'lastChange', 'last-change', 'changed_at'],
  lastCheck: ['oldest_check', 'oldest_live_check', 'oldestLiveCheck', 'last_check', 'lastCheck', 'last-check', 'checked_at', 'last_verified'],
  policies: ['policies', 'policy_count'],
  documents: ['documents', 'document_count'],
};

function pick(row: Record<string, unknown>, names: string[]): unknown {
  for (const n of names) if (row[n] !== undefined && row[n] !== null && row[n] !== '') return row[n];
  return undefined;
}

// The index (confirmed live Oct 28, 2026) is {generated_at, corpus, authorities:[{id, name,
// kind, documents, cataloged, policies, last_changed, oldest_check, endpoints}], policies:[...]}.
// The finder stays lenient so a renamed field degrades to 'not reported' rather than a failure.
function rows(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    for (const k of ['authorities', 'rows', 'index', 'items', 'data']) if (Array.isArray(o[k])) return rows(o[k]);
    for (const v of Object.values(o)) if (Array.isArray(v) && v.some(x => x && typeof x === 'object' && 'id' in (x as object))) return rows(v);
  }
  return [];
}

export function parseAuthorityStatus(body: unknown, authority: string): AuthorityStatus | null {
  const want = authority.trim().toLowerCase();
  const row = rows(body).find(r => String(r['id'] ?? '').toLowerCase() === want || String(r['authority_id'] ?? '').toLowerCase() === want);
  if (!row) return null;
  // Timestamps come back as ISO instants; the model only needs the day.
  const str = (v: unknown) => (v === undefined ? undefined : String(v).replace(/T\d\d:\d\d:\d\d(\.\d+)?Z$/, ''));
  const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const out: AuthorityStatus = { id: authority };
  const name = str(pick(row, KEYS.name)); if (name) out.name = name;
  const lc = str(pick(row, KEYS.lastChange)); if (lc) out.lastChange = lc;
  const lk = str(pick(row, KEYS.lastCheck)); if (lk) out.lastCheck = lk;
  const p = num(pick(row, KEYS.policies)); if (p !== undefined) out.policies = p;
  const d = num(pick(row, KEYS.documents)); if (d !== undefined) out.documents = d;
  return out;
}

export interface PolicyStatusOptions {
  apiKey: string;
  baseURL?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  cache?: boolean; // default true: one metered query per authority for the life of this executor
}

const LABEL = 'live CHART query, prior-work data source';

export function policyStatusExecutor(options: PolicyStatusOptions): (call: ToolCall) => Promise<ToolOutcome | null> {
  const doFetch = options.fetch ?? fetch;
  const base = (options.baseURL ?? CHART_BASE_URL).replace(/\/$/, '');
  // The index is metered per request and its answer (when an authority's
  // material last changed) is the same for every case in a run: the live
  // endpoint returns the whole authority table whatever code is passed. So the
  // memo is keyed on the authority alone and one executor shared across a run
  // makes one metered query per authority. Only successful answers are kept; a
  // 402 or an outage is retried on the next call.
  const memo = new Map<string, ToolOutcome>();
  const query = async (authority: string, code: string, asOf: string): Promise<ToolOutcome> => {
    let res: Response;
    try {
      res = await doFetch(`${base}/v1/coverage-index?code=${encodeURIComponent(code)}&as_of=${encodeURIComponent(asOf)}`, {
        headers: { authorization: `Bearer ${options.apiKey}`, accept: 'application/json' },
        signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
      });
    } catch (error: unknown) {
      return { ok: false, content: `CHART unreachable: ${error instanceof Error ? error.constructor.name : 'Error'}`, live: true, note: 'CHART unreachable' };
    }
    if (!res.ok) {
      const why = res.status === 402 || res.status === 401 ? 'key missing, unknown, or plan required' : 'request failed';
      return { ok: false, content: `CHART returned HTTP ${res.status}: ${why}. Proceed without it; the criteria you were given still apply.`, live: true, note: `CHART HTTP ${res.status}` };
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { ok: false, content: 'CHART answered with something other than JSON', live: true, note: 'CHART bad body' };
    }
    const status = parseAuthorityStatus(body, authority);
    if (!status) return { ok: false, content: `CHART has no authority "${authority}" in its coverage index`, live: true, note: `no authority ${authority}` };
    const parts = [
      `CHART coverage index, authority ${status.name ? `${status.name} (${status.id})` : status.id}`,
      status.lastChange ? `last change ${status.lastChange}` : 'last change not reported',
      status.lastCheck ? `last live check ${status.lastCheck}` : 'last check not reported',
      ...(status.policies !== undefined ? [`${status.policies} policies indexed`] : []),
      `queried for ${code} as of ${asOf}`,
      `${LABEL}; this is corpus freshness, not policy text, and the criteria in this request are unchanged`,
    ];
    const note = `${status.id}: criteria last changed ${status.lastChange ?? 'unknown'}, last checked ${status.lastCheck ?? 'unknown'}`;
    return { ok: true, content: parts.join('. ') + '.', live: true, note };
  };
  return async call => {
    if (call.name !== 'policy_status') return null;
    const authority = String(call.input['authority'] ?? DEFAULT_AUTHORITY).trim().toLowerCase() || DEFAULT_AUTHORITY;
    // Models write codes the way denials print them: "MS-DRG 871", "CMG 0104",
    // "HIPPS KDOB1". The index wants the bare code.
    const code = String(call.input['code'] ?? '').trim().replace(/^(?:MS-?DRG|DRG|CMG|HIPPS|CPT|HCPCS|ICD-?10(?:-CM)?)[:\s]*/i, '').replace(/\s+/g, '');
    const asOf = String(call.input['date_of_service'] ?? '').trim();
    if (!/^[A-Za-z0-9.-]{1,12}$/.test(code)) return { ok: false, content: 'policy_status needs the procedure or diagnosis code on the denial', live: true, note: 'bad code' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return { ok: false, content: 'policy_status needs date_of_service as YYYY-MM-DD', live: true, note: 'bad date' };
    const key = authority;
    const hit = options.cache !== false ? memo.get(key) : undefined;
    if (hit) return { ...hit, content: hit.content.replace(/queried for \S+ as of \d{4}-\d{2}-\d{2}/, `queried for ${code} as of ${asOf}`), note: `${hit.note} (cached this run)` };
    const out = await query(authority, code, asOf);
    if (out.ok && options.cache !== false) memo.set(key, out);
    return out;
  };
}

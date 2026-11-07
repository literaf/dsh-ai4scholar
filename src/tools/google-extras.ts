import type { Context } from '@deepseek-ai/cordis'
import { researchMeta } from '../research-meta.js'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { InferValue } from '@deepseek-ai/dsh-tools'
import { CREDITS_SCHEMA, compact, creditsMeta, formatCredits, int, isRecord, presentGenericWithCredits, str } from '../paper.js'
import type { CreditsValue } from '../paper.js'
import { boundResults, requireQuery } from '../runtime.js'
import type { Runtime } from '../runtime.js'
import { scholarId } from './google-scholar.js'

const PROFILE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    source: { type: 'string', required: true, enum: ['google-scholar'] },
    id: { type: 'string' }, name: { type: 'string', required: true },
    url: { type: 'string' }, affiliations: { type: 'string' },
    email: { type: 'string', description: 'Public verification text, not necessarily an email address.' },
    citationCount: { type: 'integer' },
    interests: { type: 'array', required: true, items: { type: 'string' } },
  },
} as const
type Profile = InferValue<typeof PROFILE_SCHEMA>

function records(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.filter(isRecord) : [] }
function profile(record: Record<string, unknown>, fallbackId?: string): Profile | undefined {
  const name = str(record, 'name') ?? str(record, 'title')
  if (!name) return undefined
  const id = scholarId(record.authorId) ?? fallbackId
  const interests = Array.isArray(record.interests) ? record.interests.flatMap((x) => {
    const value = typeof x === 'string' ? x.trim() : isRecord(x) ? str(x, 'title') : undefined
    return value ? [value] : []
  }) : []
  return compact({ source: 'google-scholar' as const, id, name, interests,
    url: id ? `https://scholar.google.com/citations?user=${encodeURIComponent(id)}` : undefined,
    affiliations: str(record, 'affiliations'), email: str(record, 'email'), citationCount: int(record, 'citedBy'),
  })
}

function profileText(p: Profile, i: number): string {
  return `${i}. ${p.name}${p.url ? ` — ${p.url}` : ''}\n   Google Scholar author ID: ${p.id ?? 'not provided'}\n   ${[p.affiliations, p.email, p.citationCount !== undefined ? `${p.citationCount} citations (Google Scholar)` : undefined, p.interests.join(', ')].filter(Boolean).join(' · ')}`
}
function textResult(text: string, credits: CreditsValue | undefined): { type: 'text'; text: string }[] {
  return [{ type: 'text', text: [text, formatCredits(credits)].filter(Boolean).join('\n\n') }]
}
function nativeId(value: string, label: string): string {
  const id = requireQuery(value)
  if (!/^[\w-]+$/.test(id)) throw new Error(`${label} must be the platform-native identifier returned by Google Scholar, not a URL, DOI, or another platform's ID.`)
  return id
}

export function applyGoogleExtraTools(ctx: Context, runtime: Runtime): void {
  ctx.tools.register(defineTool({
    name: 'search_google_scholar_profiles',
    description: 'Find scholars by name on Google Scholar. Returns candidate IDs, affiliations, interests and citation counts. Disambiguate same-name people using affiliations before selecting an author; do not merge IDs or metrics with Semantic Scholar. Costs credits.',
    parameters: {
      name: { type: 'string', required: true, description: 'Author name to search.' },
      after_author: { type: 'string', description: 'The exact nextPageToken from the preceding page; keep the same name.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        source: { type: 'string', required: true, enum: ['google-scholar'] }, query: { type: 'string', required: true },
        authors: { type: 'array', required: true, items: PROFILE_SCHEMA }, nextPageToken: { type: 'string' }, credits: CREDITS_SCHEMA,
      } },
      render: (_a, v) => textResult([`Google Scholar author candidates: ${v.query}`, ...v.authors.map(profileText),
        v.nextPageToken ? `Next page token: ${v.nextPageToken}` : '',
        'Next: select by name and affiliation, then get_google_scholar_author; compare metrics only with their source labels.'].filter(Boolean).join('\n\n'), v.credits),
      presentationMeta: (_a, v) => researchMeta(v, runtime.enabledTools, creditsMeta(v)),
    },
    timeoutMs: runtime.timeouts.tool, isConcurrencySafe: () => true,
    presentCall: (a) => ({ card: 'generic', kind: 'search', title: `Google Scholar authors: ${a.name}` }),
    presentResult: (_a, r) => presentGenericWithCredits('Google Scholar authors', r),
    async execute(args, exec) {
      const query = requireQuery(args.name)
      const apiKey = await runtime.requireApiKey()
      const res = await runtime.client.post<Record<string, unknown>>('/google-scholar/v1/profiles', compact({ authorName: query, afterAuthor: args.after_author }), { apiKey, signal: exec.signal })
      if (!res.ok) throw new Error(`Google Scholar author search failed: ${res.error}`)
      return compact({ source: 'google-scholar' as const, query, authors: records(res.data.profiles).map((x) => profile(x)).filter((x): x is Profile => x !== undefined),
        nextPageToken: str(res.data, 'nextPageToken'), credits: runtime.creditsOf(res, exec.agent) })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'get_google_scholar_author',
    description: 'Get a Google Scholar author profile and its available article list. Use an exact Google Scholar author ID from profile search. This endpoint does not guarantee a complete oeuvre and does not supply h-index. Article citationId is NOT the paper ID accepted by get_google_scholar_citation. Costs credits.',
    parameters: {
      author_id: { type: 'string', required: true, description: 'Exact Google Scholar author ID.' },
      sort: { type: 'string', enum: ['title', 'pubdate'], description: 'Sort article list by title or publication date.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        author: { ...PROFILE_SCHEMA, required: true },
        articles: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
          title: { type: 'string', required: true }, url: { type: 'string' }, authors: { type: 'string' }, year: { type: 'integer' },
          citationCount: { type: 'integer' }, citationId: { type: 'string' },
        } } },
        coAuthors: { type: 'array', required: true, items: PROFILE_SCHEMA }, warning: { type: 'string', required: true }, credits: CREDITS_SCHEMA,
      } },
      render: (_a, v) => textResult([profileText(v.author, 1), v.warning, ...v.articles.map((p, i) => `${i + 1}. ${p.title}\n   ${[p.authors, p.year, p.citationCount !== undefined ? `${p.citationCount} citations` : undefined, p.url, p.citationId ? `Author-page citationId: ${p.citationId}` : undefined].filter((x) => x !== undefined).join(' · ')}`),
        ...v.coAuthors.map((p, i) => `Co-author ${profileText(p, i + 1)}`)].join('\n\n'), v.credits),
      presentationMeta: (_a, v) => researchMeta(v, runtime.enabledTools, creditsMeta(v)),
    },
    timeoutMs: runtime.timeouts.tool, isConcurrencySafe: () => true,
    presentCall: (a) => ({ card: 'generic', kind: 'read', title: `Google Scholar author: ${a.author_id}` }),
    presentResult: (_a, r) => presentGenericWithCredits('Google Scholar author', r),
    async execute(args, exec) {
      const id = nativeId(args.author_id, 'author_id')
      const apiKey = await runtime.requireApiKey()
      const res = await runtime.client.post<Record<string, unknown>>('/google-scholar/v1/author', compact({ authorId: id, sort: args.sort }), { apiKey, signal: exec.signal })
      if (!res.ok) throw new Error(`Google Scholar author lookup failed: ${res.error}`)
      const author = profile(res.data, id)
      if (!author) throw new Error('Google Scholar returned no author profile; check the author ID or retry later.')
      const articles = records(res.data.articles).flatMap((p) => {
        const title = str(p, 'title')
        return title ? [compact({ title, url: str(p, 'link'), authors: str(p, 'authors'), year: int(p, 'year'), citationCount: int(p, 'citedBy'), citationId: scholarId(p.citationId) })] : []
      })
      return compact({ author, articles, coAuthors: records(res.data.coAuthors).map((p) => profile(p)).filter((p): p is Profile => p !== undefined),
        warning: 'Only the articles available from this profile response are shown. This is not a complete publication list; no h-index was supplied. Search an article title to obtain its Google Scholar paper ID for citation formats.',
        credits: runtime.creditsOf(res, exec.agent) })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'get_google_scholar_citation',
    description: 'Get formatted references (APA, MLA, etc.) and export links (BibTeX, EndNote, etc.) for ONE Google Scholar paper. Requires externalIds.GoogleScholar from search_google_scholar. Not a DOI, URL, author-page citationId, or cites/cluster ID. Different from auto_cite, which adds references to prose. Costs credits.',
    parameters: {
      paper_id: { type: 'string', required: true, description: 'Exact externalIds.GoogleScholar from a search result.' },
      language: { type: 'string', description: 'Citation language, e.g. en or zh-CN.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        paperId: { type: 'string', required: true },
        citations: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { style: { type: 'string', required: true }, text: { type: 'string', required: true } } } },
        links: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string', required: true }, url: { type: 'string', required: true } } } },
        credits: CREDITS_SCHEMA,
      } },
      render: (_a, v) => textResult([`Google Scholar reference formats for ${v.paperId}`, ...v.citations.map((c) => `${c.style}: ${c.text}`), ...v.links.map((l) => `${l.name}: ${l.url}`)].join('\n\n'), v.credits),
      presentationMeta: (_a, v) => researchMeta(v, runtime.enabledTools, creditsMeta(v)),
    },
    timeoutMs: runtime.timeouts.tool, isConcurrencySafe: () => true,
    presentCall: (a) => ({ card: 'generic', kind: 'read', title: `Google Scholar citation: ${a.paper_id}` }),
    presentResult: (_a, r) => presentGenericWithCredits('Google Scholar reference formats', r),
    async execute(args, exec) {
      const paperId = nativeId(args.paper_id, 'paper_id')
      const apiKey = await runtime.requireApiKey()
      const res = await runtime.client.post<Record<string, unknown>>('/google-scholar/v1/cite', compact({ paperId, language: args.language }), { apiKey, signal: exec.signal })
      if (!res.ok) throw new Error(`Google Scholar citation lookup failed: ${res.error}`)
      return compact({ paperId,
        citations: records(res.data.citations).flatMap((c) => { const style = str(c, 'title'); const text = str(c, 'snippet'); return style && text ? [{ style, text }] : [] }),
        links: records(res.data.links).flatMap((l) => { const name = str(l, 'name'); const url = str(l, 'link'); return name && url ? [{ name, url }] : [] }),
        credits: runtime.creditsOf(res, exec.agent) })
    },
  }))
}

const PATENT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    title: { type: 'string', required: true }, patentId: { type: 'string' }, publicationNumber: { type: 'string' },
    snippet: { type: 'string' }, inventor: { type: 'string' }, assignee: { type: 'string' },
    filingDate: { type: 'string' }, priorityDate: { type: 'string' }, publicationDate: { type: 'string' }, grantDate: { type: 'string' },
    language: { type: 'string' }, url: { type: 'string' }, pdfUrl: { type: 'string' },
    countryStatus: { type: 'object', additionalProperties: true },
  },
} as const
type Patent = InferValue<typeof PATENT_SCHEMA>

export function normalizePatent(p: unknown): Patent | undefined {
  if (!isRecord(p)) return undefined
  const title = str(p, 'title')
  if (!title) return undefined
  const countryStatus = isRecord(p.countryStatus) ? Object.fromEntries(Object.entries(p.countryStatus).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : undefined
  return compact({ title, patentId: str(p, 'patentId'), publicationNumber: str(p, 'publicationNumber'),
    snippet: str(p, 'snippet'), inventor: str(p, 'inventor'), assignee: str(p, 'assignee'),
    filingDate: str(p, 'filingDate'), priorityDate: str(p, 'priorityDate'), publicationDate: str(p, 'publicationDate'), grantDate: str(p, 'grantDate'),
    language: str(p, 'language'), url: str(p, 'detailLink'), pdfUrl: str(p, 'pdfUrl'), countryStatus })
}

export function applyGooglePatentsTool(ctx: Context, runtime: Runtime): void {
  ctx.tools.register(defineTool({
    name: 'search_google_patents',
    description: 'Search Google Patents (patents, not academic papers) with company/assignee, inventor, country, filing/publication/priority date and grant/application filters. Returns publication numbers, parties, dates, status, detail/PDF links. Search metadata is not a legal opinion or a definitive current legal-status check. Costs credits.',
    parameters: {
      query: { type: 'string', required: true, description: 'Patent keywords; Boolean search supported.' },
      max_results: { type: 'integer', description: 'Results per page (default 10, max 100). Keep this fixed when paging.' },
      page: { type: 'integer', description: 'Page number from 1. Follow nextPage with unchanged query and filters.' },
      sort: { type: 'string', enum: ['new', 'old'] }, status: { type: 'string', enum: ['GRANT', 'APPLICATION'] },
      type: { type: 'string', enum: ['PATENT', 'DESIGN'] }, country: { type: 'string', description: 'Country codes, e.g. CN or US,CN.' },
      language: { type: 'string', description: 'Languages, e.g. ENGLISH,CHINESE.' }, inventor: { type: 'string' }, assignee: { type: 'string' },
      after: { type: 'string', description: 'Lower date bound: filing:YYYYMMDD, publication:YYYYMMDD, or priority:YYYYMMDD.' },
      before: { type: 'string', description: 'Upper date bound, with the same date-field syntax as after.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        source: { type: 'string', required: true, enum: ['google-patents'] }, query: { type: 'string', required: true },
        page: { type: 'integer', required: true }, nextPage: { type: 'integer' },
        patents: { type: 'array', required: true, items: PATENT_SCHEMA }, credits: CREDITS_SCHEMA,
      } },
      render: (_a, v) => textResult([`Google Patents: ${v.query} (page ${v.page})`, ...v.patents.map((p, i) => [
        `${i + 1}. ${p.title}`, `Publication: ${p.publicationNumber ?? 'not provided'} · ID: ${p.patentId ?? 'not provided'}`,
        p.inventor ? `Inventor: ${p.inventor}` : '', p.assignee ? `Assignee: ${p.assignee}` : '',
        ...(['filingDate', 'priorityDate', 'publicationDate', 'grantDate'] as const).flatMap((k) => p[k] ? [`${k}: ${p[k]}`] : []),
        p.countryStatus ? `Country status: ${JSON.stringify(p.countryStatus)}` : '', p.snippet,
        p.url ? `Details: ${p.url}` : '', p.pdfUrl ? `PDF: ${p.pdfUrl}` : '',
      ].filter(Boolean).join('\n')), v.nextPage ? `Next page: ${v.nextPage}; keep query, filters and max_results unchanged.` : ''].filter(Boolean).join('\n\n'), v.credits),
      presentationMeta: (_a, v) => researchMeta(v, runtime.enabledTools, creditsMeta(v)),
    },
    timeoutMs: runtime.timeouts.tool, isConcurrencySafe: () => true,
    presentCall: (a) => ({ card: 'generic', kind: 'search', title: `Google Patents: ${a.query}` }),
    presentResult: (_a, r) => presentGenericWithCredits('Google Patents', r),
    async execute(args, exec) {
      const query = requireQuery(args.query)
      const page = args.page ?? 1
      if (!Number.isSafeInteger(page) || page < 1) throw new Error('page must be a positive integer')
      for (const value of [args.before, args.after]) if (value !== undefined && !/^(filing|publication|priority):\d{8}$/.test(value)) throw new Error('Patent dates must use filing:YYYYMMDD, publication:YYYYMMDD, or priority:YYYYMMDD.')
      const num = boundResults(args.max_results, runtime.limits, 100)
      const apiKey = await runtime.requireApiKey()
      const res = await runtime.client.post<Record<string, unknown>>('/google-scholar/v1/patents', compact({ query, page, num,
        sort: args.sort, status: args.status, type: args.type, country: args.country, language: args.language,
        inventor: args.inventor, assignee: args.assignee, before: args.before, after: args.after,
      }), { apiKey, signal: exec.signal })
      if (!res.ok) throw new Error(`Google Patents search failed: ${res.error}`)
      const rows = records(res.data.results)
      return compact({ source: 'google-patents' as const, query, page,
        patents: rows.slice(0, num).map(normalizePatent).filter((p): p is Patent => p !== undefined),
        nextPage: rows.length >= num ? page + 1 : undefined, credits: runtime.creditsOf(res, exec.agent) })
    },
  }))
}

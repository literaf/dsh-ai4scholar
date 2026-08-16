export const ARXIV_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <title>ArXiv Query: search_query=all:transformer</title>
  <opensearch:totalResults>1234</opensearch:totalResults>
  <opensearch:startIndex>0</opensearch:startIndex>
  <entry>
    <id>http://arxiv.org/abs/1706.03762v7</id>
    <updated>2023-08-02T00:41:18Z</updated>
    <published>2017-06-12T17:57:34Z</published>
    <title>Attention Is All You Need</title>
    <summary>  The dominant sequence transduction models are based on complex recurrent or
convolutional neural networks &amp; friends.</summary>
    <author><name>Ashish Vaswani</name></author>
    <author><name>Noam Shazeer</name></author>
    <arxiv:doi>10.48550/arXiv.1706.03762</arxiv:doi>
    <arxiv:journal_ref>NeurIPS 2017</arxiv:journal_ref>
    <link href="http://arxiv.org/abs/1706.03762v7" rel="alternate" type="text/html"/>
    <link title="pdf" href="http://arxiv.org/pdf/1706.03762v7" rel="related" type="application/pdf"/>
    <category term="cs.CL" scheme="http://arxiv.org/schemas/atom"/>
    <category term="cs.LG" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/hep-th/9901001v2</id>
    <published>1999-01-04T00:00:00Z</published>
    <title>An old-style   identifier</title>
    <summary>Nothing much.</summary>
    <author><name>A. Physicist</name></author>
    <category term="hep-th" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
</feed>`

export const RXIV_PAGE = {
  messages: [{ status: 'ok', total: 2, cursor: 0, count: 2 }],
  collection: [
    {
      doi: '10.1101/2024.05.01.591234',
      title: 'Single-cell atlas of the mouse retina',
      authors: 'Doe, J.; Roe, R.',
      author_corresponding: 'Doe, J.',
      date: '2024-05-02',
      version: '2',
      category: 'neuroscience',
      abstract: 'We profile 100k cells.',
      published: 'NA',
      server: 'biorxiv',
    },
    { doi: '10.1101/2024.05.03.599999', title: 'Second preprint', authors: '', date: '2024-05-04', version: '1', category: 'neuroscience', abstract: '' },
  ],
}

export const S2_CITATIONS = {
  offset: 0,
  next: 2,
  data: [
    {
      contexts: ['We build on the Transformer [1] …', 'As shown in [1] …'],
      intents: ['methodology'],
      isInfluential: true,
      citingPaper: { paperId: 'aaa', title: 'BERT', year: 2019, citationCount: 90000, authors: [{ name: 'J. Devlin' }], externalIds: { ArXiv: '1810.04805' } },
    },
    { contexts: [], intents: [], isInfluential: false, citingPaper: { paperId: 'bbb', title: 'GPT-2', year: 2019, authors: [] } },
  ],
}

export const S2_AUTHORS = {
  total: 42,
  offset: 0,
  next: 2,
  data: [
    { authorId: '1741101', name: 'Oren Etzioni', affiliations: ['Allen Institute for AI'], paperCount: 400, citationCount: 30000, hIndex: 80, url: 'https://www.semanticscholar.org/author/1741101', externalIds: { ORCID: '0000-0001-2345-6789' } },
    { authorId: '2', name: 'Another Person', affiliations: [] },
  ],
}

export const CREDITS_BALANCE = {
  credits: { permanent: 4500, member_monthly_remaining: 500, total_available: 5000 },
  api_key: { credit_limit: null, credits_used: 120, credits_remaining: null },
  membership: { plan: 'pro', status: 'active', period_end: '2026-09-01T00:00:00.000Z' },
}

/** A minimal PDF header so `looksLikePdf` accepts the bytes; the parser is mocked in tests. */
export const FAKE_PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3])

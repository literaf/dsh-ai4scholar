export const S2_SEARCH_RESPONSE = {
  total: 1234,
  offset: 0,
  next: 2,
  data: [
    {
      paperId: '204e3073870fae3d05bcbc2f6a8e263d9b72e776',
      externalIds: { ArXiv: '1706.03762', DBLP: 'conf/nips/VaswaniSPUJGKP17', CorpusId: 13756489 },
      url: 'https://www.semanticscholar.org/paper/204e3073870fae3d05bcbc2f6a8e263d9b72e776',
      title: 'Attention is All you Need',
      abstract: 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. '.repeat(8),
      venue: 'Neural Information Processing Systems',
      journal: null,
      year: 2017,
      publicationDate: '2017-06-12',
      citationCount: 150000,
      openAccessPdf: { url: 'https://arxiv.org/pdf/1706.03762', status: 'GREEN' },
      authors: [
        { authorId: '40348417', name: 'Ashish Vaswani' },
        { authorId: '1846258', name: 'Noam M. Shazeer' },
        { authorId: '3877127', name: 'Niki Parmar' },
        { authorId: '39328010', name: 'Jakob Uszkoreit' },
      ],
    },
    {
      paperId: 'df2b0e26d0599ce3e70df8a9da02e51594e0e992',
      externalIds: { DOI: '10.18653/v1/N19-1423', ArXiv: '1810.04805' },
      url: 'https://www.semanticscholar.org/paper/df2b0e26d0599ce3e70df8a9da02e51594e0e992',
      title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding',
      abstract: null,
      venue: '',
      journal: { name: 'North American Chapter of the Association for Computational Linguistics' },
      year: 2019,
      publicationDate: null,
      citationCount: 90000,
      openAccessPdf: null,
      authors: [{ authorId: '39172707', name: 'Jacob Devlin' }],
    },
  ],
}

export const PUBMED_SEARCH_RESPONSE = {
  total: 42,
  papers: [
    {
      pmid: '39575807',
      title: 'CRISPR-based therapies in oncology: a review',
      abstract: 'CRISPR-Cas9 genome editing has advanced rapidly toward clinical application in cancer.',
      authors: [{ foreName: 'Jane', lastName: 'Doe' }, { name: 'John Q Public' }, 'Ada Lovelace'],
      journal: { title: 'Nature Reviews Cancer', pubDate: '2024 Nov' },
      doi: '10.1038/s41568-024-00001-x',
      pmcid: 'PMC1234567',
      meshTerms: ['Neoplasms', 'CRISPR-Cas Systems'],
    },
    {
      pmid: '30102808',
      title: 'Untitled? no — a second paper',
      authors: [],
      pubDate: '2018/08/01',
    },
  ],
}

export const GS_PAGE_1 = {
  resultsCount: 10,
  results: Array.from({ length: 10 }, (_, i) => ({
    title: `Scholar paper ${i + 1}`,
    link: `https://example.org/paper-${i + 1}`,
    snippet: `Snippet ${i + 1} about protein folding …`,
    publicationInfo: `A Author, B Writer, C Scribe - Journal of Examples, ${2020 + (i % 5)} - example.org`,
    year: 2020 + (i % 5),
    citedBy: 100 - i,
    pdfUrl: i % 2 === 0 ? `https://example.org/paper-${i + 1}.pdf` : null,
  })),
}

export const GS_PAGE_2 = {
  resultsCount: 3,
  results: Array.from({ length: 3 }, (_, i) => ({
    title: `Scholar paper ${i + 11}`,
    link: `https://example.org/paper-${i + 11}`,
    snippet: `Snippet ${i + 11}`,
    publicationInfo: 'D Dean - Proceedings, 2023',
    year: 2023,
    citedBy: 5,
  })),
}

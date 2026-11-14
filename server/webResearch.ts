import type { WebSource } from '../src/types/app.ts';

export interface ResearchFinding {
  title: string;
  url: string;
  snippet: string;
  provider: 'duckduckgo' | 'wikipedia' | 'duckduckgo-instant';
}

export interface WebResearchBundle {
  findings: ResearchFinding[];
  sources: WebSource[];
  instantAbstract?: string;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(Number(dec)));
}

function stripTags(input: string): string {
  return decodeHtmlEntities(input.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function unwrapDuckDuckGoUrl(rawHref: string): string | null {
  const cleaned = decodeHtmlEntities(rawHref.trim());
  if (!cleaned) return null;
  try {
    const full = cleaned.startsWith('//') ? `https:${cleaned}` : cleaned;
    const parsed = new URL(full);
    if (parsed.hostname.includes('duckduckgo.com')) {
      const uddg = parsed.searchParams.get('uddg');
      if (uddg && /^https?:\/\//i.test(uddg)) {
        return uddg;
      }
    }
    if (/^https?:\/\//i.test(full) && !parsed.hostname.includes('duckduckgo.com')) {
      return full;
    }
  } catch {
    return null;
  }
  return null;
}

async function searchDuckDuckGoLite(query: string): Promise<ResearchFinding[]> {
  try {
    const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MindMasterResearch/1.0)',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return [];
    const html = await res.text();

    const results: ResearchFinding[] = [];
    const linkRegex = /<a[^>]*href="([^"]+)"[^>]*class=['"]result-link['"][^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex = /<td[^>]*class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/gi;

    const links: Array<{ url: string; title: string; index: number }> = [];
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(html)) !== null) {
      const resolvedUrl = unwrapDuckDuckGoUrl(match[1]);
      const title = stripTags(match[2]);
      if (resolvedUrl && title) {
        links.push({ url: resolvedUrl, title, index: match.index });
      }
      if (links.length >= 8) break;
    }

    const snippets: Array<{ text: string; index: number }> = [];
    while ((match = snippetRegex.exec(html)) !== null) {
      const text = stripTags(match[1]);
      if (text) {
        snippets.push({ text, index: match.index });
      }
    }

    for (let i = 0; i < links.length; i++) {
      const current = links[i];
      const nextIndex = links[i + 1]?.index ?? Number.MAX_SAFE_INTEGER;
      const matchedSnippet = snippets.find((s) => s.index > current.index && s.index < nextIndex);
      results.push({
        title: current.title,
        url: current.url,
        snippet: matchedSnippet?.text || '',
        provider: 'duckduckgo',
      });
    }

    return results;
  } catch {
    return [];
  }
}

async function searchDuckDuckGoInstant(query: string): Promise<{
  abstract?: string;
  findings: ResearchFinding[];
}> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MindMasterResearch/1.0' },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { findings: [] };
    const data = (await res.json()) as {
      Heading?: string;
      AbstractText?: string;
      AbstractURL?: string;
      AbstractSource?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
    };

    const findings: ResearchFinding[] = [];
    if (data.AbstractText && data.AbstractURL) {
      findings.push({
        title: data.Heading || data.AbstractSource || 'Reference Summary',
        url: data.AbstractURL,
        snippet: data.AbstractText,
        provider: 'duckduckgo-instant',
      });
    }

    if (Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics.slice(0, 3)) {
        if (topic.FirstURL && topic.Text) {
          findings.push({
            title: topic.Text.split(' - ')[0].slice(0, 80) || 'Related Reference',
            url: topic.FirstURL,
            snippet: topic.Text,
            provider: 'duckduckgo-instant',
          });
        }
      }
    }

    return {
      abstract: data.AbstractText || undefined,
      findings,
    };
  } catch {
    return { findings: [] };
  }
}

async function searchWikipedia(query: string, wikiLang: 'en' | 'ml' = 'en'): Promise<ResearchFinding[]> {
  try {
    const searchUrl = `https://${wikiLang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      query
    )}&format=json&srlimit=3&utf8=1`;
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'MindMasterResearch/1.0' },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      query?: {
        search?: Array<{ title?: string; snippet?: string }>;
      };
    };

    const hits = (data.query?.search || []).slice(0, 3).filter((h) => Boolean(h.title));
    const results = await Promise.all(
      hits.map(async (hit) => {
        const title = hit.title!;
        const slug = encodeURIComponent(title.replace(/ /g, '_'));
        const pageUrl = `https://${wikiLang}.wikipedia.org/wiki/${slug}`;
        let summaryText = hit.snippet ? stripTags(hit.snippet) : '';

        try {
          const sumRes = await fetch(
            `https://${wikiLang}.wikipedia.org/api/rest_v1/page/summary/${slug}`,
            {
              headers: { 'User-Agent': 'MindMasterResearch/1.0' },
              signal: AbortSignal.timeout(2200),
            }
          );
          if (sumRes.ok) {
            const sumJson = (await sumRes.json()) as { extract?: string };
            if (sumJson.extract) {
              summaryText = sumJson.extract.slice(0, 500);
            }
          }
        } catch {
          // keep search snippet
        }

        return {
          title: `${title} — Wikipedia`,
          url: pageUrl,
          snippet: summaryText,
          provider: 'wikipedia' as const,
        };
      })
    );

    return results;
  } catch {
    return [];
  }
}

export async function searchWebMultiSource(
  query: string,
  langHint = 'auto'
): Promise<WebResearchBundle> {
  const cleanQuery = query.trim().slice(0, 320);
  if (!cleanQuery) {
    return { findings: [], sources: [] };
  }

  const tasks: Array<Promise<ResearchFinding[]>> = [
    searchDuckDuckGoLite(cleanQuery),
    searchWikipedia(cleanQuery, 'en'),
    searchDuckDuckGoInstant(cleanQuery).then((r) => r.findings),
  ];

  if (langHint === 'ml' || langHint === 'manglish' || /[\u0D00-\u0D7F]/.test(cleanQuery)) {
    tasks.push(searchWikipedia(cleanQuery, 'ml'));
  }

  const instantPromise = searchDuckDuckGoInstant(cleanQuery);
  const [settled, instantRes] = await Promise.all([
    Promise.allSettled(tasks),
    instantPromise.catch(() => ({ abstract: undefined, findings: [] })),
  ]);

  const seenUrls = new Set<string>();
  const findings: ResearchFinding[] = [];
  const sources: WebSource[] = [];

  for (const item of settled) {
    if (item.status !== 'fulfilled') continue;
    for (const f of item.value) {
      if (!f.url || seenUrls.has(f.url)) continue;
      seenUrls.add(f.url);
      findings.push(f);
      sources.push({
        title: f.title,
        url: f.url,
      });
    }
  }

  return {
    findings: findings.slice(0, 8),
    sources: sources.slice(0, 8),
    instantAbstract: instantRes.abstract,
  };
}

export function formatFallbackResearchResponse(params: {
  query: string;
  bundle: WebResearchBundle;
  effectiveLang: string;
  modelLimitationNote: string;
}): string {
  const { query, bundle, effectiveLang, modelLimitationNote } = params;
  const isMl = effectiveLang === 'ml' || effectiveLang === 'manglish';

  const lines: string[] = [];

  if (bundle.findings.length > 0) {
    lines.push(
      isMl
        ? `### "${query}" എന്നതിനായുള്ള തത്സമയ വെബ് വിവരങ്ങൾ`
        : `### Verified Live Web Research for "${query}"`
    );

    if (bundle.instantAbstract) {
      lines.push(bundle.instantAbstract);
    }

    lines.push(isMl ? `#### കണ്ടെത്തിയ പ്രധാന വിവരങ്ങളും ഉറവിടങ്ങളും:` : `#### Key Verified Sources & Findings:`);

    for (const item of bundle.findings.slice(0, 6)) {
      const snippetPart = item.snippet ? ` — ${item.snippet}` : '';
      lines.push(`- **[${item.title}](${item.url})**${snippetPart}`);
    }

    lines.push(
      isMl
        ? `\n> **കുറിപ്പ് (Limitation):** ${modelLimitationNote} മുകളിലുള്ള ലിങ്കുകളിൽ ക്ലിക്ക് ചെയ്ത് കൂടുതൽ വിശദാംശങ്ങൾ നേരിട്ട് പരിശോധിക്കാവുന്നതാണ്.`
        : `\n> **Note on AI Synthesis:** ${modelLimitationNote} Verified live search results and clickable source links from multiple web sources are provided above so you have immediate, reliable information.`
    );
  } else {
    lines.push(
      isMl
        ? `### "${query}" സംബന്ധിച്ച വിവരങ്ങൾ`
        : `### Research Summary for "${query}"`
    );
    lines.push(
      isMl
        ? `തത്സമയ വെബ് തിരയലിൽ ഈ ചോദ്യത്തിന് കൃത്യമായ പൊതു വെബ് ഫലങ്ങൾ ഉടനടി കണ്ടെത്താനായില്ല.\n\n**വ്യക്തമായ കാരണം:** ${modelLimitationNote}\n\n**അടുത്ത ഘട്ടം:**\n- കൂടുതൽ വ്യക്തമായ കീവേഡുകൾ നൽകി വീണ്ടും ചോദിക്കാം (ഉദാഹരണത്തിന് വിഷയത്തിന്റെ കൃത്യമായ പേര് അല്ലെങ്കിൽ വർഷം).\n- AI മോഡൽ പൂർണ്ണ ശേഷിയിൽ പ്രവർത്തിക്കാൻ **Settings > Secrets**-ൽ ബില്ലിംഗ്/ക്വോട്ട ഉള്ള ` + '`GEMINI_API_KEY`' + ` അപ്ഡേറ്റ് ചെയ്യാവുന്നതാണ്.`
        : `Direct public search queries did not return matching reference summaries for this specific phrasing.\n\n**Actual Limitation:** ${modelLimitationNote}\n\n**Practical Next Steps:**\n- Rephrase with specific keywords, product names, or dates so direct multi-source web lookup can match authoritative pages.\n- To restore full Gemini AI reasoning and synthesis alongside web search, attach an API key with active quota in **Settings > Secrets**.`
    );
  }

  return lines.join('\n\n');
}

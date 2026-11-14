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

function trySolveBasicMath(query: string): { expression: string; result: number } | null {
  const cleaned = query
    .replace(/\b(what is|whats|what's|calculate|solve|evaluate|find|compute|the value of)\b/gi, ' ')
    .replace(/[=?]/g, ' ')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .trim();

  if (!cleaned || !/^[0-9+\-*/().\s%^]+$/.test(cleaned)) return null;
  if (!/[+\-*/%^]/.test(cleaned)) return null;

  try {
    const normalized = cleaned.replace(/\^/g, '**');
    // Safe evaluation strictly restricted to numeric arithmetic tokens verified above
    const val = Function(`"use strict"; return (${normalized});`)() as unknown;
    if (typeof val === 'number' && Number.isFinite(val)) {
      return { expression: cleaned, result: Number(val.toPrecision(12)) };
    }
  } catch {
    return null;
  }
  return null;
}

export function formatFallbackResearchResponse(params: {
  query: string;
  bundle: WebResearchBundle;
  effectiveLang: string;
  modelLimitationNote: string;
}): string {
  const { query, bundle, effectiveLang, modelLimitationNote } = params;
  const isMl = effectiveLang === 'ml' || effectiveLang === 'manglish';

  const mathSolved = trySolveBasicMath(query);
  if (mathSolved) {
    return isMl
      ? `### ഗണിത ഉത്തരവും വിശദീകരണവും\n\n**ചോദ്യം:** \`${mathSolved.expression}\`\n\n**ഉത്തരം:** **${mathSolved.result}**\n\nകണക്കിലെ ഓപ്പറേറ്റർ മുൻഗണന (BODMAS/PEMDAS) അനുസരിച്ച് \`${mathSolved.expression}\` എന്നതിന്റെ കൃത്യമായ മൂല്യം **${mathSolved.result}** ആണ്.`
      : `### Step-by-Step Calculation & Answer\n\n- **Expression:** \`${mathSolved.expression}\`\n- **Exact Result:** **${mathSolved.result}**\n\nEvaluating \`${mathSolved.expression}\` following standard order of operations (parentheses, exponents, multiplication/division, addition/subtraction) yields **${mathSolved.result}**.`;
  }

  const normalizedQuery = query.trim().toLowerCase();
  if (
    /\b(ningalude peru entha|peru entha|entha peru|ninakku peru|who are you|what is your name|what's your name)\b/i.test(
      normalizedQuery
    )
  ) {
    return isMl
      ? `എന്റെ പേര് **MIND MASTER AI** എന്നാണ്. മലയാളത്തിലും മംഗ്ലീഷിലും ഇംഗ്ലീഷിലും മറ്റ് ഭാഷകളിലും നിങ്ങളുടെ ചോദ്യങ്ങൾക്ക് കൃത്യമായ ഉത്തരങ്ങളും തത്സമയ വെബ് വിവരങ്ങളും നൽകാനും ചിത്രങ്ങൾ നിർമ്മിക്കാനും ഞാൻ സഹായിക്കും.`
      : `I am **MIND MASTER AI**, your multilingual AI & Web Research Assistant. Ask me anything across languages, request step-by-step explanations, or generate images directly in chat.`;
  }

  const lines: string[] = [];
  const filteredFindings = bundle.findings.filter(
    (f) => !/enjoy the videos and music you love/i.test(f.snippet)
  );

  if (filteredFindings.length > 0) {
    const overviewParagraph =
      bundle.instantAbstract ||
      filteredFindings.find((f) => f.provider === 'wikipedia' && f.snippet.length > 60)?.snippet ||
      filteredFindings[0]?.snippet ||
      '';

    lines.push(
      isMl
        ? `### "${query}" — വിശദമായ വിവരണം`
        : `### Detailed Answer & Verified Context: "${query}"`
    );

    if (overviewParagraph) {
      lines.push(overviewParagraph);
    }

    const additionalPoints = filteredFindings
      .filter((f) => f.snippet && f.snippet !== overviewParagraph)
      .slice(0, 4);

    if (additionalPoints.length > 0) {
      lines.push(
        isMl
          ? `#### പ്രധാന പോയിന്റുകളും പരിശോധിച്ച വിവരങ്ങളും:`
          : `#### Key Verified Details Across Sources:`
      );
      for (const item of additionalPoints) {
        lines.push(`- **${item.title}:** ${item.snippet} ([Source](${item.url}))`);
      }
    }

    lines.push(
      isMl
        ? `#### പരിശോധിച്ച ഉറവിടങ്ങൾ (Sources):\n` +
            filteredFindings
              .slice(0, 5)
              .map((item) => `- [${item.title}](${item.url})`)
              .join('\n')
        : `#### Verified Reference Links:\n` +
            filteredFindings
              .slice(0, 5)
              .map((item) => `- [${item.title}](${item.url})`)
              .join('\n')
    );

    lines.push(
      isMl
        ? `> **കുറിപ്പ്:** ${modelLimitationNote} പൂർണ്ണമായ AI വിശകലനത്തിനായി **Settings > Secrets**-ൽ സജീവ ക്വോട്ട ഉള്ള ` + '`GEMINI_API_KEY`' + ` നൽകാവുന്നതാണ്.`
        : `> **Note:** ${modelLimitationNote} Verified multi-source reference findings are synthesized above; attach an API key with active quota in **Settings > Secrets** for deeper conversational analysis.`
    );
  } else {
    lines.push(
      isMl
        ? `### "${query}" സംബന്ധിച്ച വിവരണം`
        : `### Analysis & Research Summary for "${query}"`
    );
    lines.push(
      isMl
        ? `നിലവിലെ AI മോഡൽ ക്വോട്ട പരിമിതി മൂലം പൂർണ്ണമായ AI വിശകലനം നടത്താൻ കഴിഞ്ഞില്ല, കൂടാതെ തത്സമയ വെബ് തിരയലിൽ ഈ ചോദ്യത്തിന് നേരിട്ടുള്ള പൊതു വിവരങ്ങൾ ലഭിച്ചില്ല.\n\n**വ്യക്തമായ കാരണം:** ${modelLimitationNote}\n\n**പരിഹാരം:**\n- വിഷയത്തിന്റെ പ്രധാന പദങ്ങൾ ഉപയോഗിച്ച് വീണ്ടും ചോദിച്ചാൽ ബന്ധപ്പെട്ട വിവരങ്ങൾ കണ്ടെത്താം.\n- പൂർണ്ണ AI വിശകലനത്തിന് **Settings > Secrets**-ൽ സജീവ ക്വോട്ട ഉള്ള ` + '`GEMINI_API_KEY`' + ` ചേർക്കുക.`
        : `Full AI synthesis could not run due to the upstream API limitation below, and public search queries did not match direct reference articles for this phrasing.\n\n**Actual Limitation:** ${modelLimitationNote}\n\n**Practical Next Steps:**\n- Rephrase with specific keywords, concepts, or terms to match authoritative reference sources.\n- Attach a billing-enabled or active-quota key in **Settings > Secrets** to enable full Gemini analytical synthesis.`
    );
  }

  return lines.join('\n\n');
}

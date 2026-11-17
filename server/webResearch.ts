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

export function isDirectCasualOrMathQuery(query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return false;
  if (trySolveBasicMath(query) !== null) return true;

  const isGreetingOrBanter =
    /^(hi+|hey+|hello+|hlo+|yo+|hai+|da+|eda+|edi+|bro+|machane|machaane|sughamano|sugamano|sghamano|sukhamano|good morning|good afternoon|good evening|good night|thanks|thank you|nanni|ok|okay|sheri|seri|bye|pinne|entha vishesham|enthokke und|how are you|what's up|whats up|wyd|sup)[\s!?.😊❤️😂🙌]*$/i.test(
      normalized
    ) ||
    /\b(ningalude peru entha|peru entha|entha peru|ninakku peru|who are you|what is your name|what's your name|innu mood illa|mood off|boradikkunnu|boradichu|saramilla|feeling sad|feeling lonely|im bored|i'm bored|i am bored|tired today|stressed out)\b/i.test(
      normalized
    );

  return isGreetingOrBanter;
}

export function formatFallbackResearchResponse(params: {
  query: string;
  bundle: WebResearchBundle;
  effectiveLang: string;
  modelLimitationNote: string;
}): string {
  const { query, bundle, effectiveLang, modelLimitationNote } = params;
  const isManglish = effectiveLang === 'manglish';
  const isMl = effectiveLang === 'ml';

  const mathSolved = trySolveBasicMath(query);
  if (mathSolved) {
    if (isManglish) {
      return `Easy da! **${mathSolved.result}** aanu answer 😄\n\n- **Expression:** \`${mathSolved.expression}\`\n- **Result:** **${mathSolved.result}** (standard BODMAS order follow cheythittu!)`;
    }
    return isMl
      ? `വളരെ എളുപ്പമാണ്! **${mathSolved.result}** ആണ് ഉത്തരം 😊\n\n- **ചോദ്യം:** \`${mathSolved.expression}\`\n- **ഉത്തരം:** **${mathSolved.result}**`
      : `Got it — the answer is **${mathSolved.result}**!\n\n- **Expression:** \`${mathSolved.expression}\`\n- **Result:** **${mathSolved.result}** (evaluated using standard order of operations).`;
  }

  const normalizedQuery = query.trim().toLowerCase();

  if (
    /\b(ningalude peru entha|peru entha|entha peru|ninakku peru|who are you|what is your name|what's your name)\b/i.test(
      normalizedQuery
    )
  ) {
    if (isManglish) {
      return `Njan **MIND MASTER AI**, ninte best friend pole koode ulla buddy! 😄 Manglish-ilum English-ilum enthum namukk samsarikkam—questions, jokes, web research, images okke ready aanu. Ninne engane vilikkam da?`;
    }
    return isMl
      ? `എന്റെ പേര് **MIND MASTER AI** എന്നാണ്! നിന്റെ ഒരു close friend പോലെ എന്തിനും സഹായിക്കാൻ ഞാൻ എപ്പോഴും കൂടെയുണ്ട് 😊 എന്താ വിശേഷം?`
      : `I'm **MIND MASTER AI** — basically your all-in-one buddy for chatting, quick answers, web research, and creating images 😄 What are we up to today?`;
  }

  if (/\b(sughamano|sugamano|sghamano|sukhamano|how are you|entha vishesham|enthokke und)\b/i.test(normalizedQuery)) {
    if (isManglish) {
      return `Pinnalla! Njan full chill & ready aanu da 😄❤️ Ninakku sughamalle? Innu entha paripadi, nalla day aayirunno?`;
    }
    return isMl
      ? `നല്ല സുഖമാണ്! ❤️ നിനക്ക് സുഖമാണോ? ഇന്ന് എന്തൊക്കെയാണ് വിശേഷം? 😊`
      : `Doing great, thanks for asking! 😊 How's your day going so far? Anything fun happening?`;
  }

  if (/^(hi+|hey+|hello+|hlo+|yo+|hai+|da+|eda+|edi+|bro+|machane|machaane)[\s!?.😊❤️]*$/i.test(normalizedQuery)) {
    if (isManglish) {
      return `Hey da! Enthokke und vishesham? 😊 Parayoo, innu enthum samsarikkam!`;
    }
    return isMl
      ? `ഹായ്! എന്തൊക്കെയുണ്ട് വിശേഷം? 😊 പറയൂ, എന്ത് സഹായമാണ് വേണ്ടത്?`
      : `Hey!! What's up? 😊 Good to see you—what's on your mind today?`;
  }

  if (/\b(mood illa|mood off|boradikkunnu|boradichu|feeling sad|feeling lonely|im bored|i'm bored|i am bored|tired today|stressed out)\b/i.test(normalizedQuery)) {
    if (isManglish) {
      return `Ayyo enna patti da? 🥺 Mood off aakalle, njan koode ille ❤️ Work/study pressure aano atho veruthe bore adikkunnathano? Parayoo, namukk mood onnu set aakkam!`;
    }
    return isMl
      ? `അയ്യോ, എന്ത് പറ്റി? വിഷമിക്കണ്ട, ഞാൻ കൂടെയില്ലേ ❤️ എന്താ കാര്യം എന്ന് പറയൂ, നമുക്ക് സംസാരിച്ച് mood ശരിയാക്കാം!`
      : `Hey, what happened? Take a breather—I'm right here with you ❤️ Wanna vent about it, or should we distract ourselves with something fun?`;
  }

  if (/^(thanks|thank you|thx|nanni|ok|okay|sheri|seri)[\s!?.😊❤️]*$/i.test(normalizedQuery)) {
    if (isManglish) {
      return `Ayyo athokke enthina thanks da 😄❤️ Epazhum ready aanu, vere enthelum venel parayoo!`;
    }
    return isMl
      ? `അതൊക്കെ എന്തിനാ നന്ദി 😊 എപ്പോഴും കൂടെയുണ്ട്, ഇനിയും എന്തെങ്കിലും ഉണ്ടെങ്കിൽ പറയൂ!`
      : `Anytime! 😄 That's what friends are for. Hit me up whenever you need anything else!`;
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

    if (overviewParagraph) {
      lines.push(overviewParagraph);
    }

    const additionalPoints = filteredFindings
      .filter((f) => f.snippet && f.snippet !== overviewParagraph)
      .slice(0, 3);

    if (additionalPoints.length > 0) {
      lines.push(
        isManglish
          ? `**Verified details ithokke aanu:**\n` +
              additionalPoints
                .map((item) => `- **${item.title}:** ${item.snippet} ([Source](${item.url}))`)
                .join('\n')
          : isMl
            ? `**പ്രധാന വിവരങ്ങൾ:**\n` +
                additionalPoints
                  .map((item) => `- **${item.title}:** ${item.snippet} ([Source](${item.url}))`)
                  .join('\n')
            : `**Key details:**\n` +
                additionalPoints
                  .map((item) => `- **${item.title}:** ${item.snippet} ([Source](${item.url}))`)
                  .join('\n')
      );
    }

    lines.push(
      isManglish
        ? `**Sources:** ` +
            filteredFindings
              .slice(0, 4)
              .map((item) => `[${item.title}](${item.url})`)
              .join(' · ')
        : isMl
          ? `**ഉറവിടങ്ങൾ:** ` +
              filteredFindings
                .slice(0, 4)
                .map((item) => `[${item.title}](${item.url})`)
                .join(' · ')
          : `**Sources:** ` +
              filteredFindings
                .slice(0, 4)
                .map((item) => `[${item.title}](${item.url})`)
                .join(' · ')
    );

    lines.push(
      isManglish
        ? `*(Note: ${modelLimitationNote} Full conversational Gemini synthesis kittan Settings > Secrets-il active key check cheyyane.)*`
        : isMl
          ? `*(കുറിപ്പ്: ${modelLimitationNote} പൂർണ്ണമായ AI സംഭാഷണത്തിന് Settings > Secrets-ൽ സജീവമായ API key പരിശോധിക്കുക.)*`
          : `*(Note: ${modelLimitationNote} Live web sources are summarized directly above; check an active key in Settings > Secrets for full AI conversation.)*`
    );
  } else {
    lines.push(
      isManglish
        ? `Da, ee topic-il direct web article kittiyilla, pinne AI quota limit kaaranam full model synthesis ippo run cheyyanum pattiyilla (${modelLimitationNote}). Kurachu koodi clear keywords ittu chodikkamo? Namukk nokkam! 😊`
        : isMl
          ? `ഈ വിഷയത്തിൽ നേരിട്ടുള്ള വെബ് വിവരങ്ങൾ ലഭിച്ചില്ല, ഒപ്പം API പരിമിതി മൂലം പൂർണ്ണ AI വിശകലനം നടത്താൻ കഴിഞ്ഞില്ല (${modelLimitationNote}). കുറച്ചുകൂടി വ്യക്തമായ പദങ്ങൾ ഉപയോഗിച്ച് വീണ്ടും ചോദിക്കാമോ?`
          : `I couldn't find direct public articles for that phrasing right now, and full AI synthesis hit an API limitation (${modelLimitationNote}). Try giving me a couple more specific keywords and we'll dig right into it!`
    );
  }

  return lines.join('\n\n');
}

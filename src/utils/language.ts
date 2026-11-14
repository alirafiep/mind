import type { ChatMessage, LanguagePreference } from '../types/app';

const MANGLISH_EXACT_WORDS = new Set([
  // Pronouns & people
  'njan', 'njn', 'njaan', 'njangal', 'njngal', 'njammal',
  'ningal', 'ningalude', 'ningalde', 'ningalk', 'ningalkk', 'ningalkku', 'ningale',
  'avan', 'avante', 'avane', 'aval', 'avalude', 'avale', 'avar', 'avarude', 'avarkk',
  'nammal', 'nammude', 'nammalk', 'nml',
  'ithu', 'ith', 'athu', 'ath', 'ivide', 'ivde', 'ivda', 'avide', 'avde', 'avda',
  'chetta', 'chettan', 'chechi', 'machane', 'machan', 'macha', 'mwone', 'mone', 'mole',
  'suhurthe', 'koottukara', 'kuttikale', 'amma', 'achan', 'ammachi', 'appooppan',

  // Question words & variants/typos
  'entha', 'enthu', 'enthanu', 'enthaanu', 'enthaa', 'enthaayirunnu', 'ntha', 'nthaa', 'nthu',
  'enthuva', 'enthokke', 'enthokkeyanu', 'enthukond', 'enthukondu', 'enthina', 'enthinu', 'enthinaa',
  'aaranu', 'aaraanu', 'aaraa', 'aarokke', 'ethanu', 'ethaanu', 'ethra', 'ethrayanu',
  'eppo', 'eppol', 'eppozha', 'eppozhanu', 'epozha',
  'engane', 'engne', 'engana', 'enganeya', 'enganeyanu', 'enganeyaa', 'enganaa',
  'evide', 'evde', 'evda', 'evideya', 'evdeya', 'evdeyanu', 'evidunnu', 'evidunn',

  // Common verbs, imperatives & typo/short forms
  'parayu', 'parayoo', 'parayo', 'parayuo', 'parayumo', 'parayamo', 'parayuka', 'parayane', 'prayu',
  'paranj', 'paranja', 'paranju', 'paranjathu', 'parayunnu', 'parayam', 'paranjal', 'paranjitt',
  'tharu', 'tharoo', 'tharo', 'tharuo', 'tharumo', 'tharamo', 'thaa', 'tharaam', 'tharam', 'thannu',
  'cheyyu', 'cheyyoo', 'cheyymo', 'cheyyamo', 'cheyyanam', 'cheyyan', 'cheyyunnu', 'cheythu', 'cheyth', 'cheyyam', 'chyynam', 'chyyu',
  'undakku', 'undakk', 'undakkoo', 'undakkamo', 'undakki', 'undakkan', 'undakkam',
  'varakku', 'varakk', 'varakkoo', 'varakkamo', 'varachu', 'varaykku',
  'nokku', 'nokk', 'nokkoo', 'nokkam', 'nokki', 'nokkamo',
  'kanam', 'kaanan', 'kandu', 'kanum', 'kaanum', 'kanichu', 'kanikku',
  'kittumo', 'kittuo', 'kittum', 'kitti', 'kittan', 'kittilla', 'kittuvo',
  'poyi', 'pokam', 'povanam', 'povan', 'pokunnu', 'pokumbo', 'pokoo', 'poyallo',
  'vannu', 'varam', 'varumo', 'varuo', 'varunnu', 'varum', 'varane', 'vaa',
  'ezhuthu', 'ezhuthi', 'ezhuth', 'ezhuthamo', 'ezhuthan',
  'vaayikku', 'vaayikk', 'vaayichu', 'vayikku', 'vayichu',
  'padikkan', 'padikku', 'padikkam', 'padichu', 'padippikku',
  'ariyamo', 'ariyo', 'ariyuo', 'ariyum', 'ariyilla', 'arilla', 'ariyaam', 'ariyam', 'ariyunnathu',
  'manasilayo', 'manasilayilla', 'manasilakki', 'manassilayo', 'manassilayi',
  'thudangam', 'thudangu', 'nirthu', 'maattu', 'mattam',
  'sahayikku', 'sahayikk', 'sahayikkamo', 'sahayikamo', 'sahayam', 'vilikku', 'vilikk',

  // Greetings, expressions, adjectives & common Malayalam nouns in Manglish
  'sughamano', 'sugamano', 'sghamano', 'sugham', 'sugam', 'sgham', 'sukhamano', 'sukham',
  'vishesham', 'visheshangal', 'nanni', 'namaskaram', 'namskaram',
  'katha', 'ktha', 'kathakal', 'paattu', 'pattu', 'padam', 'chithram', 'chitram',
  'sthalangal', 'sthalangalude', 'sthalam', 'keralam', 'keralathile', 'keralathil',
  'malayalam', 'malayalathil', 'malayali', 'mlylm',
  'oru', 'ore', 'nalla', 'nallathu', 'nalloru', 'valiya', 'cheriya', 'kurachu', 'korachu', 'kure',
  'valare', 'ottum', 'ella', 'ellam', 'ellarum', 'ellavarum', 'ellavarkkum',
  'aano', 'ano', 'alle', 'allo', 'undo', 'undu', 'und', 'illa', 'illallo', 'illatha',
  'venam', 'venamayirunnu', 'veeno', 'veno', 'venda', 'vendathu', 'mathi', 'mathram',
  'koodi', 'koode', 'koodathe', 'pinne', 'pakshe', 'athukond', 'athukondu', 'karanam',
  'bhayankara', 'adipoli', 'pwoli', 'poli', 'sheri', 'seri', 'sari', 'okke', 'oke', 'okey',
  'thanneyanu', 'thanneyalle', 'thanne', 'aayirunnu', 'ayirunnu', 'aayirikkum', 'aakum', 'aanu', 'ennu', 'enna', 'ennal',
  'ippo', 'ippol', 'ippozhum', 'innu', 'innale', 'naale', 'nale', 'ravile', 'rathri', 'vaikitt',
  'peru', 'perentha', 'perenthanu', 'vayass', 'vayassu', 'veedu', 'naadu', 'puzha', 'mazha', 'veyil',
  'chaya', 'kaappi', 'choru', 'biriyani', 'sadya', 'onam', 'vishu',
  'aarogya', 'aarogyam', 'vidya', 'joli', 'kalyanam', 'patti', 'poocha', 'aana', 'kuruvi', 'maram', 'poovu',
  'sundaramaya', 'sundaram', 'bhangiyulla', 'bhangi', 'velicham', 'irutt', 'kadal', 'malakal', 'kaadu',
  'tharamo', 'cheyyamo', 'parayamo', 'ayakkamo', 'edukkamo', 'thudangamo', 'kaanamo',
]);

const MANGLISH_SUFFIX_PATTERNS = [
  /\b[a-z]{3,}(?:aanu|aano|ayirunnu|aayirunnu|unnu|unnuu|thil|thile|kalude|ngalude|koode|ullathu|illatha)\b/i,
  /\b(?:entha|engane|evide|eppo|ningal|nammal|cheyy|paray|undakk|varakk|sahay)\w*\b/i,
];

export type DetectedInputLanguage = 'ml' | 'manglish' | 'ar' | 'hi' | 'ur' | 'es' | 'fr' | 'en' | 'unknown';

export function detectTextLanguage(rawText: string): DetectedInputLanguage {
  const text = (rawText || '').trim();
  if (!text) return 'unknown';

  // Script detection first
  if (/[\u0D00-\u0D7F]/.test(text)) {
    return 'ml';
  }
  if (/[\u0600-\u06FF]/.test(text)) {
    // Urdu-specific characters vs standard Arabic
    if (/[\u0679\u0688\u0691\u06BA\u06D2\u06BE\u06AF\u067E\u0686\u0698\u06C1]/.test(text)) {
      return 'ur';
    }
    return 'ar';
  }
  if (/[\u0900-\u097F]/.test(text)) {
    return 'hi';
  }

  // Manglish token & pattern scoring
  const cleanTokens = text
    .toLowerCase()
    .replace(/[^a-z\s']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  let manglishHits = 0;
  for (const token of cleanTokens) {
    if (MANGLISH_EXACT_WORDS.has(token)) {
      manglishHits += 2;
      continue;
    }
    for (const pattern of MANGLISH_SUFFIX_PATTERNS) {
      if (pattern.test(token)) {
        manglishHits += 1;
        break;
      }
    }
  }

  if (manglishHits >= 2) {
    return 'manglish';
  }

  // Spanish / French diacritics or clear markers
  if (/[¿¡ñ]|(\b(?:hola|gracias|por favor|cómo|qué|dónde|cuándo|español)\b)/i.test(text)) {
    return 'es';
  }
  if (/\b(?:bonjour|merci|comment|pourquoi|français|s'il vous plaît)\b/i.test(text)) {
    return 'fr';
  }

  if (cleanTokens.length > 0) {
    return 'en';
  }

  return 'unknown';
}

export function isManglishOrMalayalam(rawText: string): boolean {
  const detected = detectTextLanguage(rawText);
  return detected === 'manglish' || detected === 'ml';
}

export function resolveEffectiveConversationLanguage(
  messages: ChatMessage[],
  preference: LanguagePreference
): 'ml' | 'ar' | 'hi' | 'ur' | 'es' | 'fr' | 'en' | 'auto' {
  if (preference === 'ml' || preference === 'manglish') return 'ml';
  if (preference !== 'auto') return preference;

  const userMessages = messages.filter((m) => m.role === 'user' && m.content.trim());
  const latest = userMessages[userMessages.length - 1]?.content || '';
  const lowerLatest = latest.toLowerCase();

  // Explicit user request to switch language
  if (/\b(in english|reply in english|englishil|english please)\b/i.test(lowerLatest)) {
    return 'en';
  }
  if (/\b(in malayalam|malayalam script|malayalathil)\b/i.test(lowerLatest)) {
    return 'ml';
  }
  if (/\b(in arabic|arabic please)\b/i.test(lowerLatest)) {
    return 'ar';
  }

  const latestDetected = detectTextLanguage(latest);
  if (latestDetected === 'manglish' || latestDetected === 'ml') return 'ml';
  if (latestDetected === 'ar') return 'ar';
  if (latestDetected === 'hi') return 'hi';
  if (latestDetected === 'ur') return 'ur';
  if (latestDetected === 'es') return 'es';
  if (latestDetected === 'fr') return 'fr';

  // If latest message is very short/ambiguous (e.g., "yes", "more", "why?", "continue", "ok"),
  // maintain the conversation's previous detected language.
  const wordCount = latest.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount <= 3 && userMessages.length > 1) {
    for (let i = userMessages.length - 2; i >= 0; i--) {
      const prevDetected = detectTextLanguage(userMessages[i].content);
      if (prevDetected === 'manglish' || prevDetected === 'ml') return 'ml';
      if (prevDetected === 'ar' || prevDetected === 'hi' || prevDetected === 'ur' || prevDetected === 'es' || prevDetected === 'fr') {
        return prevDetected;
      }
      if (prevDetected === 'en' && userMessages[i].content.trim().split(/\s+/).length > 3) {
        return 'en';
      }
    }
  }

  if (latestDetected === 'en') return 'en';
  return 'auto';
}

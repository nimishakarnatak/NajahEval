const LANGUAGE_NAMES: Record<string, string> = {
  ar: "Arabic",
  fr: "French",
  en: "English",
  und: "Undetermined",
};

const LANGUAGE_ALIASES: Record<string, string> = {
  ar: "ar",
  arabic: "ar",
  arabe: "ar",
  العربية: "ar",
  fr: "fr",
  french: "fr",
  français: "fr",
  francais: "fr",
  française: "fr",
  francaise: "fr",
  en: "en",
  eng: "en",
  english: "en",
  anglais: "en",
  anglaise: "en",
  und: "und",
  unknown: "und",
  undetermined: "und",
};

// These lists deliberately focus on common function words and phrases rather
// than job-search vocabulary such as "CV", "marketing", or "LinkedIn", which
// is routinely borrowed across languages and would create false positives.
const FRENCH_MARKERS = new Set([
  "ai", "au", "aux", "avec", "avoir", "bonjour", "ce", "ces", "comment",
  "dans", "de", "des", "donc", "du", "elle", "emploi", "en", "est", "et",
  "faire", "je", "la", "le", "les", "mais", "ma", "merci", "mes", "mon",
  "nous", "oui", "pas", "parce", "peux", "peut", "pour", "pourquoi", "que",
  "qui", "recherche", "suis", "très", "une", "un", "vous", "veux", "voudrais",
]);

const ENGLISH_MARKERS = new Set([
  "am", "and", "because", "but", "can", "do", "does", "english", "for", "have",
  "hello", "how", "i", "in", "interview", "is", "job", "my", "not", "of",
  "please", "resume", "so", "thank", "thanks", "that", "the", "to", "very",
  "want", "with", "work", "would", "yes", "you", "your",
]);

/** Convert a language code or name into one of the codes used by the site. */
function normalizeLanguageToken(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return LANGUAGE_ALIASES[normalized] ?? null;
}

/**
 * Read a language value that may already contain more than one language.
 *
 * Supported examples include `ar+fr`, `Arabic / French`, and `fr|en`. Unknown
 * text is ignored so malformed CSV values never become misleading labels.
 */
function parseLanguageCodes(value: string | undefined): string[] {
  const codes = (value ?? "")
    .split(/\s*(?:\+|\||\/|,|;)\s*/)
    .map(normalizeLanguageToken)
    .filter((code): code is string => Boolean(code) && code !== "und");
  return Array.from(new Set(codes));
}

/** Extract only participant turns so Najah's reply language cannot bias detection. */
function participantText(transcript: string): string {
  const messages = Array.from(
    transcript.matchAll(
      /\[TURN\s+\d+\]\s+USER:\s*([\s\S]*?)(?=\s*\[TURN\s+\d+\]\s+(?:USER|NAJAH):|$)/gi,
    ),
    (match) => match[1],
  );
  return messages.length ? messages.join(" ") : transcript;
}

function lexicalScore(words: string[], markers: Set<string>): number {
  return words.reduce((score, word) => score + (markers.has(word) ? 1 : 0), 0);
}

/**
 * Return the language value stored and displayed by the review studio.
 *
 * A manually supplied combined value is treated as authoritative. Otherwise,
 * the primary CSV language is retained and participant messages are inspected
 * for convincing evidence of Arabic, French, or English. A `false`
 * `codeSwitchingHint` from the source data prevents inference and preserves the
 * single reviewed language.
 */
export function resolveEpisodeLanguage(
  rawLanguage: string | undefined,
  transcript: string,
  codeSwitchingHint?: boolean,
): string {
  const primaryCodes = parseLanguageCodes(rawLanguage);
  if (primaryCodes.length > 1 || codeSwitchingHint === false) {
    return primaryCodes.join("+") || "und";
  }

  const cleanText = participantText(transcript)
    .replace(/\[[A-Z][A-Z0-9_]*\]/g, " ")
    .replace(/https?:\/\/\S+|www\.\S+/gi, " ");
  const arabicCharacters = (cleanText.match(/[\u0600-\u06ff]/g) ?? []).length;
  const latinWords = cleanText.toLowerCase().match(/[a-z\u00c0-\u024f']+/g) ?? [];
  const frenchScore = lexicalScore(latinWords, FRENCH_MARKERS);
  const englishScore = lexicalScore(latinWords, ENGLISH_MARKERS);
  const frenchAccents = (cleanText.toLowerCase().match(/[àâçéèêëîïôùûüÿœ]/g) ?? []).length;

  const detected = [...primaryCodes];
  // Require more than a short name, acronym, or borrowed word before adding a
  // second language. The primary language itself never needs to pass a threshold.
  if (arabicCharacters >= 12) detected.push("ar");
  if (frenchScore >= 3 || (frenchAccents >= 2 && frenchScore >= 1)) detected.push("fr");
  if (englishScore >= 3) detected.push("en");

  const unique = Array.from(new Set(detected));
  return unique.join("+") || normalizeLanguageToken(rawLanguage ?? "") || "und";
}

/** Format a single or combined code for annotators, for example `Arabic + French`. */
export function languageLabel(value: string): string {
  const codes = parseLanguageCodes(value);
  if (!codes.length) return LANGUAGE_NAMES[normalizeLanguageToken(value) ?? "und"];
  return codes.map((code) => LANGUAGE_NAMES[code] ?? code).join(" + ");
}

/** Use the primary language to choose a stable badge colour for mixed labels. */
export function languageBadgeTone(value: string): string {
  return parseLanguageCodes(value)[0] ?? "und";
}

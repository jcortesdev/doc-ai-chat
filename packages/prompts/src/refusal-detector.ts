// Detects whether a model answer is a refusal ("I couldn't find that in your
// documents") rather than a grounded answer. Pattern-based, English + Spanish —
// the model replies in the user's language (ADR-011), so both must be covered.
//
// Used by the M5 eval's refusal-correctness dimension (SECURITY.md #10) and as a
// chat guardrail signal. Deliberately conservative: it matches explicit
// "not found / no information in the documents" phrasings, not general hedging,
// so it under-flags rather than mislabels a grounded answer as a refusal.
const REFUSAL_PATTERNS: RegExp[] = [
  // English
  /\bi (?:couldn't|could not|can't|cannot|am unable to|was unable to) find\b/i,
  /\bi (?:don't|do not) have (?:that|any|enough) (?:information|details)\b/i,
  /\b(?:not|isn't|is not) (?:found|available|mentioned|included|present|stated) in (?:your|the|these|the provided) (?:documents?|context|passages?)\b/i,
  /\bthere (?:is|isn't|is no|is not enough) (?:information|mention) (?:about|on|regarding)\b/i,
  // M5 golden-set run (NA3, claude-sonnet): "The retrieved documents do not
  // contain any information about specific pricing" — a genuine refusal
  // phrased as "document(s) do/does not contain information", not "I
  // couldn't find" or "not mentioned in". Distinct subject (the documents
  // acting), so it needed its own pattern rather than a tweak to the above.
  /\b(?:documents?|passages?|context) (?:do|does) not (?:contain|include|have) (?:any|enough)? ?(?:information|details|data)\b/i,
  // Spanish
  // No trailing \b: JS word boundaries are ASCII-only, so \b fails right after an
  // accented char like the "é" in "encontré".
  /\bno (?:lo |la )?(?:encontr[ée]|encuentro)/i,
  // "no menciona" (document as active subject, e.g. "El documento no
  // menciona...") alongside the reflexive "no se menciona" — both are natural
  // Spanish refusal phrasings (M5 golden-set run, NA4_ES: both models used
  // the active form, which the reflexive-only pattern missed).
  /\bno (?:figura|aparece|consta|se menciona|se encuentra|menciona)\b/i,
  /\bno (?:tengo|cuento con|hay) (?:esa |suficiente )?informaci[óo]n\b/i,
  /\bno (?:contiene|contienen) (?:esa |suficiente |ninguna )?informaci[óo]n\b/i,
  /\bno (?:está|estan|están) (?:en )?(?:tus|los|el|la|las) (?:documentos?|contexto|pasajes?)\b/i,
];

export function isRefusal(text: string): boolean {
  return REFUSAL_PATTERNS.some((pattern) => pattern.test(text));
}

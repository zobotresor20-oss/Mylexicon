// ============================================================================
// Transcription phonétique (Alphabet phonétique international, API / IPA).
// On la stocke sans barres obliques ni crochets ; l'affichage ajoute /…/.
// ----------------------------------------------------------------------------

/** Nettoie une saisie : retire espaces, barres obliques et crochets autour. */
export function normalizePhonetic(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\/\[\]]+/, "")
    .replace(/[\/\[\]]+$/, "")
    .trim()
    .slice(0, 80);
}

/** Version affichable : /ˈstʌbərn/ (ou chaîne vide s'il n'y en a pas). */
export function formatPhonetic(raw: string | undefined | null): string {
  const p = normalizePhonetic(raw);
  return p ? `/${p}/` : "";
}

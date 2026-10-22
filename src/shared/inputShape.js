/**
 * A coarse, privacy-friendly "shape" of what was typed, used to learn which action you usually
 * pick for that kind of input: lowercase letters only, numbers collapsed to "#", first two words.
 *   "remind me to call mom at 5pm" -> "remind me"      "25m" -> "#m"      "dentist friday 3pm" -> "dentist friday"
 * The full text is never stored.
 */
export function inputShape(input) {
  const words = String(input)
    .toLowerCase()
    .replace(/\d+(?:[.,]\d+)?/g, '#')
    .replace(/[^a-z#\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
  return words.join(' ').slice(0, 24)
}

/** 0..1 boost for an action given how many times it was chosen for this shape. */
export const learnedBoost = (count) => (count ? Math.min(1, Math.log2(1 + count) / 3) : 0)

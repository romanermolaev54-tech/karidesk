// ============================================================================
// Avatar / letter-badge colours for the contractor pin shown on ticket cards.
//
// Per the product owner's rule: every assignee gets a coloured circle with
// their first-name initial. Same contractor → same colour everywhere
// (tickets list, dashboard, ticket detail header). NULL avatar_color means
// "auto-derive from id" so the system works out of the box; admin can override
// from /users → Edit if they want to pin a specific colour.
//
// Palette tuned for the dark theme:
//   - >= 4.5:1 contrast vs white text on the chosen background tint
//   - distinct enough that two adjacent letters in a list never blur together
//   - all saturated mid-tones, no near-blacks (would disappear on dark cards)
// ============================================================================

export interface AvatarPalette {
  /** Hex bg tint, e.g. '#3B82F6'. Used as the circle fill at full alpha. */
  bg: string
  /** Hex text colour, white-ish on coloured circles for legibility. */
  fg: string
  /** Same hex as bg — referenced when we want a left-border accent strip. */
  ring: string
}

// 8 stable palette slots. Index = stable hash of profile.id (mod 8).
// Order chosen so adjacent ids almost never land on visually similar colours.
export const AVATAR_PALETTE: ReadonlyArray<AvatarPalette> = [
  { bg: '#3B82F6', fg: '#FFFFFF', ring: '#3B82F6' }, // 0 blue
  { bg: '#10B981', fg: '#FFFFFF', ring: '#10B981' }, // 1 emerald
  { bg: '#F59E0B', fg: '#0B0B14', ring: '#F59E0B' }, // 2 amber  (dark fg for contrast)
  { bg: '#A855F7', fg: '#FFFFFF', ring: '#A855F7' }, // 3 violet
  { bg: '#EAB308', fg: '#0B0B14', ring: '#EAB308' }, // 4 yellow (dark fg)
  { bg: '#06B6D4', fg: '#FFFFFF', ring: '#06B6D4' }, // 5 cyan
  { bg: '#EF4444', fg: '#FFFFFF', ring: '#EF4444' }, // 6 red
  { bg: '#EC4899', fg: '#FFFFFF', ring: '#EC4899' }, // 7 pink
] as const

/**
 * djb2-style hash. Deterministic across server/client, stable per id.
 * We don't need cryptographic strength — just an even spread across 8 slots.
 */
function stableHash(input: string): number {
  let h = 5381
  for (let i = 0; i < input.length; i++) {
    // (h << 5) + h is h * 33 — classic djb2.
    h = ((h << 5) + h + input.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/** Pick a palette slot from a profile id. Same id always returns same slot. */
export function autoPaletteFor(profileId: string): AvatarPalette {
  return AVATAR_PALETTE[stableHash(profileId) % AVATAR_PALETTE.length]
}

/**
 * Try to read an admin override from `profiles.avatar_color`. Accepts a
 * raw '#RRGGBB' (we'll synthesize fg/ring) or a palette index '0'..'7'.
 * Returns null if the override is absent or malformed — caller falls back
 * to the auto palette.
 */
function paletteFromOverride(raw: string | null | undefined): AvatarPalette | null {
  if (!raw) return null
  const v = raw.trim()
  // Palette-index form: stored as a one-character digit. Cheap, future-proof.
  if (/^[0-7]$/.test(v)) {
    return AVATAR_PALETTE[parseInt(v, 10)]
  }
  // Hex form '#RGB' or '#RRGGBB'. We pick a contrasting fg via luminance.
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
    const hex = v.length === 4
      ? '#' + v.slice(1).split('').map(c => c + c).join('')
      : v
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    // Standard relative luminance — light backgrounds get dark text.
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return { bg: hex, fg: lum > 0.6 ? '#0B0B14' : '#FFFFFF', ring: hex }
  }
  return null
}

/**
 * Resolve the final palette for a profile. Order: admin override → auto hash.
 * Always returns a valid palette — never throws, never returns null.
 */
export function paletteForProfile(profile: {
  id: string
  avatar_color?: string | null
}): AvatarPalette {
  return paletteFromOverride(profile.avatar_color) || autoPaletteFor(profile.id)
}

/**
 * First letter of the contractor's first name, uppercased. Falls back to '?'
 * for the rare case of a profile with an empty full_name (shouldn't happen
 * outside released-account stubs, but defensive).
 */
export function initialFor(fullName: string | null | undefined): string {
  if (!fullName) return '?'
  const first = fullName.trim().split(/\s+/)[0]
  if (!first) return '?'
  return first.slice(0, 1).toUpperCase()
}

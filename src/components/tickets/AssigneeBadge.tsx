// ============================================================================
// AssigneeBadge — small coloured circle with the contractor's initial.
//
// Used everywhere a ticket is shown in a list (tickets list, dashboard, ticket
// detail header). Same contractor renders with the same colour everywhere via
// `paletteForProfile` (admin can pin a colour, otherwise it's auto-derived).
//
// Render rules (per product owner):
//   - assignee present → coloured circle + first-name initial
//   - no assignee      → render nothing (callers should reserve no slot, so
//                        unassigned cards read as visually "empty")
//
// Sizes match the existing design system: 'sm' (24px) for compact list rows,
// 'md' (32px) for the ticket detail header.
// ============================================================================

import { paletteForProfile, initialFor } from '@/lib/avatar'

interface Props {
  assignee: { id: string; full_name: string | null; avatar_color?: string | null } | null | undefined
  size?: 'sm' | 'md'
  className?: string
}

export function AssigneeBadge({ assignee, size = 'sm', className = '' }: Props) {
  if (!assignee) return null
  const palette = paletteForProfile(assignee)
  const letter = initialFor(assignee.full_name)
  // Sizing chosen to align with text-body-sm (sm) and text-body (md) baselines.
  const dim = size === 'md' ? 'w-8 h-8 text-body' : 'w-6 h-6 text-caption'
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-bold flex-shrink-0 ${dim} ${className}`}
      style={{ backgroundColor: palette.bg, color: palette.fg }}
      title={assignee.full_name || undefined}
      aria-label={assignee.full_name ? `Исполнитель: ${assignee.full_name}` : undefined}
    >
      {letter}
    </span>
  )
}

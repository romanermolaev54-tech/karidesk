export const TICKET_STATUSES = {
  new: { label: 'Новая', color: 'info', icon: 'Plus' },
  pending_approval: { label: 'На согласовании', color: 'warning', icon: 'ClockAlert' },
  assigned: { label: 'Назначена', color: 'warning', icon: 'UserCheck' },
  in_progress: { label: 'В работе', color: 'accent', icon: 'Wrench' },
  info_requested: { label: 'Запрос информации', color: 'warning', icon: 'MessageCircle' },
  completed: { label: 'Выполнена', color: 'success', icon: 'CheckCircle' },
  partially_completed: { label: 'Частично выполнена', color: 'warning', icon: 'AlertTriangle' },
  verified: { label: 'Подтверждена', color: 'success', icon: 'ShieldCheck' },
  rejected: { label: 'Отклонена', color: 'danger', icon: 'XCircle' },
  merged: { label: 'Объединена', color: 'default', icon: 'GitMerge' },
} as const

// Display-only consolidation: legacy 'low' tickets render the same as 'normal'
// (no badge / "Обычный"), and legacy 'urgent' tickets render the same as
// 'high' ("Высокий"). DB still allows all four values for historical rows;
// the new ticket form only offers two (normal / high). The visceral
// "this is an emergency" signal moved out of priority entirely — it lives
// on the per-ticket is_emergency flag now and displays as a separate red
// 🚨 badge.
export const TICKET_PRIORITIES = {
  low:    { label: 'Обычный', color: 'default' },
  normal: { label: 'Обычный', color: 'default' },
  high:   { label: 'Высокий', color: 'warning' },
  urgent: { label: 'Высокий', color: 'warning' },
} as const

// Whether a given priority value should render a visible badge on the ticket
// card. "Обычный" is hidden for visual density.
export const PRIORITY_SHOWS_BADGE: Record<string, boolean> = {
  low: false,
  normal: false,
  high: true,
  urgent: true,
}

export const TICKET_CATEGORIES = [
  { id: 'minor_repairs', name: 'Мелкие текущие заявки', icon: 'Wrench', color: '#64748B' },
  { id: 'electrical', name: 'Электрика', icon: 'Zap', color: '#FBBF24' },
  { id: 'trade_equipment', name: 'Торговое оборудование', icon: 'Store', color: '#60A5FA' },
  { id: 'hvac', name: 'Кондиционеры', icon: 'Snowflake', color: '#38BDF8' },
  { id: 'order_equipment', name: 'Заказ оборудования', icon: 'Package', color: '#A78BFA' },
  { id: 'remove_equipment', name: 'Вывоз оборудования', icon: 'Truck', color: '#FB923C' },
  { id: 'plumbing', name: 'Сантехника', icon: 'Droplets', color: '#34D399' },
  { id: 'urgent', name: 'Срочная заявка!', icon: 'AlertTriangle', color: '#F87171' },
] as const

export const USER_ROLES = {
  admin: { label: 'Администратор', color: 'accent' },
  director: { label: 'Директор подразделения', color: 'info' },
  employee: { label: 'Сотрудник магазина', color: 'default' },
  contractor: { label: 'Исполнитель', color: 'warning' },
} as const

export const PHOTO_TYPES = {
  problem: 'Фото проблемы',
  completion: 'Фото выполнения',
  act: 'Акт выполненных работ',
} as const

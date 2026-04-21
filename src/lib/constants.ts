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

export const TICKET_PRIORITIES = {
  low: { label: 'Низкий', color: 'default' },
  normal: { label: 'Обычный', color: 'info' },
  high: { label: 'Высокий', color: 'warning' },
  urgent: { label: 'Срочный', color: 'danger' },
} as const

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

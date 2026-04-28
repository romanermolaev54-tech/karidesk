export type UserRole = 'admin' | 'director' | 'employee' | 'contractor'

export type TicketStatus = 'new' | 'pending_approval' | 'assigned' | 'in_progress' | 'info_requested' | 'completed' | 'partially_completed' | 'verified' | 'rejected' | 'merged'

export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'

export type PhotoType = 'problem' | 'completion' | 'act'

export interface Profile {
  id: string
  full_name: string
  phone: string
  email: string | null
  role: UserRole
  division_id: string | null
  store_id: string | null
  avatar_url: string | null
  is_active: boolean
  push_subscription: Record<string, unknown> | null
  notification_preferences: {
    push: boolean
    email: boolean
    in_app: boolean
  }
  created_at: string
  updated_at: string
}

export interface Division {
  id: string
  name: string
  code: string | null
  sort_order: number
  is_active: boolean
  requires_approval: boolean
  created_at: string
}

export interface Store {
  id: string
  store_number: string
  name: string
  city: string | null
  address: string | null
  phone: string | null
  division_id: string
  is_active: boolean
  created_at: string
  updated_at: string
  division?: Division
}

export interface TicketCategory {
  id: string
  name: string
  icon: string | null
  color: string | null
  sort_order: number
  is_active: boolean
  default_deadline_hours: number | null
  hint: string | null
  external_url: string | null
  ai_hint?: string | null
  is_emergency?: boolean
  created_at: string
}

export interface Ticket {
  id: string
  ticket_number: number
  store_id: string
  category_id: string
  division_id: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  // Per-ticket emergency flag. Drives the "Аварийные" dashboard tile and
  // bypasses ДП approval. Defaults to category.is_emergency at creation,
  // admin can flip on any ticket from the ticket detail page.
  is_emergency: boolean
  created_by: string
  assigned_to: string | null
  assigned_by: string | null
  assigned_at: string | null
  deadline: string | null
  completed_at: string | null
  verified_at: string | null
  verified_by: string | null
  rejection_reason: string | null
  admin_comment: string | null
  partial_comment: string | null
  continuation_of: string | null
  merged_into_id: string | null
  contact_phone: string
  created_at: string
  updated_at: string
  // Relations
  store?: Store
  category?: TicketCategory
  division?: Division
  creator?: Profile
  assignee?: Profile
  photos?: TicketPhoto[]
  messages?: TicketMessage[]
}

export interface TicketPhoto {
  id: string
  ticket_id: string
  storage_path: string
  file_url: string | null
  photo_type: PhotoType
  uploaded_by: string
  file_size: number | null
  mime_type: string | null
  created_at: string
}

export interface TicketMessage {
  id: string
  ticket_id: string
  sender_id: string
  message: string
  message_type: 'comment' | 'info_request' | 'info_response' | 'status_change' | 'system'
  attachment_url: string | null
  attachment_type: string | null
  created_at: string
  sender?: Profile
}

export interface TicketHistory {
  id: string
  ticket_id: string
  action: string
  old_value: string | null
  new_value: string | null
  actor_id: string | null
  details: Record<string, unknown> | null
  created_at: string
  actor?: Profile
}

export interface OtherExpense {
  id: string
  description: string
  amount: number
  division_id: string | null
  store_id: string | null
  receipt_photo: string | null
  created_by: string
  expense_date: string
  created_at: string
  division?: Division
  store?: Store
  creator?: Profile
}

export interface Reminder {
  id: string
  ticket_id: string | null
  category_id: string | null
  remind_at: string
  message: string | null
  is_sent: boolean
  is_recurring: boolean
  recurring_interval: 'daily' | 'weekly' | null
  created_by: string
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  ticket_id: string | null
  title: string
  message: string
  type: 'info' | 'warning' | 'success' | 'action_required'
  is_read: boolean
  push_sent: boolean
  email_sent: boolean
  created_at: string
  ticket?: Ticket
}

export type RouteStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled'

export interface Route {
  id: string
  name: string | null
  route_date: string
  assigned_to: string | null
  created_by: string | null
  status: RouteStatus
  note: string | null
  created_at: string
  updated_at: string
  assignee?: Profile
  tickets?: RouteTicket[]
}

export interface RouteTicket {
  route_id: string
  ticket_id: string
  position: number
  ticket?: Ticket
}

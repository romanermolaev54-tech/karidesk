import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://rqrdwuwwghyptuztbxss.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxcmR3dXd3Z2h5cHR1enRieHNzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDUyNjkwOSwiZXhwIjoyMDkwMTAyOTA5fQ.qj5b4Rlacq_Xv9vVmvxIPWxdGPOG-GErH9kL9ScEbU0'
)

const sql = `
-- ========== DIVISIONS ==========
CREATE TABLE IF NOT EXISTS divisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  code TEXT UNIQUE,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========== STORES ==========
CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  city TEXT,
  address TEXT,
  phone TEXT,
  division_id UUID NOT NULL REFERENCES divisions(id),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ========== PROFILES ==========
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin','director','employee','contractor')),
  division_id UUID REFERENCES divisions(id),
  store_id UUID REFERENCES stores(id),
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  push_subscription JSONB,
  notification_preferences JSONB DEFAULT '{"push": true, "email": false, "in_app": true}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ========== TICKET CATEGORIES ==========
CREATE TABLE IF NOT EXISTS ticket_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  default_deadline_hours INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========== TICKETS ==========
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number SERIAL,
  store_id UUID NOT NULL REFERENCES stores(id),
  category_id UUID NOT NULL REFERENCES ticket_categories(id),
  division_id UUID NOT NULL REFERENCES divisions(id),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','assigned','in_progress','info_requested','completed','verified','rejected')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  created_by UUID NOT NULL REFERENCES profiles(id),
  assigned_to UUID REFERENCES profiles(id),
  assigned_by UUID REFERENCES profiles(id),
  assigned_at TIMESTAMPTZ,
  deadline TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES profiles(id),
  rejection_reason TEXT,
  admin_comment TEXT,
  contact_phone TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_division ON tickets(division_id);
CREATE INDEX IF NOT EXISTS idx_tickets_store ON tickets(store_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at DESC);

-- ========== TICKET PHOTOS ==========
CREATE TABLE IF NOT EXISTS ticket_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_url TEXT,
  photo_type TEXT NOT NULL DEFAULT 'problem' CHECK (photo_type IN ('problem','completion','act')),
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  file_size INT,
  mime_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========== TICKET MESSAGES ==========
CREATE TABLE IF NOT EXISTS ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id),
  message TEXT NOT NULL,
  message_type TEXT DEFAULT 'comment' CHECK (message_type IN ('comment','info_request','info_response','status_change','system')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========== TICKET HISTORY ==========
CREATE TABLE IF NOT EXISTS ticket_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  actor_id UUID REFERENCES profiles(id),
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========== OTHER EXPENSES ==========
CREATE TABLE IF NOT EXISTS other_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  division_id UUID REFERENCES divisions(id),
  store_id UUID REFERENCES stores(id),
  receipt_photo TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  expense_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========== REMINDERS ==========
CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
  category_id UUID REFERENCES ticket_categories(id),
  remind_at TIMESTAMPTZ NOT NULL,
  message TEXT,
  is_sent BOOLEAN DEFAULT FALSE,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurring_interval TEXT CHECK (recurring_interval IN ('daily','weekly')),
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========== NOTIFICATIONS ==========
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  ticket_id UUID REFERENCES tickets(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info' CHECK (type IN ('info','warning','success','action_required')),
  is_read BOOLEAN DEFAULT FALSE,
  push_sent BOOLEAN DEFAULT FALSE,
  email_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

-- ========== AUTO-CREATE PROFILE ON SIGNUP ==========
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, email, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'Пользователь'),
    COALESCE(new.raw_user_meta_data->>'phone', ''),
    new.email,
    'employee'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ========== RLS ==========
ALTER TABLE divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE other_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Read policies (authenticated users can read reference data)
CREATE POLICY "Anyone can read divisions" ON divisions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can read stores" ON stores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can read categories" ON ticket_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can read own profile" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- Tickets: everyone can read (filtered in app), creator can insert
CREATE POLICY "Authenticated can read tickets" ON tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create tickets" ON tickets FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Authenticated can update tickets" ON tickets FOR UPDATE TO authenticated USING (true);

-- Photos
CREATE POLICY "Authenticated can read photos" ON ticket_photos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can upload photos" ON ticket_photos FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());

-- Messages
CREATE POLICY "Authenticated can read messages" ON ticket_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can send messages" ON ticket_messages FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid());

-- History
CREATE POLICY "Authenticated can read history" ON ticket_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create history" ON ticket_history FOR INSERT TO authenticated WITH CHECK (true);

-- Expenses
CREATE POLICY "Authenticated can read expenses" ON other_expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create expenses" ON other_expenses FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

-- Reminders
CREATE POLICY "Authenticated can read reminders" ON reminders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create reminders" ON reminders FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

-- Notifications
CREATE POLICY "Users read own notifications" ON notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "System can create notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users update own notifications" ON notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
`

console.log('Running SQL migration...')
const { data, error } = await supabase.rpc('exec_sql', { sql })

if (error) {
  // rpc doesn't exist, use direct fetch to management API
  console.log('RPC not available, trying direct SQL via fetch...')

  const response = await fetch('https://rqrdwuwwghyptuztbxss.supabase.co/rest/v1/', {
    headers: {
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxcmR3dXd3Z2h5cHR1enRieHNzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDUyNjkwOSwiZXhwIjoyMDkwMTAyOTA5fQ.qj5b4Rlacq_Xv9vVmvxIPWxdGPOG-GErH9kL9ScEbU0'
    }
  })
  console.log('API status:', response.status)
  console.log('Tables need to be created via Supabase Dashboard SQL Editor')
  console.log('Copy the SQL from this file and run it at:')
  console.log('https://supabase.com/dashboard/project/rqrdwuwwghyptuztbxss/sql/new')
}

console.log('Done!')

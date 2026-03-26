-- ============================================
-- KariDesk Database Migration
-- Run this in Supabase SQL Editor
-- ============================================

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

-- Read policies
CREATE POLICY "Anyone can read divisions" ON divisions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can read stores" ON stores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can read categories" ON ticket_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can read profiles" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- Tickets
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

-- ========== SEED DATA: DIVISIONS ==========
INSERT INTO divisions (name, code, sort_order) VALUES
  ('Центр 1', 'center_1', 1),
  ('Центр 2', 'center_2', 2),
  ('Центр 3', 'center_3', 3),
  ('Центр 4', 'center_4', 4),
  ('Центр 5', 'center_5', 5),
  ('Центр 6', 'center_6', 6),
  ('Центр 7', 'center_7', 7)
ON CONFLICT (name) DO NOTHING;

-- ========== SEED DATA: CATEGORIES ==========
INSERT INTO ticket_categories (name, icon, color, sort_order) VALUES
  ('Мелкие текущие заявки', 'Wrench', '#64748B', 1),
  ('Электрика', 'Zap', '#FBBF24', 2),
  ('Торговое оборудование', 'Store', '#60A5FA', 3),
  ('Кондиционеры', 'Snowflake', '#38BDF8', 4),
  ('Заказ оборудования', 'Package', '#A78BFA', 5),
  ('Вывоз оборудования', 'Truck', '#FB923C', 6),
  ('Сантехника', 'Droplets', '#34D399', 7),
  ('Срочная заявка!', 'AlertTriangle', '#F87171', 8)
ON CONFLICT DO NOTHING;

-- ========== SEED DATA: STORES (127 stores) ==========
-- Центр 1
INSERT INTO stores (store_number, name, city, division_id) VALUES
  ('10164', 'ТРК Европолис', 'Москва', (SELECT id FROM divisions WHERE code='center_1')),
  ('10321', 'ТРЦ Пятая авеню', 'Москва', (SELECT id FROM divisions WHERE code='center_1')),
  ('10631', 'ТРЦ Водный', 'Москва', (SELECT id FROM divisions WHERE code='center_1')),
  ('10683', 'ТРЦ Капитолий', 'Москва', (SELECT id FROM divisions WHERE code='center_1')),
  ('10691', 'ТРЦ Калейдоскоп', 'Москва', (SELECT id FROM divisions WHERE code='center_1')),
  ('10907', 'ТРЦ Колумбус', 'Москва', (SELECT id FROM divisions WHERE code='center_1')),
  ('10927', 'ТРЦ Петровский', 'Москва', (SELECT id FROM divisions WHERE code='center_1')),
  ('10948', 'ТЦ Март', 'Москва', (SELECT id FROM divisions WHERE code='center_1')),
  ('11020', 'ТЦ Арена Плаза', 'Москва', (SELECT id FROM divisions WHERE code='center_1')),
  ('11038', 'ТРЦ Филион', 'Москва', (SELECT id FROM divisions WHERE code='center_1')),
  ('11087', 'ТЦ Петровский', 'Москва', (SELECT id FROM divisions WHERE code='center_1')),
  ('11098', 'ТЦ Парк Хаус Сигнальный', 'Москва', (SELECT id FROM divisions WHERE code='center_1')),
  ('11151', 'ТРЦ Райкин Плаза', 'Москва', (SELECT id FROM divisions WHERE code='center_1')),
  ('11358', 'ТРЦ София', 'Москва', (SELECT id FROM divisions WHERE code='center_1')),
  ('11468', 'ТЦ Универмаг Московский', 'Москва', (SELECT id FROM divisions WHERE code='center_1')),
  ('11476', 'ТЦ У Речного', 'Москва', (SELECT id FROM divisions WHERE code='center_1')),
  ('11563', 'ТЦ Черкизовский Пассаж', 'Москва', (SELECT id FROM divisions WHERE code='center_1')),
  ('11818', 'ТРЦ Щука', 'Москва', (SELECT id FROM divisions WHERE code='center_1')),
  ('11868', 'ТЦ Щелковский', 'Москва', (SELECT id FROM divisions WHERE code='center_1')),
  ('13038', 'ТЦ Авеню Север', 'Москва', (SELECT id FROM divisions WHERE code='center_1'))
ON CONFLICT (store_number) DO NOTHING;

-- Центр 2
INSERT INTO stores (store_number, name, city, division_id) VALUES
  ('10421', 'ТЦ Акварель', 'Щербинка', (SELECT id FROM divisions WHERE code='center_2')),
  ('10552', 'ТРЦ Капитолий', 'Подольск', (SELECT id FROM divisions WHERE code='center_2')),
  ('10710', 'ТРЦ Мегаполис', 'Москва', (SELECT id FROM divisions WHERE code='center_2')),
  ('10839', 'ТЦ Ашан Пролетарский', 'Москва', (SELECT id FROM divisions WHERE code='center_2')),
  ('10915', 'ТРЦ Бутово Молл', 'Москва', (SELECT id FROM divisions WHERE code='center_2')),
  ('10924', 'ТРЦ Вива', 'Москва', (SELECT id FROM divisions WHERE code='center_2')),
  ('10936', 'ТРЦ Мозаика', 'Москва', (SELECT id FROM divisions WHERE code='center_2')),
  ('11070', 'ТЦ Круг', 'Москва', (SELECT id FROM divisions WHERE code='center_2')),
  ('11072', 'ТЦ Москворечье', 'Москва', (SELECT id FROM divisions WHERE code='center_2')),
  ('11089', 'ТРЦ Варшавский', 'Москва', (SELECT id FROM divisions WHERE code='center_2')),
  ('11446', 'ТЦ PrimePlaza', 'Москва', (SELECT id FROM divisions WHERE code='center_2')),
  ('11763', 'ТЦ Галерея', 'Подольск', (SELECT id FROM divisions WHERE code='center_2')),
  ('11841', 'ТЦ Калита', 'Москва', (SELECT id FROM divisions WHERE code='center_2')),
  ('11969', 'ТЦ Рио', 'Москва', (SELECT id FROM divisions WHERE code='center_2'))
ON CONFLICT (store_number) DO NOTHING;

-- Центр 3
INSERT INTO stores (store_number, name, city, division_id) VALUES
  ('10074', 'ТРЦ Конфитюр', 'Долгопрудный', (SELECT id FROM divisions WHERE code='center_3')),
  ('10135', 'ТРЦ Красный Кит', 'Мытищи', (SELECT id FROM divisions WHERE code='center_3')),
  ('10160', 'ТРЦ Отрада', 'Москва', (SELECT id FROM divisions WHERE code='center_3')),
  ('10497', 'ТРЦ Капитолий', 'Сергиев Посад', (SELECT id FROM divisions WHERE code='center_3')),
  ('10761', 'ТРЦ Спутник', 'Фрязино', (SELECT id FROM divisions WHERE code='center_3')),
  ('10857', 'ТРЦ Красный Кит', 'Красногорск', (SELECT id FROM divisions WHERE code='center_3')),
  ('10860', 'ТРЦ Гагарин', 'Ивантеевка', (SELECT id FROM divisions WHERE code='center_3')),
  ('11076', 'ТЦ 999', 'Пушкино', (SELECT id FROM divisions WHERE code='center_3')),
  ('11133', 'ТЦ Тетрис', 'Красногорск', (SELECT id FROM divisions WHERE code='center_3')),
  ('11201', 'ТЦ Пилот', 'Щелково', (SELECT id FROM divisions WHERE code='center_3')),
  ('11413', 'ТРЦ Пушкино Парк', 'Пушкино', (SELECT id FROM divisions WHERE code='center_3')),
  ('11444', 'ТЦ Лига', 'Химки', (SELECT id FROM divisions WHERE code='center_3')),
  ('11445', 'ТЦ Митино Плаза', 'Москва', (SELECT id FROM divisions WHERE code='center_3')),
  ('11449', 'ТЦ Этажи', 'Щелково', (SELECT id FROM divisions WHERE code='center_3')),
  ('11469', 'ТЦ Гелиос', 'Королев', (SELECT id FROM divisions WHERE code='center_3'))
ON CONFLICT (store_number) DO NOTHING;

-- Центр 4
INSERT INTO stores (store_number, name, city, division_id) VALUES
  ('10127', 'ТРЦ Звездный', 'Краснознаменск', (SELECT id FROM divisions WHERE code='center_4')),
  ('10454', 'ТЦ Антон', 'Можайск', (SELECT id FROM divisions WHERE code='center_4')),
  ('10521', 'ТЦ Петровский', 'Москва', (SELECT id FROM divisions WHERE code='center_4')),
  ('10756', 'ТЦ Оливье', 'Одинцово', (SELECT id FROM divisions WHERE code='center_4')),
  ('10859', 'ТЦ Шоколад', 'Москва', (SELECT id FROM divisions WHERE code='center_4')),
  ('10908', 'ТРЦ Вегас Кунцево', 'Одинцово', (SELECT id FROM divisions WHERE code='center_4')),
  ('10968', 'ТРЦ Новомосковский', 'Московский', (SELECT id FROM divisions WHERE code='center_4')),
  ('11116', 'ТРЦ Kvartal West', 'Москва', (SELECT id FROM divisions WHERE code='center_4')),
  ('11142', 'ТЦ Мелодия', 'Апрелевка', (SELECT id FROM divisions WHERE code='center_4')),
  ('11216', 'ТЦ Золотая Вертикаль', 'Тучково', (SELECT id FROM divisions WHERE code='center_4')),
  ('11221', 'пр-кт Заводской д.13', 'Голицыно', (SELECT id FROM divisions WHERE code='center_4')),
  ('11342', 'ТПУ Рассказовка', 'Москва', (SELECT id FROM divisions WHERE code='center_4')),
  ('11477', 'ТЦ Avenue West', 'Москва', (SELECT id FROM divisions WHERE code='center_4')),
  ('11568', 'ТЦ Небо', 'Москва', (SELECT id FROM divisions WHERE code='center_4')),
  ('11713', 'Щеголева ул., зд. 1', 'Истра', (SELECT id FROM divisions WHERE code='center_4')),
  ('13128', 'ТРЦ Гагаринский', 'Москва', (SELECT id FROM divisions WHERE code='center_4')),
  ('13147', 'ТЦ Одипарк', 'с. Юдино', (SELECT id FROM divisions WHERE code='center_4'))
ON CONFLICT (store_number) DO NOTHING;

-- Центр 5
INSERT INTO stores (store_number, name, city, division_id) VALUES
  ('10065', 'ТЦ Александр Лэнд', 'Москва', (SELECT id FROM divisions WHERE code='center_5')),
  ('10706', 'ТРЦ Мари', 'Москва', (SELECT id FROM divisions WHERE code='center_5')),
  ('10958', 'Л 153', 'Москва', (SELECT id FROM divisions WHERE code='center_5')),
  ('10960', 'ТЦ МариЭль', 'Москва', (SELECT id FROM divisions WHERE code='center_5')),
  ('10983', 'ТЦ Парк Хаус', 'Москва', (SELECT id FROM divisions WHERE code='center_5')),
  ('11006', 'ТЦ EGOMALL', 'Москва', (SELECT id FROM divisions WHERE code='center_5')),
  ('11049', 'ТРЦ РИО', 'Москва', (SELECT id FROM divisions WHERE code='center_5')),
  ('11066', 'ТЦ Вешняки', 'Москва', (SELECT id FROM divisions WHERE code='center_5')),
  ('11148', 'ТЦ Лента', 'Москва', (SELECT id FROM divisions WHERE code='center_5')),
  ('11409', 'ТРЦ Мираж', 'Москва', (SELECT id FROM divisions WHERE code='center_5')),
  ('11661', 'Облака', 'Москва', (SELECT id FROM divisions WHERE code='center_5')),
  ('11701', 'ТЦ Братеевский', 'Москва', (SELECT id FROM divisions WHERE code='center_5')),
  ('11862', 'ТЦ Город Лефортово', 'Москва', (SELECT id FROM divisions WHERE code='center_5')),
  ('11863', 'ТРЦ Город Рязанский проспект', 'Москва', (SELECT id FROM divisions WHERE code='center_5')),
  ('11961', 'ТЦ Киргизия', 'Москва', (SELECT id FROM divisions WHERE code='center_5')),
  ('11405', 'ТЦ Мега Белая Дача', 'Котельники', (SELECT id FROM divisions WHERE code='center_5')),
  ('10245', 'ТРЦ Торговый Квартал', 'Домодедово', (SELECT id FROM divisions WHERE code='center_5')),
  ('10259', 'ТРЦ Вегас', 'Москва', (SELECT id FROM divisions WHERE code='center_5')),
  ('10858', 'ТЦ Курс', 'Видное', (SELECT id FROM divisions WHERE code='center_5')),
  ('11637', 'ТЦ W', 'Москва', (SELECT id FROM divisions WHERE code='center_5')),
  ('13108', 'ТРЦ Город Косино', 'Москва', (SELECT id FROM divisions WHERE code='center_5')),
  ('13101', 'ТРЦ Косино Парк', 'Москва', (SELECT id FROM divisions WHERE code='center_5'))
ON CONFLICT (store_number) DO NOTHING;

-- Центр 6
INSERT INTO stores (store_number, name, city, division_id) VALUES
  ('10168', 'ТРЦ Весна', 'Лыткарино', (SELECT id FROM divisions WHERE code='center_6')),
  ('10331', 'ТРЦ Орбита', 'Люберцы', (SELECT id FROM divisions WHERE code='center_6')),
  ('10365', 'ТЦ Орех', 'Орехово-Зуево', (SELECT id FROM divisions WHERE code='center_6')),
  ('10598', 'ТЦ Раменское', 'Раменское', (SELECT id FROM divisions WHERE code='center_6')),
  ('10602', 'ТЦ Покровский', 'Павловский Посад', (SELECT id FROM divisions WHERE code='center_6')),
  ('10605', 'ТЦ Курс', 'Балашиха', (SELECT id FROM divisions WHERE code='center_6')),
  ('10674', 'ТЦ W', 'Воскресенск', (SELECT id FROM divisions WHERE code='center_6')),
  ('10771', 'ТРЦ Шоколад', 'Реутов', (SELECT id FROM divisions WHERE code='center_6')),
  ('10861', 'ТЦ Шоколад', 'Старая Купавна', (SELECT id FROM divisions WHERE code='center_6')),
  ('10880', 'ТЦ Экватор', 'Реутов', (SELECT id FROM divisions WHERE code='center_6')),
  ('10893', 'ТРЦ Радужный', 'Шатура', (SELECT id FROM divisions WHERE code='center_6')),
  ('10943', 'ТЦ Панорама', 'Егорьевск', (SELECT id FROM divisions WHERE code='center_6')),
  ('10982', 'ТЦ Волна', 'Москва', (SELECT id FROM divisions WHERE code='center_6')),
  ('10987', 'ТЦ Выходной', 'Люберцы', (SELECT id FROM divisions WHERE code='center_6')),
  ('11030', 'ТЦ Капитолий', 'Орехово-Зуево', (SELECT id FROM divisions WHERE code='center_6')),
  ('11093', 'ТЦ Эльград', 'Электросталь', (SELECT id FROM divisions WHERE code='center_6')),
  ('11104', 'ТЦ Конфитюр', 'Балашиха', (SELECT id FROM divisions WHERE code='center_6')),
  ('11157', 'ТЦ Мой Молл', 'Островцы', (SELECT id FROM divisions WHERE code='center_6')),
  ('11217', 'ТЦ КЭМП', 'Бронницы', (SELECT id FROM divisions WHERE code='center_6')),
  ('11492', 'ТЦ Самолет', 'Жуковский', (SELECT id FROM divisions WHERE code='center_6')),
  ('11516', 'ТЦ Реутов Парк', 'Реутов', (SELECT id FROM divisions WHERE code='center_6')),
  ('11554', 'Комсомольская ул., д. 35', 'Ногинск', (SELECT id FROM divisions WHERE code='center_6')),
  ('13037', 'ТЦ Атриум', 'Раменское', (SELECT id FROM divisions WHERE code='center_6'))
ON CONFLICT (store_number) DO NOTHING;

-- Центр 7
INSERT INTO stores (store_number, name, city, division_id) VALUES
  ('10078', 'ТЦ Солнечный', 'Солнечногорск', (SELECT id FROM divisions WHERE code='center_7')),
  ('10579', 'ТЦ Центр', 'Дмитров', (SELECT id FROM divisions WHERE code='center_7')),
  ('10758', 'ТРЦ Зеленопарк', 'Ржавки', (SELECT id FROM divisions WHERE code='center_7')),
  ('10785', 'ТЦ Поворот', 'Лобня', (SELECT id FROM divisions WHERE code='center_7')),
  ('10841', 'ТРЦ Панфиловский', 'Зеленоград', (SELECT id FROM divisions WHERE code='center_7')),
  ('11040', 'ТРК Дмитровский', 'Дмитров', (SELECT id FROM divisions WHERE code='center_7')),
  ('11573', 'ТЦ Терминал', 'Дубна', (SELECT id FROM divisions WHERE code='center_7')),
  ('11655', 'ТЦ Радужный', 'Клин', (SELECT id FROM divisions WHERE code='center_7')),
  ('11789', 'ТЦ Центр города', 'Волоколамск', (SELECT id FROM divisions WHERE code='center_7'))
ON CONFLICT (store_number) DO NOTHING;

-- ========== UPDATE ADDRESSES FROM BOT DATA ==========
UPDATE stores SET address = 'Москва, проспект Мира 211 к2' WHERE store_number = '10164';
UPDATE stores SET address = 'Мытищи Шараповский проезд вл2' WHERE store_number = '10135';
UPDATE stores SET address = 'Лыткарино ТЦ Весна' WHERE store_number = '10168';
UPDATE stores SET address = 'Московская область, Ленинский городской округ, поселок совхоза им. Ленина, километр МКАД 24, здание 1' WHERE store_number = '10259';
UPDATE stores SET address = 'Люберцы октябрьский проспект 366' WHERE store_number = '10331';
UPDATE stores SET address = 'Москва Головинское шоссе 5' WHERE store_number = '10631';
UPDATE stores SET address = 'Москва Поречная 10' WHERE store_number = '10706';
UPDATE stores SET address = 'Москва ул проспект Андропова 9' WHERE store_number = '10710';
UPDATE stores SET address = 'Кирова 19' WHERE store_number = '10861';
UPDATE stores SET address = 'Москва, Кировоградская 13А' WHERE store_number = '10907';
UPDATE stores SET address = 'Одинцово, Немчиновка, ТРЦ Вегас Кунцево' WHERE store_number = '10908';
UPDATE stores SET address = 'Москва, Бесединское шоссе 15' WHERE store_number = '10983';
UPDATE stores SET address = 'МО г Люберцы Октябрьский проспект 112' WHERE store_number = '10987';
UPDATE stores SET address = 'Москва, Багратионовский проезд 5' WHERE store_number = '11038';
UPDATE stores SET address = 'Пушкино, Московский проспект 20' WHERE store_number = '11076';
UPDATE stores SET address = 'г Железнодорожный, Рождественская д 3' WHERE store_number = '11104';
UPDATE stores SET address = 'рп. Тучково ул. Пл Привокзальная дом 9' WHERE store_number = '11216';
UPDATE stores SET address = 'Сиреневый бульвар 31, ТЦ София' WHERE store_number = '11358';
UPDATE stores SET address = 'Московская обл., г. Котельники, 1й Покровский проезд, д.5' WHERE store_number = '11405';
UPDATE stores SET address = 'Красноармейское шоссе 104' WHERE store_number = '11413';
UPDATE stores SET address = 'Москва, Каховка 29А' WHERE store_number = '11446';
UPDATE stores SET address = 'Щелково, Талсинская 6Б, ТЦ Этажи' WHERE store_number = '11449';
UPDATE stores SET address = 'Москва Комсомольская пр 6' WHERE store_number = '11468';
UPDATE stores SET address = 'проспект космонавтов 20а' WHERE store_number = '11469';
UPDATE stores SET address = 'Москва, пр.Вернадского 86а' WHERE store_number = '11477';
UPDATE stores SET address = 'Ногинск комсомольская 35' WHERE store_number = '11554';
UPDATE stores SET address = 'Окружной проезд 2А, стр1' WHERE store_number = '11563';
UPDATE stores SET address = 'Москва, Бирюлевская 51к1' WHERE store_number = '11637';
UPDATE stores SET address = 'Москва, Ключевая улица, 6, корп. 1, ТЦ Братеевский' WHERE store_number = '11701';
UPDATE stores SET address = 'Москва, Щукинская 42' WHERE store_number = '11818';
UPDATE stores SET address = 'Москва, ш Энтузиастов д 12 к 2' WHERE store_number = '11862';
UPDATE stores SET address = 'Москва, Щелковское шоссе 05' WHERE store_number = '11868';
UPDATE stores SET address = 'Москва, Большая Черёмушкинская 1' WHERE store_number = '11969';
UPDATE stores SET address = 'Москва, Коровинское шоссе 2' WHERE store_number = '13038';
UPDATE stores SET address = 'Москва, Святоозерская 1А' WHERE store_number = '13101';

-- ========== STORAGE BUCKET ==========
INSERT INTO storage.buckets (id, name, public) VALUES ('ticket-photos', 'ticket-photos', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', true) ON CONFLICT DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated can upload ticket photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('ticket-photos', 'receipts'));
CREATE POLICY "Anyone can view ticket photos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id IN ('ticket-photos', 'receipts'));

'use client'

import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { MobileNavbar } from '@/components/layout/MobileNavbar'
import { EnablePushBanner } from '@/components/EnablePushBanner'
import { useAuth } from '@/hooks/useAuth'
import { useNotifications } from '@/hooks/useNotifications'
import { useState } from 'react'
import { X } from 'lucide-react'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, role, loading } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { unreadCount } = useNotifications({ userId: user?.id || null })

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 max-w-xs w-full">
          <div className="w-10 h-10 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          <p className="text-body-sm text-text-secondary">Загрузка…</p>
          <p className="text-caption text-text-tertiary text-center">
            Если зависло на этом экране дольше 10 секунд —
          </p>
          <a
            href="/reset"
            className="text-caption font-semibold text-accent hover:underline"
          >
            Сбросить сессию и войти заново →
          </a>
        </div>
      </div>
    )
  }

  const userRole = role || 'employee'
  const userName = profile?.full_name || 'Пользователь'

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Desktop Sidebar */}
      <Sidebar userRole={userRole} userName={userName} />

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50"
          onKeyDown={e => { if (e.key === 'Escape') setMobileMenuOpen(false) }}
        >
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-[280px] max-w-[85vw] h-full animate-slide-in-left">
            <Sidebar
              userRole={userRole}
              userName={userName}
              mobile
              onNavigate={() => setMobileMenuOpen(false)}
            />
            <button
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Закрыть меню"
              className="absolute top-3 right-3 p-2 rounded-xl bg-surface-elevated/80 hover:bg-surface-elevated text-text-secondary border border-border"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header onMenuToggle={() => setMobileMenuOpen(true)} notificationCount={unreadCount} />
        <EnablePushBanner />
        <main className="flex-1 p-4 lg:p-6 pb-20 lg:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileNavbar userRole={userRole} />
    </div>
  )
}

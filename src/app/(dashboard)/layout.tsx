'use client'

import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { MobileNavbar } from '@/components/layout/MobileNavbar'
import { EnablePushBanner } from '@/components/EnablePushBanner'
import { useAuth } from '@/hooks/useAuth'
import { useNotifications } from '@/hooks/useNotifications'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, role, loading, stalled } = useAuth()
  const router = useRouter()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { unreadCount } = useNotifications({ userId: user?.id || null })

  // Client-side auth gate. We can't rely on middleware alone — on iOS Safari
  // standalone PWAs, session cookies sometimes haven't propagated yet when
  // middleware fires after login, which kicks the user back to /login.
  useEffect(() => {
    if (!loading && !user) {
      // relogin=1 stops middleware from bouncing us back here on a stale cookie.
      router.replace('/login?relogin=1')
    }
  }, [loading, user, router])

  // Without a user there is nothing to show: rendering the shell here left
  // people staring at "Привет!" and empty tiles while the redirect was pending.
  if (loading || !user) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 max-w-xs w-full">
          <div className="w-10 h-10 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          <p className="text-body-sm text-text-secondary">Загрузка…</p>
          {stalled && (
            <>
              <p className="text-caption text-text-tertiary text-center">
                Похоже, слабая связь. Вход сохранён — попробуйте ещё раз.
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="gradient-accent text-white rounded-xl px-5 py-2.5 text-body-sm font-semibold"
              >
                Повторить
              </button>
              <a
                href="/reset"
                className="text-caption text-text-tertiary hover:underline"
              >
                Не помогает — сбросить сессию и войти заново
              </a>
            </>
          )}
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

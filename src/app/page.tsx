'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Shield, Zap, BarChart3, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] blob-primary opacity-30" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] blob-secondary opacity-20" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <Image src="/logo-kari-icon.png" alt="Kari" width={40} height={40} />
          <span className="text-heading-3 text-text-primary font-bold">KariDesk</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm">Войти</Button>
          </Link>
          <Link href="/register">
            <Button size="sm">Регистрация</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 max-w-6xl mx-auto px-6 pt-16 pb-24 md:pt-24">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 border border-accent/20 mb-6">
            <Zap className="w-4 h-4 text-accent" />
            <span className="text-body-sm text-accent font-medium">Платформа заявок KARI</span>
          </div>

          <h1 className="text-display-sm md:text-display text-text-primary mb-6">
            <span className="gradient-text">KariDesk</span>
          </h1>

          <p className="text-body md:text-heading-3 text-text-secondary mb-10 max-w-2xl mx-auto font-normal">
            Единая платформа для управления заявками по всем магазинам сети.
            Подавайте заявки, отслеживайте выполнение, контролируйте подрядчиков.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register">
              <Button size="lg" className="w-full sm:w-auto">
                Начать работу
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="secondary" size="lg" className="w-full sm:w-auto">
                Уже есть аккаунт
              </Button>
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-20">
          {[
            {
              icon: Smartphone,
              title: 'Удобно с телефона',
              desc: 'Подавайте заявки за 30 секунд прямо со смартфона',
            },
            {
              icon: Zap,
              title: 'Мгновенно',
              desc: 'Заявка сразу попадает к администратору и подрядчику',
            },
            {
              icon: Shield,
              title: 'Полный контроль',
              desc: 'Фото проблемы, фото выполнения, акты работ',
            },
            {
              icon: BarChart3,
              title: 'Аналитика',
              desc: 'Отчёты по подразделениям, магазинам и подрядчикам',
            },
          ].map((feature, i) => (
            <div key={i} className="card-premium p-6 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl gradient-accent-soft mb-4">
                <feature.icon className="w-6 h-6 text-accent" />
              </div>
              <h3 className="text-heading-3 text-text-primary mb-2">{feature.title}</h3>
              <p className="text-body-sm text-text-secondary">{feature.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border py-6 text-center">
        <p className="text-caption text-text-tertiary">
          KariDesk &copy; {new Date().getFullYear()} &mdash; Платформа управления заявками
        </p>
      </footer>
    </div>
  )
}

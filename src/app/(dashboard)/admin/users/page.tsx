'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminUsersRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/users') }, [router])
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
    </div>
  )
}

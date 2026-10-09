'use client'

import { useState } from 'react'
import Footer from '@/components/Footer'
import Header from '@/components/Header'
import InstructionPanel from '@/components/InstructionPanel'
import LandingHero from '@/components/LandingHero'
import LinksBar from '@/components/LinksBar'
import Features from '@/components/Features'

export default function Home() {
  // Owned here rather than inside LandingHero so the header and the drawer
  // survive the hero's non-Chromium early return.
  const [isPanelOpen, setIsPanelOpen] = useState(false)

  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <Header onOpenPanel={() => setIsPanelOpen(true)} isPanelOpen={isPanelOpen} />
      <main className="flex-1">
        <LandingHero />
        <LinksBar />
        <Features />
      </main>
      <Footer />
      <InstructionPanel isOpen={isPanelOpen} onClose={() => setIsPanelOpen(false)} />
    </div>
  )
}

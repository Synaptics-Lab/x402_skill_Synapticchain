'use client'

import { useState } from 'react'

export function CopyBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <figure className="border border-foreground max-w-full overflow-x-hidden">
      <figcaption className="flex items-center justify-between gap-3 border-b border-foreground bg-secondary px-2.5 py-1.5">
        <span className="label">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="label border border-foreground px-2 py-0.5 transition-colors hover:bg-foreground hover:text-background"
        >
          {copied ? 'copied' : 'copy'}
        </button>
      </figcaption>
      <pre className="max-h-80 overflow-x-auto max-w-full bg-foreground p-3 font-mono text-[11px] leading-relaxed text-background">
        {code}
      </pre>
    </figure>
  )
}

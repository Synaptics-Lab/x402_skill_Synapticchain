'use client'

import { useEffect, useRef, useState } from 'react'
import { Mono } from '@/components/kit'

type ChartPoint = {
  time: string
  value: number
}

type TokenChartProps = {
  data: ChartPoint[]
  symbol: string
  color?: string
}

export function TokenChart({ data, symbol, color = '#22d3ee' }: TokenChartProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const chartApiRef = useRef<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function init() {
      if (!chartRef.current) return
      try {
        const tv = await import('lightweight-charts')
        if (cancelled) return

        const el = chartRef.current
        const chart = tv.createChart(el, {
          layout: {
            background: { color: 'transparent' },
            textColor: 'var(--muted-foreground)',
            fontFamily: 'var(--font-mono), ui-monospace, monospace',
          },
          grid: {
            vertLines: { color: 'var(--hairline)' },
            horzLines: { color: 'var(--hairline)' },
          },
          rightPriceScale: {
            borderColor: 'var(--hairline)',
            scaleMargins: { top: 0.1, bottom: 0.1 },
          },
          timeScale: {
            borderColor: 'var(--hairline)',
            timeVisible: true,
            secondsVisible: false,
          },
          crosshair: {
            mode: tv.CrosshairMode.Magnet,
            vertLine: { color: 'var(--foreground)', labelBackgroundColor: 'var(--foreground)' },
            horzLine: { color: 'var(--foreground)', labelBackgroundColor: 'var(--foreground)' },
          },
          handleScroll: false,
          handleScale: false,
          autoSize: true,
        })

        const series = chart.addSeries(tv.AreaSeries, {
          lineColor: color,
          topColor: `${color}40`,
          bottomColor: `${color}05`,
          lineWidth: 2,
          priceFormat: { type: 'price', precision: 8, minMove: 0.00000001 },
        })

        series.setData(data)
        chart.timeScale().fitContent()

        chartApiRef.current = chart
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }

    init()

    return () => {
      cancelled = true
      chartApiRef.current?.remove()
      chartApiRef.current = null
    }
  }, [data, color])

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <Mono className="text-accent">Chart unavailable</Mono>
        <Mono className="max-w-xs text-muted-foreground">{error}</Mono>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      <div ref={chartRef} className="h-full w-full" aria-label={`${symbol} price chart`} />
    </div>
  )
}

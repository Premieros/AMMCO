import Script from 'next/script'

export const dynamic = 'force-dynamic'

export default function UnifiedAmmcoPortal() {
  return (
    <>
      <link rel="stylesheet" href="/unified/styles.css" />
      <div id="app">
        <div className="boot">جاري تحميل AMMCO…</div>
      </div>
      <Script
        src="/unified/app.js"
        type="module"
        strategy="afterInteractive"
      />
    </>
  )
}

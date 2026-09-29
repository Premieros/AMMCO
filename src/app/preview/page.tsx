import Link from 'next/link'

function money(value: number) {
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    maximumFractionDigits: 0,
  }).format(value)
}

const categories = [
  ['أجور ومرتبات', 59733],
  ['عمولات', 21358],
  ['إيجارات', 14000],
  ['زيوت سيارات', 7315],
  ['صيانة السيارات', 4935],
  ['سولار', 2300],
  ['حوافز إداريين', 1750],
  ['انتقالات', 1120],
  ['نت وتليفون', 860],
  ['إطارات السيارات', 500],
  ['إكراميات', 300],
  ['أدوات كتابية', 90],
  ['مصاريف تحويل', 53],
  ['كهرباء', 50],
] as const

const nonExpense = [
  ['إيداعات بنكية', 312500],
  ['تحويلات للمصنع', 182145],
  ['حركات غير مصروفية أخرى', 16000],
  ['سلف', 3300],
] as const

export default function PreviewPage() {
  const operatingExpenses = categories.reduce((sum, [, value]) => sum + value, 0)
  const totalCashOut = 628309
  const vehicleExpenses = 7315 + 4935 + 2300 + 500

  return (
    <main className="preview-page" dir="rtl">
      <header className="preview-hero">
        <div>
          <div className="preview-badge">AMMCO · معاينة تجريبية</div>
          <h1>تحليل مصروفات الفروع</h1>
          <p>نموذج مبني على شيت طنطا لشهر سبتمبر 2026 — للمعاينة فقط.</p>
        </div>
        <Link className="btn" href="/login">دخول النظام</Link>
      </header>

      <section className="grid kpis">
        <div className="card">
          <div className="kpi-label">المصروفات التشغيلية</div>
          <div className="kpi-value">{money(operatingExpenses)}</div>
          <div className="muted">المبلغ الذي يدخل تحليل المصروفات</div>
        </div>
        <div className="card">
          <div className="kpi-label">إجمالي الصادر من الخزنة</div>
          <div className="kpi-value">{money(totalCashOut)}</div>
          <div className="muted">يشمل تحويلات وإيداعات وسلف</div>
        </div>
        <div className="card">
          <div className="kpi-label">مصروفات السيارات</div>
          <div className="kpi-value">{money(vehicleExpenses)}</div>
          <div className="muted">سولار + زيوت + صيانة + إطارات</div>
        </div>
        <div className="card">
          <div className="kpi-label">نسبة المصروف التشغيلي من الصادر</div>
          <div className="kpi-value">{((operatingExpenses / totalCashOut) * 100).toFixed(1)}%</div>
          <div className="muted">لفصل المصروف الحقيقي عن الحركة النقدية</div>
        </div>
      </section>

      <section className="preview-grid">
        <div className="card">
          <h2>بنود المصروفات</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>البند</th><th>القيمة</th><th>النسبة</th></tr></thead>
              <tbody>
                {categories.map(([name, value]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td>{money(value)}</td>
                    <td>{((value / operatingExpenses) * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2>صادر خزنة لا يُحسب مصروفًا</h2>
          <p className="muted">هذه الحركات تُعرض في حركة الخزنة لكنها لا تدخل تقرير المصروفات التشغيلية.</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>نوع الحركة</th><th>القيمة</th></tr></thead>
              <tbody>
                {nonExpense.map(([name, value]) => (
                  <tr key={name}><td>{name}</td><td>{money(value)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="preview-note">
            <strong>القاعدة المحاسبية:</strong>
            <span>كل حركة خزنة لها اتجاه وتوجيه. المصروف فقط هو ما يحمل توجيه مصروف معتمد؛ الإيداع البنكي والتحويل للمصنع والسلفة والعهدة لا تُضخم تقرير المصروفات.</span>
          </div>
        </div>
      </section>
    </main>
  )
}

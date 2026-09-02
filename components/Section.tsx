export default function Section({
  title, blurb, action, children,
}: { title: string; blurb?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="sec">
      <div className="sec__h">
        <div className="sec__t">
          <h2>{title}</h2>
          {blurb && <p>{blurb}</p>}
        </div>
        {action && <div className="sec__a">{action}</div>}
      </div>
      {children}
    </section>
  )
}

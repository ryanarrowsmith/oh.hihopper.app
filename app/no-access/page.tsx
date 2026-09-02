export default function NoAccess() {
  return (
    <main className="signin">
      <div className="signin__box">
        <div className="signin__head">
          <span className="mark mark--sm">hopper<span className="pd">.</span></span>
        </div>
        <div className="signin__body">
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.03em', marginBottom: 10 }}>
            This account can&rsquo;t open Hopper yet.
          </h1>
          <p className="muted" style={{ fontSize: 14, marginBottom: 18 }}>
            You&rsquo;re signed in, but Hopper hasn&rsquo;t been switched on for your account —
            or your access to it has been withdrawn. Whoever administers your account can turn it on.
          </p>
          <a className="btn" href="/sign-in">Sign in as somebody else</a>
        </div>
      </div>
    </main>
  )
}

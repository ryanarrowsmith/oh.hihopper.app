/**
 * The quote email.
 *
 * Written for Outlook and Gmail, which means the rules are not the app's:
 * nested tables, a `width` attribute beside every CSS width, `bgcolor` beside
 * every background-color, everything inline, no flexbox, no grid, no float,
 * no border-radius, no web font.
 *
 * Three decisions carried over from the invoice mail and worth keeping:
 *  - the wordmark is live text, not an image. Outlook desktop refuses base64
 *    `data:` images and Gmail strips them.
 *  - the round period does not survive and is not faked -- Outlook drops
 *    border-radius, so a CSS circle arrives square.
 *  - it is locked to light, so a client's dark mode cannot turn ink on paper
 *    into mud.
 *
 * The portrait has its circle baked into the JPEG on the card's own ground,
 * for the same border-radius reason. Re-bake it if --warmbg ever changes.
 */
export function quoteEmail(opts: { quote: string; name: string; origin: string }) {
  const { quote, name, origin } = opts
  const ink = '#231F20', paper = '#FBF9F5', warm = '#FDF6E9'
  const rule = '#EBD9B4', steel = '#2D5D7B', amber = '#F2A93B', ink2 = '#55524D'

  const html = `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>A line from Dolly</title></head>
<body style="margin:0;padding:0;background-color:${paper};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${paper}" style="background-color:${paper};">
<tr><td align="center" style="padding:28px 12px;">

  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;border:1px solid #E8E2D8;">

    <tr><td bgcolor="${ink}" style="background-color:${ink};padding:20px 26px;">
      <span style="font-family:Helvetica,Arial,sans-serif;font-size:21px;font-weight:bold;letter-spacing:-0.5px;color:${paper};">hopper</span><span style="font-family:Helvetica,Arial,sans-serif;font-size:21px;font-weight:bold;color:${amber};">.</span>
    </td></tr>

    <tr><td bgcolor="${warm}" style="background-color:${warm};padding:30px 26px;border-bottom:1px solid ${rule};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="120" valign="top" style="width:120px;padding-right:22px;">
            <img src="${origin}/dolly-email.jpg" width="120" height="120" alt=""
                 style="display:block;width:120px;height:120px;border:0;outline:none;text-decoration:none;">
          </td>
          <td valign="middle" style="font-family:Georgia,'Times New Roman',serif;">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:21px;line-height:1.42;color:${ink};">&ldquo;${esc(quote)}&rdquo;</div>
            <div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:${ink2};padding-top:14px;">Dolly Parton</div>
          </td>
        </tr>
      </table>
    </td></tr>

    <tr><td bgcolor="${paper}" style="background-color:${paper};padding:22px 26px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:${ink2};">
      ${esc(name)} sent this from the Hopper home page.
    </td></tr>

    <tr><td bgcolor="${steel}" style="background-color:${steel};padding:18px 26px;font-family:Helvetica,Arial,sans-serif;font-size:12.5px;color:#FBF9F5;">
      <span style="font-weight:bold;">hopper</span><span style="color:${amber};font-weight:bold;">.</span>
      &nbsp;&mdash;&nbsp; <a href="${origin}" style="color:#FBF9F5;text-decoration:underline;">oh.hihopper.app</a>
    </td></tr>

  </table>

</td></tr></table>
</body></html>`

  const text = `"${quote}"\n  — Dolly Parton\n\n${name} sent this from the Hopper home page.\n${origin}\n`
  return { subject: 'A line from Dolly', html, text }
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

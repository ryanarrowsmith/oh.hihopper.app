/**
 * An invitation somebody sends with their own hands.
 *
 * Mail gets eaten. A corporate filter that quietly bins anything carrying a
 * sign-in link does not bounce it, and the person waiting never learns there
 * was anything to wait for -- so Hopper offers the same invitation as
 * something to paste into Outlook or Gmail yourself.
 *
 * Which is why this is written the way mail was written in 2003: tables and
 * inline styles, no <style> block, no classes, no flexbox, no border-radius
 * relied upon. Two reasons rather than one. Gmail strips a <style> block
 * outright, and Outlook renders with Word, which knows about tables and very
 * little else. And this HTML is not sent by a mail server at all -- it goes on
 * the clipboard and lands in a compose window, which throws away everything
 * outside <body> and most of what is inside it. So there is no <html>, no
 * <head>, no page background to depend on: it is a fragment that has to look
 * right on plain white the moment it is dropped in.
 */
export type Invite = {
  name: string | null
  accountName: string
  inviterName: string | null
  link: string
}

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
const AMBER = '#F2A93B'
const INK = '#231F20'
const QUIET = '#5B5854'
const RULE = '#E0DEDB'

const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const firstName = (n: string | null) => (n ?? '').trim().split(/\s+/)[0] || null

export function inviteSubject(i: Invite) {
  return `You're invited to Hopper — ${i.accountName}`
}

export function inviteText(i: Invite) {
  const who = firstName(i.name)
  const from = i.inviterName ? ` by ${i.inviterName}` : ''
  return [
    who ? `${who},` : 'Oh hi,',
    '',
    `You've been added${from} to ${i.accountName} on Hopper — where the business keeps its `
      + 'people, its offices, its numbers and everything else that used to live in a '
      + 'spreadsheet somebody had to find.',
    '',
    'Open this link to set a password and sign in:',
    i.link,
    '',
    'The link is only good for a little while, and only once. If it has expired by the '
      + 'time you get here, ask whoever sent it for another.',
    '',
    'Hopper — hihopper.app',
  ].join('\n')
}

/**
 * The same invitation, as a fragment that survives a paste.
 *
 * width="560" as an attribute AND max-width in the style: Outlook obeys the
 * attribute and ignores the style, every other client does the reverse, and a
 * phone needs the second one. Every colour and font is on the element that
 * uses it, because a compose window keeps the tags and drops the sheet.
 */
export function inviteHtml(i: Invite) {
  const who = firstName(i.name)
  const link = esc(i.link)
  const from = i.inviterName
    ? ` by ${esc(i.inviterName)}`
    : ''

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:100%;max-width:560px;border-collapse:collapse;background:#FFFFFF;border:1px solid ${RULE};font-family:${SANS}">
<tr>
<td style="height:6px;line-height:6px;font-size:0;background:${AMBER}">&nbsp;</td>
</tr>
<tr>
<td style="padding:30px 32px 32px;font-family:${SANS}">
<p style="margin:0 0 22px;font-family:${SANS};font-size:14px;line-height:14px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${AMBER}">HOPPER</p>
<h1 style="margin:0 0 16px;font-family:${SANS};font-size:26px;line-height:32px;font-weight:bold;color:${INK}">You&rsquo;re invited</h1>
<p style="margin:0 0 14px;font-family:${SANS};font-size:16px;line-height:24px;color:${INK}">${who ? esc(who) + ',' : 'Oh hi,'}</p>
<p style="margin:0 0 24px;font-family:${SANS};font-size:16px;line-height:24px;color:${QUIET}">You&rsquo;ve been added${from} to <strong style="color:${INK}">${esc(i.accountName)}</strong> on Hopper &mdash; where the business keeps its people, its offices, its numbers and everything else that used to live in a spreadsheet somebody had to find.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 24px">
<tr>
<td bgcolor="${AMBER}" style="background:${AMBER};padding:14px 28px;font-family:${SANS};font-size:16px;line-height:16px;font-weight:bold">
<a href="${link}" style="color:${INK};text-decoration:none;font-family:${SANS};font-size:16px;line-height:16px;font-weight:bold">Set a password and sign in</a>
</td>
</tr>
</table>
<p style="margin:0 0 8px;font-family:${SANS};font-size:13px;line-height:20px;color:${QUIET}">Or paste this into your browser:</p>
<p style="margin:0 0 24px;font-family:${SANS};font-size:13px;line-height:20px;word-break:break-all"><a href="${link}" style="color:#2D5D7B">${link}</a></p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse">
<tr>
<td style="border-top:1px solid ${RULE};padding-top:18px;font-family:${SANS};font-size:13px;line-height:20px;color:${QUIET}">The link is only good for a little while, and only once. If it has expired by the time you get here, ask whoever sent it for another.</td>
</tr>
</table>
</td>
</tr>
</table>`
}

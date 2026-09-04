import { deskScreen } from '@/lib/deskpage'

export const dynamic = 'force-dynamic'

export default async function Page() {
  return deskScreen({
    title: 'Unassigned',
    blurb: 'Nobody has picked these up yet.',
    unassigned: true,
  })
}

import { deskScreen } from '@/lib/deskpage'

export const dynamic = 'force-dynamic'

export default async function Page() {
  return deskScreen({ title: 'Assigned to me', mine: true })
}

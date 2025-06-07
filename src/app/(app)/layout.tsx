import { MainAppShell } from '@/components/main-app-shell';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MainAppShell>{children}</MainAppShell>;
}

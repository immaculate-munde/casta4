import AppShell from '@/components/AppShell';
import { WorkspaceFormatProvider } from '@/components/WorkspaceFormatProvider';

export default function AppLayout({ children }) {
  return (
    <WorkspaceFormatProvider>
      <AppShell>{children}</AppShell>
    </WorkspaceFormatProvider>
  );
}

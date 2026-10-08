import DashboardClient from '../../DashboardClient';

export default function DashboardPage() {
  return (
    <div className="h-full overflow-y-auto overflow-x-hidden pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <DashboardClient embedded />
    </div>
  );
}

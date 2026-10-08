import DashboardClient from '../../DashboardClient';

export default function DashboardPage() {
  return (
    <div className="h-full overflow-y-auto">
      <DashboardClient embedded />
    </div>
  );
}

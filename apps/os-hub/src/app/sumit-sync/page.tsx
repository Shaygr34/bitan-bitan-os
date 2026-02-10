import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

export default function SumitSyncPage() {
  return (
    <div>
      <PageHeader
        title="Sumit Sync"
        description="Synchronization workflows and data management."
      />
      <EmptyState
        message="No workflows configured"
        detail="Sync workflows will appear here once configured."
      />
    </div>
  );
}

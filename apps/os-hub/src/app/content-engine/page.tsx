import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

export default function ContentEnginePage() {
  return (
    <div>
      <PageHeader
        title="Content Engine"
        description="Content pipeline and publishing engine."
      />
      <EmptyState
        message="No content pipelines"
        detail="Content workflows will appear here once configured."
      />
    </div>
  );
}

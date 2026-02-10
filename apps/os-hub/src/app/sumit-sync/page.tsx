import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { t } from "@/lib/strings";

export default function SumitSyncPage() {
  return (
    <div>
      <PageHeader
        title={t("sumitSync.title")}
        description={t("sumitSync.subtitle")}
      />
      <EmptyState
        message={t("common.emptyState.title")}
        detail={t("common.emptyState.subtitle")}
        action={
          <button className="btn-primary">
            {t("sumitSync.actions.syncNow")}
          </button>
        }
      />
    </div>
  );
}

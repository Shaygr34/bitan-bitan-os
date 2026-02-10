import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { t } from "@/lib/strings";

export default function ContentEnginePage() {
  return (
    <div>
      <PageHeader
        title={t("contentEngine.title")}
        description={t("contentEngine.subtitle")}
      />
      <EmptyState
        message={t("common.emptyState.title")}
        detail={t("common.emptyState.subtitle")}
        action={
          <button className="btn-primary">
            {t("common.actions.newDocument")}
          </button>
        }
      />
    </div>
  );
}

import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { t } from "@/lib/strings";

export default function DocumentsPage() {
  return (
    <div>
      <PageHeader
        title={t("documents.title")}
        description={t("documents.subtitle")}
      />
      <EmptyState
        message={t("common.comingSoon.title")}
        detail={t("common.comingSoon.subtitle")}
      />
    </div>
  );
}

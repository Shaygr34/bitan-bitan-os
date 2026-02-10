import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { t } from "@/lib/strings";

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        title={t("settings.title")}
        description={t("settings.subtitle")}
      />
      <EmptyState
        message={t("common.comingSoon.title")}
        detail={t("common.comingSoon.subtitle")}
      />
    </div>
  );
}

import PageHeader from "@/components/PageHeader";
import ContentEngineClient from "@/components/ContentEngineClient";
import { t } from "@/lib/strings";

export default function ContentEnginePage() {
  return (
    <div>
      <PageHeader
        title={t("contentEngine.title")}
        description={t("contentEngine.subtitle")}
      />
      <ContentEngineClient />
    </div>
  );
}

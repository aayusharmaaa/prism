"use client";

import { useWorkspace } from "@/store/workspace";
import { DocumentEditor } from "@/components/editor/DocumentEditor";
import { SourceViewer } from "@/components/editor/SourceViewer";
import { IntegrationsPane } from "@/components/panes/IntegrationsPane";
import { SettingsPane } from "@/components/panes/SettingsPane";
import { TicketsPane } from "@/components/panes/TicketsPane";
import { WelcomePane } from "@/components/panes/WelcomePane";

export function EditorSurface() {
  const { tabs, activeTab } = useWorkspace();
  const tab = tabs.find((t) => t.key === activeTab);

  if (!tab) return <WelcomePane />;

  switch (tab.kind) {
    case "document":
      return <DocumentEditor key={tab.entityId} documentId={tab.entityId!} />;
    case "source":
      return <SourceViewer key={tab.entityId} sourceId={tab.entityId!} />;
    case "integrations":
      return <IntegrationsPane />;
    case "settings":
      return <SettingsPane />;
    case "tickets":
      return <TicketsPane key={tab.entityId} batchId={tab.entityId!} />;
    default:
      return <WelcomePane />;
  }
}

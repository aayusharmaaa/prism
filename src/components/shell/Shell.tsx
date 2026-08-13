"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/store/workspace";
import { useAgent } from "@/store/agent";
import { TitleBar } from "./TitleBar";
import { ActivityBar } from "./ActivityBar";
import { Sidebar } from "./Sidebar";
import { EditorTabs } from "./EditorTabs";
import { EditorSurface } from "./EditorSurface";
import { StatusBar } from "./StatusBar";
import { Resizer } from "./Resizer";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { CommandPalette } from "@/components/palette/CommandPalette";
import { Toasts } from "./Toasts";
import { Tour } from "@/components/onboarding/Tour";
import { ShortcutsModal } from "@/components/onboarding/ShortcutsModal";
import { Loader2, TriangleAlert } from "lucide-react";

export function Shell({ slug }: { slug: string }) {
  const {
    init,
    loaded,
    error,
    sidebarOpen,
    sidebarWidth,
    setSidebarWidth,
    agentOpen,
    agentWidth,
    setAgentWidth,
    setAgentOpen,
    setPalette,
    toggleSidebar,
    config,
  } = useWorkspace();
  const [showShortcuts, setShowShortcuts] = useState(false);

  useEffect(() => {
    void init(slug);
  }, [init, slug]);

  // Adopt the server's default model once bootstrap lands.
  useEffect(() => {
    if (config.defaultModel) useAgent.getState().setModel(config.defaultModel);
  }, [config.defaultModel]);

  useEffect(() => {
    const stored = (() => {
      try {
        return localStorage.getItem("prism-theme");
      } catch {
        return null;
      }
    })();
    if (stored === "light" || stored === "dark") {
      useWorkspace.setState({ theme: stored });
    }
  }, []);

  // Keep the editor usable when the window is small or gets resized.
  useEffect(() => {
    const fit = () => useWorkspace.getState().fitToViewport(window.innerWidth);
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [loaded]);

  /* ---------------------- global keyboard map ---------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) {
        if (e.key === "Escape") setPalette("closed");
        return;
      }

      // Cmd+Shift+P — command palette
      if (e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPalette("commands");
        return;
      }
      // Cmd+P — quick open
      if (!e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPalette("files");
        return;
      }
      // Cmd+I — focus the agent
      if (e.key.toLowerCase() === "i") {
        e.preventDefault();
        setAgentOpen(true);
        window.dispatchEvent(new CustomEvent("prism:focus-composer"));
        return;
      }
      // Cmd+B — toggle sidebar
      if (e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
        return;
      }
      // Cmd+J — toggle agent panel
      if (e.key.toLowerCase() === "j") {
        e.preventDefault();
        setAgentOpen(!useWorkspace.getState().agentOpen);
        return;
      }
      // Cmd+/ — shortcut cheatsheet
      if (e.key === "/") {
        e.preventDefault();
        setShowShortcuts((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPalette, setAgentOpen, toggleSidebar]);

  if (!loaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-app text-fg-dim">
        <div className="flex items-center gap-2.5 text-[13px]">
          <Loader2 size={15} className="animate-spin" />
          Opening workspace…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-app px-6">
        <div className="max-w-md rounded-lg border border-danger/30 bg-elevated p-5">
          <div className="mb-2 flex items-center gap-2 text-danger">
            <TriangleAlert size={16} />
            <span className="text-[13px] font-semibold">
              Couldn&apos;t open this workspace
            </span>
          </div>
          <p className="text-[12.5px] leading-relaxed text-fg-muted">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-app text-fg">
      <TitleBar />

      <div className="flex min-h-0 flex-1">
        <ActivityBar />

        {sidebarOpen && (
          <>
            <div
              style={{ width: sidebarWidth }}
              className="shrink-0 overflow-hidden border-r border-line bg-sidebar"
            >
              <Sidebar />
            </div>
            <Resizer
              onResize={(dx) => setSidebarWidth(sidebarWidth + dx)}
              ariaLabel="Resize sidebar"
            />
          </>
        )}

        <main className="flex min-w-0 flex-1 flex-col bg-editor">
          <EditorTabs />
          <EditorSurface />
        </main>

        {agentOpen && (
          <>
            <Resizer
              onResize={(dx) => setAgentWidth(agentWidth - dx)}
              ariaLabel="Resize agent panel"
            />
            <div
              style={{ width: agentWidth }}
              className="shrink-0 overflow-hidden border-l border-line bg-panel"
            >
              <AgentPanel />
            </div>
          </>
        )}
      </div>

      <StatusBar />
      <CommandPalette />
      {showShortcuts && (
        <ShortcutsModal onClose={() => setShowShortcuts(false)} />
      )}
      <Tour />
      <Toasts />
    </div>
  );
}

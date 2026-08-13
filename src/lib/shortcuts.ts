/** Single source of truth for keyboard shortcuts — the cheatsheet, the welcome
 *  screen, and the command palette hints all read from here, so they can't
 *  drift apart from each other or from the handlers. */
export interface Shortcut {
  keys: string;
  label: string;
  group: "Navigate" | "Write" | "Agent" | "View";
}

export const SHORTCUTS: Shortcut[] = [
  { keys: "⌘P", label: "Go to document or source", group: "Navigate" },
  { keys: "⌘⇧P", label: "Command palette", group: "Navigate" },
  { keys: "⌘⇧F", label: "Search the workspace", group: "Navigate" },

  { keys: "⌘K", label: "Inline edit the selection", group: "Write" },
  { keys: "⌘S", label: "Save now", group: "Write" },
  { keys: "⌘⇧E", label: "Toggle edit / preview", group: "Write" },

  { keys: "⌘L", label: "Add selection to chat", group: "Agent" },
  { keys: "⌘I", label: "Focus the agent", group: "Agent" },
  { keys: "@", label: "Reference a document or source", group: "Agent" },
  { keys: "/", label: "Slash commands", group: "Agent" },

  { keys: "⌘B", label: "Toggle sidebar", group: "View" },
  { keys: "⌘J", label: "Toggle agent panel", group: "View" },
  { keys: "⌘/", label: "This cheatsheet", group: "View" },
  { keys: "Esc", label: "Close any overlay", group: "View" },
];

export const SHORTCUT_GROUPS = ["Navigate", "Write", "Agent", "View"] as const;

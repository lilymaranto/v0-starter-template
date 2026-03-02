"use client";

import { Activity } from "lucide-react";

export interface LogEntry {
  id: string;
  timestamp: string;
  type: "event" | "attribute" | "user_change" | "init";
  message: string;
}

interface EventLogProps {
  entries: LogEntry[];
}

export function EventLog({ entries }: EventLogProps) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-foreground">
          Braze Event Log
        </h2>
        <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-xs font-mono text-muted-foreground">
          {entries.length}
        </span>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {entries.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No events logged yet. Select a category to start.
          </p>
        ) : (
          <ul className="divide-y divide-border" role="log" aria-live="polite">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 px-4 py-3">
                <span
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                    entry.type === "event"
                      ? "bg-primary"
                      : entry.type === "attribute"
                        ? "bg-chart-2"
                        : entry.type === "user_change"
                          ? "bg-chart-4"
                          : "bg-muted-foreground"
                  }`}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground font-mono leading-relaxed truncate">
                    {entry.message}
                  </p>
                </div>
                <time className="shrink-0 text-[10px] text-muted-foreground font-mono tabular-nums">
                  {entry.timestamp}
                </time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

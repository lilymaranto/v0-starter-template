"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Tv } from "lucide-react";
import { UserSelector } from "@/components/user-selector";
import { VideoPlayer } from "@/components/video-player";
import { CategoryButtons } from "@/components/category-buttons";
import { EventLog, type LogEntry } from "@/components/event-log";
import {
  initBraze,
  changeUser,
  logCustomEvent,
  setCustomAttribute,
} from "@/lib/braze";

function timestamp() {
  return new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

let entryCounter = 0;
function nextId() {
  return `entry-${++entryCounter}`;
}

export default function Home() {
  const [activeUser, setActiveUser] = useState("viewer_a");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const initialized = useRef(false);

  const addLog = useCallback(
    (type: LogEntry["type"], message: string) => {
      setLogEntries((prev) => [
        { id: nextId(), timestamp: timestamp(), type, message },
        ...prev,
      ]);
    },
    []
  );

  // Initialize Braze SDK on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    initBraze().then(() => {
      addLog("init", "Braze SDK initialized");
      // Set default user
      changeUser("viewer_a");
      addLog("user_change", 'User set to "viewer_a"');
    });
  }, [addLog]);

  // Handle user switch
  async function handleSelectUser(userId: string) {
    setActiveUser(userId);
    await changeUser(userId);
    addLog("user_change", `User changed to "${userId}"`);
  }

  // Handle watch button click
  async function handleWatch(category: string) {
    setActiveCategory(category);

    // 1. Log video_started event with category property
    await logCustomEvent("video_started", { category });
    addLog("event", `video_started { category: "${category}" }`);

    // 2. Set custom attribute last_watched_category
    await setCustomAttribute("last_watched_category", category);
    addLog("attribute", `last_watched_category = "${category}"`);
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl flex-col items-start gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Tv className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground leading-tight text-balance">
                SolCon Video Player
              </h1>
              <p className="text-xs text-muted-foreground font-mono">
                PWA + Braze Analytics
              </p>
            </div>
          </div>
          <UserSelector
            activeUser={activeUser}
            onSelectUser={handleSelectUser}
          />
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex flex-col gap-8">
          {/* Video Player */}
          <section aria-label="Video player">
            <VideoPlayer category={activeCategory} />
          </section>

          {/* Category Buttons */}
          <section aria-label="Video categories">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Choose a Category
            </h2>
            <CategoryButtons
              activeCategory={activeCategory}
              onWatch={handleWatch}
            />
          </section>

          {/* Event Log */}
          <section aria-label="Analytics event log">
            <EventLog entries={logEntries} />
          </section>
        </div>
      </div>
    </main>
  );
}

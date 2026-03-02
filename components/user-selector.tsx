"use client";

import { User } from "lucide-react";

const USERS = ["viewer_a", "viewer_b"] as const;

interface UserSelectorProps {
  activeUser: string;
  onSelectUser: (userId: string) => void;
}

export function UserSelector({ activeUser, onSelectUser }: UserSelectorProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground font-mono">Profile:</span>
      <div className="flex gap-2">
        {USERS.map((user) => (
          <button
            key={user}
            onClick={() => onSelectUser(user)}
            aria-pressed={activeUser === user}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeUser === user
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            <User className="h-4 w-4" aria-hidden="true" />
            <span className="font-mono">{user}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

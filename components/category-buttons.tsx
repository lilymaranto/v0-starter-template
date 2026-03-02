"use client";

import { Film, Laugh, Flame } from "lucide-react";
import type { ReactNode } from "react";

interface Category {
  name: string;
  icon: ReactNode;
  description: string;
}

const CATEGORIES: Category[] = [
  {
    name: "Documentary",
    icon: <Film className="h-5 w-5" />,
    description: "Explore real stories and true events",
  },
  {
    name: "Comedy",
    icon: <Laugh className="h-5 w-5" />,
    description: "Laugh-out-loud entertainment",
  },
  {
    name: "Action",
    icon: <Flame className="h-5 w-5" />,
    description: "High-energy thrills and excitement",
  },
];

interface CategoryButtonsProps {
  activeCategory: string | null;
  onWatch: (category: string) => void;
}

export function CategoryButtons({
  activeCategory,
  onWatch,
}: CategoryButtonsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {CATEGORIES.map(({ name, icon, description }) => {
        const isActive = activeCategory === name;
        return (
          <button
            key={name}
            onClick={() => onWatch(name)}
            className={`group flex flex-col items-start gap-3 rounded-xl border p-5 text-left transition-all ${
              isActive
                ? "border-primary bg-primary/10 shadow-lg shadow-primary/10"
                : "border-border bg-card hover:border-primary/40 hover:bg-card/80"
            }`}
          >
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary"
              }`}
            >
              {icon}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">{name}</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {description}
              </p>
            </div>
            <span
              className={`mt-auto inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground group-hover:bg-primary group-hover:text-primary-foreground"
              }`}
            >
              {isActive ? "Watching" : "Watch"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

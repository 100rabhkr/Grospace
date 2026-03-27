"use client";

import { Search, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NotificationCenter } from "@/components/notification-center";

interface TopBarProps {
  onMenuClick?: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  return (
    <header className="h-14 bg-white border-b border-slate-200/80 flex items-center justify-between px-4 sm:px-6 lg:px-8 shrink-0 gap-3 sticky top-0 z-10">
      <div className="flex items-center gap-3 flex-1 max-w-md">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden h-9 w-9 shrink-0"
          onClick={onMenuClick}
        >
          <Menu className="w-5 h-5" strokeWidth={1.5} />
        </Button>
        <div className="relative w-full hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" strokeWidth={1.5} />
          <Input
            placeholder="Search outlets, agreements, reminders..."
            className="pl-9 h-9 text-[13px] bg-slate-50 border-slate-200/60 rounded-lg placeholder:text-slate-400 focus-visible:bg-white focus-visible:border-slate-300 transition-all duration-200"
          />
        </div>
      </div>

      <div className="flex items-center gap-1">
        <NotificationCenter />
      </div>
    </header>
  );
}

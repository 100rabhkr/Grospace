"use client";

import { useState, useRef, useEffect } from "react";
import { Pencil, Check, X } from "lucide-react";

type Props = {
  value: string;
  onChange: (newValue: string) => void;
  isNotFound?: boolean;
};

export function EditableField({ value, onChange, isNotFound }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const confirm = () => {
    const trimmed = draft.trim();
    if (trimmed !== value) {
      onChange(trimmed);
    }
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirm();
            if (e.key === "Escape") cancel();
          }}
          onBlur={confirm}
          className="text-sm font-medium leading-snug border border-blue-400 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-blue-400 w-full min-w-0 bg-white"
        />
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={confirm}
          className="text-blue-500 hover:text-blue-700 shrink-0"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={cancel}
          className="text-neutral-400 hover:text-neutral-600 shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="group flex items-start gap-1 cursor-pointer rounded -mx-1 px-1 hover:bg-neutral-50 transition-colors"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
    >
      <p
        className={`text-sm font-medium leading-snug flex-1 ${
          isNotFound ? "text-neutral-400 italic" : "text-black"
        }`}
      >
        {value.includes("\n")
          ? value.split("\n").map((line, i) => (
              <span key={i} className="block">
                {line}
              </span>
            ))
          : value}
      </p>
      <Pencil className="h-3 w-3 text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 shrink-0" />
    </div>
  );
}

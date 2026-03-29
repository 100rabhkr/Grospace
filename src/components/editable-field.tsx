"use client";

import { useState, useRef, useEffect } from "react";
import { Pencil, Check, X } from "lucide-react";

type Props = {
  value: string;
  displayValue?: string;
  onChange: (newValue: string) => void;
  isNotFound?: boolean;
  multiline?: boolean;
};

export function EditableField({ value, displayValue, onChange, isNotFound, multiline }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      if (multiline && textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.select();
      } else if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }
  }, [editing, multiline]);

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

  const shownValue = displayValue ?? value;

  if (editing) {
    return (
      <div className="flex items-start gap-1">
        {multiline ? (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") cancel();
            }}
            onBlur={confirm}
            rows={4}
            className="text-sm font-medium leading-snug border border-blue-400 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-blue-400 w-full min-w-0 bg-card resize-y"
          />
        ) : (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirm();
              if (e.key === "Escape") cancel();
            }}
            onBlur={confirm}
            className="text-sm font-medium leading-snug border border-blue-400 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-blue-400 w-full min-w-0 bg-card"
          />
        )}
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={confirm}
          className="text-blue-500 hover:text-blue-700 shrink-0 mt-0.5"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={cancel}
          className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
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
          isNotFound ? "text-muted-foreground italic" : "text-foreground"
        }`}
      >
        {shownValue.includes("\n")
          ? shownValue.split("\n").map((line, i) => (
              <span key={i} className="block">
                {line}
              </span>
            ))
          : shownValue}
      </p>
      <Pencil className="h-3 w-3 text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 shrink-0" />
    </div>
  );
}

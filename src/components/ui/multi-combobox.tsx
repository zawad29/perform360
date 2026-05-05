"use client";

import * as React from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Search, X, ChevronsUpDown, Check } from "lucide-react";

export interface MultiComboboxOption {
  value: string;
  label: string;
  sublabel?: string;
  disabled?: boolean;
  disabledReason?: string;
}

interface MultiComboboxProps {
  id?: string;
  label?: string;
  placeholder?: string;
  emptyMessage?: string;
  value: string[];
  onChange: (values: string[]) => void;
  options: MultiComboboxOption[];
  onSearchChange?: (query: string) => void;
  loading?: boolean;
}

export function MultiCombobox({
  id,
  label,
  placeholder = "Select...",
  emptyMessage = "No results found",
  value,
  onChange,
  options,
  onSearchChange,
  loading = false,
}: MultiComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const listboxId = React.useId();

  const selectedSet = React.useMemo(() => new Set(value), [value]);

  const filteredOptions = React.useMemo(() => {
    if (onSearchChange) return options;
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.sublabel?.toLowerCase().includes(q)
    );
  }, [options, search, onSearchChange]);

  const enabledOptions = React.useMemo(
    () => filteredOptions.filter((o) => !o.disabled),
    [filteredOptions]
  );

  const selectedLabels = React.useMemo(() => {
    const map = new Map(options.map((o) => [o.value, o.label]));
    return value.map((v) => ({ value: v, label: map.get(v) ?? v }));
  }, [value, options]);

  const handleSearchChange = (query: string) => {
    setSearch(query);
    setHighlightedIndex(-1);
    onSearchChange?.(query);
  };

  const toggleOption = (optionValue: string) => {
    if (selectedSet.has(optionValue)) {
      onChange(value.filter((v) => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  };

  const removeItem = (optionValue: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter((v) => v !== optionValue));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < enabledOptions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : enabledOptions.length - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < enabledOptions.length) {
        toggleOption(enabledOptions[highlightedIndex].value);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  React.useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll("[data-combobox-item]");
    const enabledItems = Array.from(items).filter(
      (item) => !item.hasAttribute("data-disabled")
    );
    enabledItems[highlightedIndex]?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  return (
    <div className="space-y-2">
      {label && (
        <label
          htmlFor={id}
          className="block text-[14px] font-medium uppercase tracking-caps text-gray-900"
        >
          {label}
        </label>
      )}
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setSearch("");
            setHighlightedIndex(-1);
            onSearchChange?.("");
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            className={cn(
              "flex min-h-[44px] w-full items-center gap-1.5 flex-wrap border border-gray-900 bg-white px-3 py-2 text-[15px]",
              "focus:outline-none focus:outline-2 focus:outline-accent focus:outline-offset-2"
            )}
          >
            {selectedLabels.length > 0 ? (
              <>
                {selectedLabels.map((item) => (
                  <span
                    key={item.value}
                    className="inline-flex items-center gap-1 bg-gray-50 border border-gray-900 text-gray-900 px-2 py-0.5 text-[13px] font-medium"
                  >
                    {item.label}
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => removeItem(item.value, e)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          removeItem(item.value, e as unknown as React.MouseEvent);
                        }
                      }}
                      className="hover:bg-gray-100 p-0.5 cursor-pointer"
                    >
                      <X size={12} strokeWidth={2} />
                    </span>
                  </span>
                ))}
              </>
            ) : (
              <span className="text-gray-400">{placeholder}</span>
            )}
            <ChevronsUpDown
              size={16}
              strokeWidth={1.5}
              className="ml-auto shrink-0 text-gray-400"
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="flex flex-col p-0 w-[var(--radix-popover-trigger-width)] min-w-[200px] max-h-[280px] overflow-hidden"
          align="start"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <div className="relative border-b border-gray-100 shrink-0">
            <Search
              size={16}
              strokeWidth={1.5}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              ref={inputRef}
              type="text"
              aria-label="Search options"
              className="h-10 w-full pl-9 pr-3 text-[14px] placeholder:text-gray-400 focus:outline-none bg-transparent"
              placeholder="Search..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>

          <div
            ref={listRef}
            id={listboxId}
            className="flex-1 overflow-y-auto py-1"
            role="listbox"
            aria-multiselectable="true"
          >
            {loading ? (
              <div className="space-y-1 p-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 px-2 py-2">
                    <Skeleton className="w-4 h-4 shrink-0" />
                    <Skeleton className="h-3.5 w-32" />
                  </div>
                ))}
              </div>
            ) : filteredOptions.length === 0 ? (
              <p className="text-center text-[13px] text-gray-400 py-6">
                {emptyMessage}
              </p>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = selectedSet.has(option.value);
                const enabledIndex = enabledOptions.indexOf(option);
                const isHighlighted = enabledIndex === highlightedIndex;

                return (
                  <div
                    key={option.value}
                    data-combobox-item
                    {...(option.disabled ? { "data-disabled": "" } : {})}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 mx-1 cursor-pointer text-[14px]",
                      isHighlighted && !option.disabled && "bg-gray-50",
                      isSelected && !option.disabled && "bg-gray-50",
                      option.disabled
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:bg-gray-50"
                    )}
                    onClick={() => !option.disabled && toggleOption(option.value)}
                  >
                    <div
                      className={cn(
                        "flex items-center justify-center w-4 h-4 border shrink-0",
                        isSelected
                          ? "bg-gray-900 border-gray-900"
                          : "border-gray-900"
                      )}
                    >
                      {isSelected && (
                        <Check size={10} strokeWidth={3} className="text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {option.label}
                      </p>
                      {(option.sublabel || (option.disabled && option.disabledReason)) && (
                        <p className="text-[12px] text-gray-500 truncate">
                          {option.disabled && option.disabledReason
                            ? option.disabledReason
                            : option.sublabel}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

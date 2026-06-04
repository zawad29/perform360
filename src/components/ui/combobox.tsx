"use client";

import * as React from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Search, ChevronsUpDown, Check } from "lucide-react";

export interface ComboboxOption {
  value: string;
  label: string;
  sublabel?: string;
  disabled?: boolean;
  disabledReason?: string;
  icon?: React.ReactNode;
}

interface ComboboxProps {
  id?: string;
  label?: string;
  placeholder?: string;
  emptyMessage?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: ComboboxOption[];
  onSearchChange?: (query: string) => void;
  loading?: boolean;
}

export function Combobox({
  id,
  label,
  placeholder = "Select...",
  emptyMessage = "No results found",
  value,
  onChange,
  options,
  onSearchChange,
  loading = false,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const listboxId = React.useId();

  // Cache the selected option so it survives option list changes during search
  const liveMatch = options.find((o) => o.value === value);
  const [cachedOption, setCachedOption] = React.useState<ComboboxOption | null>(null);
  React.useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (liveMatch) {
      setCachedOption(liveMatch);
    } else if (!value) {
      setCachedOption(null);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [liveMatch, value]);
  const selectedOption = liveMatch ?? (value ? cachedOption : null);

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

  const handleSearchChange = (query: string) => {
    setSearch(query);
    setHighlightedIndex(-1);
    onSearchChange?.(query);
  };

  const handleSelect = (option: ComboboxOption) => {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
    setSearch("");
    onSearchChange?.("");
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
        handleSelect(enabledOptions[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // Scroll highlighted item into view
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
              "flex h-11 w-full items-center justify-between border border-gray-900 bg-white px-3 text-[15px]",
              "focus:outline-none focus:outline-2 focus:outline-accent focus:outline-offset-2",
              !value && "text-gray-400"
            )}
          >
            <span className="truncate">
              {selectedOption
                ? `${selectedOption.label}${selectedOption.sublabel ? ` — ${selectedOption.sublabel}` : ""}`
                : placeholder}
            </span>
            <ChevronsUpDown
              size={16}
              strokeWidth={1.5}
              className="ml-2 shrink-0 text-gray-400"
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
          {/* Search input */}
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

          {/* Options list */}
          <div
            ref={listRef}
            id={listboxId}
            className="flex-1 overflow-y-auto py-1"
            role="listbox"
          >
            {loading ? (
              <div className="space-y-1 p-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 px-2 py-2">
                    <Skeleton className="w-8 h-8 shrink-0" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredOptions.length === 0 ? (
              <p className="text-center text-[13px] text-gray-400 py-6">
                {emptyMessage}
              </p>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = option.value === value;
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
                    onClick={() => handleSelect(option)}
                  >
                    {option.icon && (
                      <span className="shrink-0">{option.icon}</span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {option.label}
                      </p>
                      {(option.sublabel || option.disabledReason) && (
                        <p className="text-[12px] text-gray-500 truncate">
                          {option.disabled && option.disabledReason
                            ? option.disabledReason
                            : option.sublabel}
                        </p>
                      )}
                    </div>
                    {isSelected && (
                      <Check
                        size={14}
                        strokeWidth={2}
                        className="shrink-0 text-gray-900"
                      />
                    )}
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

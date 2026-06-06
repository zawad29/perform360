"use client";

import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";

interface StepBasicsProps {
  name: string;
  onNameChange: (value: string) => void;
  startDate: string;
  onStartDateChange: (value: string) => void;
  endDate: string;
  onEndDateChange: (value: string) => void;
}

export function StepBasics({
  name,
  onNameChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
}: StepBasicsProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-[15px] font-semibold text-gray-900 mb-1">
          Cycle Details
        </h3>
        <p className="text-[13px] text-gray-500">
          Name your evaluation cycle and set the review period.
        </p>
      </div>

      <Input
        id="name"
        label="Cycle Name"
        placeholder="e.g. Q1 2026 Performance Review"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        required
        autoFocus
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <DatePicker
          id="startDate"
          label="Start Date"
          value={startDate}
          onChange={onStartDateChange}
          placeholder="Pick start date"
          required
        />
        <DatePicker
          id="endDate"
          label="End Date"
          value={endDate}
          onChange={onEndDateChange}
          placeholder="Pick end date"
          minDate={startDate ? new Date(startDate) : undefined}
          required
        />
      </div>
    </div>
  );
}

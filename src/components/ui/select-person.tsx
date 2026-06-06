import { Combobox } from "@/components/ui/combobox";
import { Avatar } from "@/components/ui/avatar";

interface SelectPersonUser {
  id: string;
  name: string;
  email: string;
  avatar?: string | null;
}

interface SelectPersonProps {
  label?: string;
  placeholder?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  users: SelectPersonUser[];
  disabledIds?: Set<string>;
  disabledReason?: string;
  onSearchChange?: (query: string) => void;
  loading?: boolean;
  emptyMessage?: string;
}

export function SelectPerson({
  label = "Select Person",
  placeholder = "Search by name or email...",
  value,
  onChange,
  users,
  disabledIds,
  disabledReason = "Already in team",
  onSearchChange,
  loading,
  emptyMessage = "No matching users found",
}: SelectPersonProps) {
  const options = users.map((u) => ({
    value: u.id,
    label: u.name,
    sublabel: u.email,
    disabled: disabledIds?.has(u.id) ?? false,
    disabledReason: disabledIds?.has(u.id) ? disabledReason : undefined,
    icon: <Avatar name={u.name} src={u.avatar ?? undefined} size="sm" />,
  }));

  return (
    <Combobox
      label={label}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      options={options}
      onSearchChange={onSearchChange}
      loading={loading}
      emptyMessage={emptyMessage}
    />
  );
}

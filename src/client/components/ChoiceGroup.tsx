import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/client/components/ui/toggle-group";

/** A single choice among a few labelled options. */
export function ChoiceGroup<T extends string>({
  items,
  value,
  onChange,
  testIdPrefix,
  label,
}: {
  items: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  testIdPrefix: string;
  label: string;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      variant="outline"
      size="sm"
      spacing={1}
      value={[value]}
      onValueChange={(next) => {
        const picked = items.find((item) => item.value === next[0]);
        if (picked) onChange(picked.value);
      }}
      className="flex-wrap"
    >
      {items.map((item) => (
        <ToggleGroupItem
          key={item.value}
          value={item.value}
          data-testid={`${testIdPrefix}-${item.value}`}
          className="aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary"
        >
          {item.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

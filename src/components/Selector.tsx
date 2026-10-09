import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type SelectorProps = {
  onValueChange: (value: string) => void;
  disabled?: boolean;
  values?: string[];
  placeholder?: string;
  id?: string;
  /** Pass to keep the trigger in step when the selection is reset upstream. */
  value?: string;
}

export default function BoardVersionSelector({ onValueChange, disabled, placeholder = '', values = [], id, value }: SelectorProps) {
  return (
    <Select onValueChange={onValueChange} disabled={disabled} value={value}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {values.map((value) => (
          <SelectItem key={value} value={value}>
            {value}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

import type { ChangeEvent, InputHTMLAttributes } from "react";
import {
  formatTwentyFourHourTimeInput,
  HHMM_INPUT_PATTERN,
} from "../../lib/twentyFourHourTime";

type TwentyFourHourTimeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "type"
> & {
  onValueChange: (value: string) => void;
};

export function TwentyFourHourTimeInput({
  onValueChange,
  ...props
}: TwentyFourHourTimeInputProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onValueChange(formatTwentyFourHourTimeInput(event.target.value));
  };

  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={5}
      pattern={HHMM_INPUT_PATTERN}
      placeholder="HH:mm"
      onChange={handleChange}
    />
  );
}

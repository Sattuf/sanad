import { useMemo, useState } from "react";
import { COUNTRY_CODES, DEFAULT_COUNTRY_ISO2, flagEmoji } from "@sanad/shared/lib/countryCodes";
import { Input, Select } from "../../components/ui";

const SORTED = [...COUNTRY_CODES].sort((a, b) => a.name.localeCompare(b.name, "ar"));

function findByDialPrefix(value: string) {
  const candidates = COUNTRY_CODES.filter((c) => value.startsWith(c.dialCode));
  return candidates.sort((a, b) => b.dialCode.length - a.dialCode.length)[0];
}

/** حقل هاتف بصيغة دولية: منتقي رمز الدولة (كل دول العالم) + الرقم المحلي، يُنتجان معاً E.164. */
export function CountryPhoneInput({
  value,
  onChange,
  disabled,
  id,
}: {
  value: string;
  onChange: (e164: string) => void;
  disabled?: boolean;
  id?: string;
}) {
  const initial = useMemo(() => findByDialPrefix(value) ?? COUNTRY_CODES.find((c) => c.iso2 === DEFAULT_COUNTRY_ISO2)!, []);
  const [iso2, setIso2] = useState(initial.iso2);
  const country = COUNTRY_CODES.find((c) => c.iso2 === iso2) ?? initial;
  const national = value.startsWith(country.dialCode) ? value.slice(country.dialCode.length) : value.replace(/^\+\d*/, "");

  const emit = (dialCode: string, nationalDigits: string) => onChange(`${dialCode}${nationalDigits}`);

  return (
    <div className="flex gap-2">
      <Select
        id={id ? `${id}-country` : undefined}
        aria-label="رمز الدولة"
        className="w-40 shrink-0"
        value={iso2}
        disabled={disabled}
        onChange={(e) => {
          const next = COUNTRY_CODES.find((c) => c.iso2 === e.target.value)!;
          setIso2(next.iso2);
          emit(next.dialCode, national.replace(/\D/g, ""));
        }}
      >
        {SORTED.map((c) => (
          <option key={c.iso2} value={c.iso2}>
            {flagEmoji(c.iso2)} {c.name} ({c.dialCode})
          </option>
        ))}
      </Select>
      <Input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        dir="ltr"
        placeholder="5XXXXXXXX"
        value={national}
        disabled={disabled}
        onChange={(e) => emit(country.dialCode, e.target.value.replace(/\D/g, ""))}
      />
    </div>
  );
}

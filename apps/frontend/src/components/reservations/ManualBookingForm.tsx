import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { createManualReservation } from "../../lib/api";
import { STAFF_PATRON_TAGS } from "../../types/reservations";
import { Button } from "../ui/button";

export interface ManualBookingFormProps {
  restaurantId: string;
  onDone: () => void;
}

export function ManualBookingForm({
  restaurantId,
  onDone,
}: ManualBookingFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [when, setWhen] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      createManualReservation(restaurantId, {
        guestName: name.trim(),
        guestPhone: phone.trim(),
        guestEmail: email.trim() || undefined,
        localStartsAt: when,
        adultsCount: adults,
        childrenCount: children,
        customerNotes: notes.trim() || undefined,
        staffTags: tags,
      }),
    onSuccess: onDone,
    onError: (e: any) =>
      setError(e?.response?.data?.message ?? "Could not create the booking"),
  });

  const canSubmit =
    name.trim().length > 0 && phone.trim().length > 0 && !!when && adults >= 1;

  return (
    <div className="bg-gray-50 border rounded-xl p-3 space-y-2">
      <p className="text-sm font-semibold">
        {t("reservations.manualTitle", "New manual booking")}
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <input
          placeholder={t("booking.name", "Name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm"
        />
        <input
          placeholder={t("booking.phone", "Mobile phone")}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm"
        />
        <input
          placeholder={t("booking.email", "Email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm"
        />
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm"
        />
        <label className="text-xs text-gray-600 flex items-center gap-2">
          {t("booking.adults", "Adults")}
          <input
            type="number"
            min={1}
            max={50}
            value={adults}
            onChange={(e) => setAdults(Number(e.target.value) || 1)}
            className="w-16 border rounded px-2 py-1"
          />
        </label>
        <label className="text-xs text-gray-600 flex items-center gap-2">
          {t("booking.children", "Children")}
          <input
            type="number"
            min={0}
            max={50}
            value={children}
            onChange={(e) => setChildren(Number(e.target.value) || 0)}
            className="w-16 border rounded px-2 py-1"
          />
        </label>
      </div>
      <textarea
        placeholder={t("booking.notes", "Notes")}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        className="w-full border rounded-lg px-3 py-1.5 text-sm"
      />
      <div className="flex flex-wrap gap-1.5">
        {STAFF_PATRON_TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() =>
              setTags((p) =>
                p.includes(tag) ? p.filter((x) => x !== tag) : [...p, tag],
              )
            }
            className={`text-xs rounded-full px-2.5 py-1 border ${
              tags.includes(tag)
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-700"
            }`}
          >
            {t(`reservations.tags.${tag}`, tag.replace(/_/g, " "))}
          </button>
        ))}
      </div>
      <Button
        onClick={() => {
          setError(null);
          create.mutate();
        }}
        disabled={!canSubmit || create.isPending}
      >
        {t("reservations.createBooking", "Create booking")}
      </Button>
    </div>
  );
}

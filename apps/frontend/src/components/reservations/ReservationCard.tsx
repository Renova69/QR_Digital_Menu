import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRestaurantContext } from "../../context/RestaurantContext";
import { updateReservationInternal } from "../../lib/api";
import {
  STAFF_PATRON_TAGS,
  type ReservationAction,
  type StaffReservation,
} from "../../types/reservations";
import { Users, Phone, Mail, Lock, Pencil } from "lucide-react";
import { ActionBtn, Badge, STATUS_STYLES, format24h } from "./shared";

export interface ReservationCardProps {
  reservation: StaffReservation;
  restaurantId: string;
  onAction: (a: ReservationAction) => void;
  busy: boolean;
}

export function ReservationCard({
  reservation: r,
  restaurantId,
  onAction,
  busy,
}: ReservationCardProps) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { activeRestaurant } = useRestaurantContext();
  const tz = activeRestaurant?.timezone;
  const started = new Date(r.startsAt).getTime() <= Date.now();
  const time = format24h(r.startsAt, tz, i18n.language);

  const [editing, setEditing] = useState(false);
  const [tags, setTags] = useState<string[]>(r.staffTags ?? []);
  const [notes, setNotes] = useState(r.internalNotes ?? "");

  const saveInternal = useMutation({
    mutationFn: () =>
      updateReservationInternal(r.id, restaurantId, {
        internalNotes: notes,
        staffTags: tags,
      }),
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["reservations", restaurantId] });
      qc.invalidateQueries({
        queryKey: ["reservations-upcoming", restaurantId],
      });
    },
  });

  const toggleTag = (tag: string) =>
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag],
    );

  return (
    <div className="bg-white rounded-xl shadow-sm p-3 border">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold flex items-center gap-1.5">
            {r.guestName}
            {r.guestModified && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                <Pencil className="w-3 h-3" />
                {t("reservations.guestModified", "Guest modified")}
              </span>
            )}
          </p>
          <p className="text-xs text-gray-500">
            {time}
            {r.endsAt && (
              <span className="text-gray-400">
                {" "}
                → {format24h(r.endsAt, tz, i18n.language)}{" "}
                {t("reservations.tableFree", "(table free)")}
              </span>
            )}
          </p>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[r.status] ?? ""}`}
        >
          {t(`reservations.status.${r.status}`, r.status)}
        </span>
      </div>

      <div className="text-xs text-gray-600 mt-1 flex flex-wrap gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-0.5">
          <Users className="w-3 h-3" /> {r.adultsCount}
          {r.childrenCount > 0 ? ` + ${r.childrenCount} ch.` : ""} (
          {r.totalGuests})
        </span>
        <a
          href={`tel:${r.guestPhone}`}
          className="text-indigo-600 inline-flex items-center gap-0.5"
        >
          <Phone className="w-3 h-3" /> {r.guestPhone}
        </a>
        {r.guestEmail && (
          <span className="inline-flex items-center gap-0.5">
            <Mail className="w-3 h-3" /> {r.guestEmail}
          </span>
        )}
        <span className="font-mono text-gray-400">{r.referenceCode}</span>
      </div>

      {(r.customerPreferences.length > 0 ||
        r.preferredZone ||
        r.allergyNotes ||
        r.staffTags.length > 0 ||
        r.marketingConsent) && (
        <div className="flex flex-wrap gap-1 mt-2">
          {r.preferredZone && (
            <Badge
              tone="blue"
              label={t(`zones.${r.preferredZone}`, r.preferredZone)}
            />
          )}
          {r.customerPreferences.map((p) => (
            <Badge
              key={p}
              tone="amber"
              label={t(`reservations.preferences.${p}`, p.replace(/_/g, " "))}
            />
          ))}
          {r.allergyNotes && <Badge tone="red" label={r.allergyNotes} />}
          {r.staffTags.map((tag) => (
            <Badge
              key={tag}
              tone="indigo"
              label={t(`reservations.tags.${tag}`, tag.replace(/_/g, " "))}
            />
          ))}
          {r.marketingConsent && <Badge tone="green" label="Marketing OK" />}
        </div>
      )}

      {r.customerNotes && (
        <p className="text-xs text-gray-600 mt-2 italic">“{r.customerNotes}”</p>
      )}
      {r.internalNotes && (
        <p className="text-xs text-gray-500 mt-1 flex items-start gap-1">
          <Lock className="w-3 h-3 mt-0.5 shrink-0" /> {r.internalNotes}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        {r.status === "PENDING" && (
          <>
            <ActionBtn
              onClick={() => onAction("ACCEPT")}
              disabled={busy}
              label={t("reservations.accept", "Accept")}
              tone="primary"
            />
            <ActionBtn
              onClick={() => onAction("DECLINE")}
              disabled={busy}
              label={t("reservations.decline", "Decline")}
            />
          </>
        )}
        {r.status === "CONFIRMED" && (
          <>
            <ActionBtn
              onClick={() => onAction("ARRIVED")}
              disabled={busy}
              label={t("reservations.arrived", "Arrived")}
              tone="primary"
            />
            {started && (
              <ActionBtn
                onClick={() => onAction("NO_SHOW")}
                disabled={busy}
                label={t("reservations.noShow", "No-show")}
              />
            )}
            <ActionBtn
              onClick={() => onAction("CANCEL")}
              disabled={busy}
              label={t("reservations.cancel", "Cancel")}
            />
          </>
        )}
        <ActionBtn
          onClick={() => setEditing((v) => !v)}
          disabled={busy}
          label={
            editing
              ? t("reservations.close", "Close")
              : t("reservations.editTags", "Tags / notes")
          }
        />
      </div>

      {editing && (
        <div className="mt-3 border-t pt-3 space-y-2">
          <p className="text-xs font-medium text-gray-600">
            {t("reservations.patronTags", "Patron tags (staff only)")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {STAFF_PATRON_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
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
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder={t(
              "reservations.internalNotesPlaceholder",
              "Internal notes (not visible to the guest)",
            )}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <ActionBtn
            onClick={() => saveInternal.mutate()}
            disabled={saveInternal.isPending}
            label={t("reservations.save", "Save")}
            tone="primary"
          />
        </div>
      )}
    </div>
  );
}

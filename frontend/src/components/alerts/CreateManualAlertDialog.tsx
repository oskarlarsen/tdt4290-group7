import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarDays, X } from "lucide-react";
import { ALERT_CATEGORIES } from "../../types/dashboard";
import type {
  AlertCategory,
  AlertFindingType,
  AlertSeverity,
  NewManualAlertInput,
  TopRiskSupplier,
} from "../../types/dashboard";

const CATEGORY_LABELS: Record<AlertCategory, string> = {
  ENVIRONMENTAL_COMPLIANCE: "Environmental Compliance",
  ENERGY_FUEL: "Energy & Fuel",
  VEHICLE_COMPLIANCE: "Vehicle Compliance",
  CERTIFICATES: "Certificates",
};

const SEVERITIES: { value: AlertSeverity; label: string }[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const ALERT_TYPES: { value: AlertFindingType; label: string }[] = [
  { value: "CONFIRMED_DEVIATION", label: "Confirmed Deviation" },
  { value: "MISSING_DOCUMENTATION", label: "Missing Documentation" },
  { value: "UPCOMING_EXPIRY", label: "Upcoming Expiry" },
];

export function parseEuropeanDueDate(value: string): string | undefined {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return undefined;

  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }

  return `${yearText}-${monthText}-${dayText}`;
}

function formatDueDateForInput(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

type Props = {
  open: boolean;
  suppliers: TopRiskSupplier[];
  onClose: () => void;
  /** noteToSelf is set when the admin ticked "Save a note to self". */
  onCreate: (input: NewManualAlertInput, noteToSelf?: string) => Promise<void>;
};

export function CreateManualAlertDialog({ open, suppliers, onClose, onCreate }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [category, setCategory] = useState<AlertCategory | "">("");
  const [severity, setSeverity] = useState<AlertSeverity | "">("");
  const [findingType, setFindingType] = useState<AlertFindingType | "">("");
  const [description, setDescription] = useState("");
  const [dueDateInput, setDueDateInput] = useState("");
  const [saveNote, setSaveNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    dialog.showModal();
    return () => dialog.close();
  }, [open]);

  function resetForm() {
    setTitle("");
    setSupplierId("");
    setCategory("");
    setSeverity("");
    setFindingType("");
    setDescription("");
    setDueDateInput("");
    setSaveNote(false);
    setNoteText("");
    setError("");
  }

  function close() {
    if (isSaving) return;
    resetForm();
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    const dueDate = dueDateInput ? parseEuropeanDueDate(dueDateInput) : undefined;
    if (!trimmedTitle || !supplierId || !category || !severity || !findingType || !trimmedDescription) {
      setError("Complete all required fields before creating the alert.");
      return;
    }
    if (dueDateInput && !dueDate) {
      setError("Enter a valid due date in DD/MM/YYYY format.");
      return;
    }
    if (saveNote && !noteText.trim()) {
      setError("Write the note, or untick \"Save a note to self\".");
      return;
    }

    setError("");
    setIsSaving(true);
    try {
      await onCreate({
        title: trimmedTitle,
        supplierId,
        category,
        severity,
        findingType,
        description: trimmedDescription,
        dueDate: dueDate || undefined,
      }, saveNote ? noteText.trim() : undefined);
      resetForm();
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Could not create the alert. Try again."
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!open) return null;

  const fieldClassName =
    "mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10";
  const labelClassName = "block text-xs font-medium text-neutral-700";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="create-manual-alert-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) close();
      }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-xl border border-neutral-100 bg-white p-0 text-neutral-800 shadow-card backdrop:bg-neutral-900/30"
    >
      <header className="flex items-start justify-between gap-4 border-b border-neutral-100 px-5 py-4">
        <div>
          <h2 id="create-manual-alert-title" className="font-headline text-lg font-semibold text-neutral-900">
            Create Manual Alert
          </h2>
          <p className="mt-1 text-sm leading-5 text-neutral-500">
            Record a follow-up alert for a supplier. The title and description are shown to the supplier, so write them for them.
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          disabled={isSaving}
          aria-label="Close Create Manual Alert"
          className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <form onSubmit={submit} className="space-y-4 p-5">
        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <label className={labelClassName}>
          Alert Title *
          <input
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={fieldClassName}
            autoFocus
          />
        </label>

        <label className={labelClassName}>
          Supplier *
          <select
            required
            value={supplierId}
            onChange={(event) => setSupplierId(event.target.value)}
            className={fieldClassName}
          >
            <option value="">Select a supplier</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.displayName} · {supplier.orgId}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClassName}>
            Risk Category *
            <select
              required
              value={category}
              onChange={(event) => {
                const nextCategory = ALERT_CATEGORIES.find((item) => item === event.target.value);
                setCategory(nextCategory ?? "");
              }}
              className={fieldClassName}
            >
              <option value="">Select a category</option>
              {ALERT_CATEGORIES.map((item) => (
                <option key={item} value={item}>{CATEGORY_LABELS[item]}</option>
              ))}
            </select>
          </label>

          <label className={labelClassName}>
            Risk *
            <select
              required
              value={severity}
              onChange={(event) => {
                const nextSeverity = SEVERITIES.find((item) => item.value === event.target.value);
                setSeverity(nextSeverity?.value ?? "");
              }}
              className={fieldClassName}
            >
              <option value="">Select severity</option>
              {SEVERITIES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
        </div>

        <label className={labelClassName}>
          Alert Type *
          <select
            required
            value={findingType}
            onChange={(event) => {
              const nextType = ALERT_TYPES.find((item) => item.value === event.target.value);
              setFindingType(nextType?.value ?? "");
            }}
            className={fieldClassName}
          >
            <option value="">Select an alert type</option>
            {ALERT_TYPES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>

        <label className={labelClassName}>
          Description *
          <textarea
            required
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className={fieldClassName}
          />
        </label>

        <label className={labelClassName}>
          Due Date
          <span className="mt-1 flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              placeholder="DD/MM/YYYY"
              aria-label="Due Date (DD/MM/YYYY)"
              value={dueDateInput}
              onChange={(event) => setDueDateInput(event.target.value)}
              className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
            />
            <span className="relative inline-flex h-[38px] w-[42px] shrink-0 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              <input
                type="date"
                aria-label="Choose due date"
                value={parseEuropeanDueDate(dueDateInput) ?? ""}
                onChange={(event) => setDueDateInput(formatDueDateForInput(event.target.value))}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </span>
          </span>
          <span className="sr-only">Enter date as day/month/year.</span>
        </label>

        <div>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" checked={saveNote} onChange={(event) => setSaveNote(event.target.checked)} />
            Save a note to self
          </label>
          {saveNote && (
            <label className={`${labelClassName} mt-2`}>
              Note to self
              <textarea
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                maxLength={2000}
                rows={3}
                className={fieldClassName}
              />
              <span className="mt-1 block font-normal text-neutral-500">Only you see this note. It is never shown to the supplier.</span>
            </label>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
          <button
            type="button"
            onClick={close}
            disabled={isSaving}
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving || suppliers.length === 0}
            className="rounded-lg bg-primary-900 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Creating…" : "Create Alert"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { ALERT_CATEGORIES } from "../../types/dashboard";
import type {
  AlertCategory,
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

type Props = {
  open: boolean;
  suppliers: TopRiskSupplier[];
  onClose: () => void;
  onCreate: (input: NewManualAlertInput) => Promise<void>;
};

export function CreateManualAlertDialog({ open, suppliers, onClose, onCreate }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [category, setCategory] = useState<AlertCategory | "">("");
  const [severity, setSeverity] = useState<AlertSeverity | "">("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
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
    setDescription("");
    setDueDate("");
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
    if (!trimmedTitle || !supplierId || !category || !severity || !trimmedDescription) {
      setError("Complete all required fields before creating the alert.");
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
        description: trimmedDescription,
        dueDate: dueDate || undefined,
      });
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
            Record a follow-up alert for a supplier.
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          disabled={isSaving}
          aria-label="Close Create Manual Alert"
          className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700 disabled:opacity-50"
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
          <input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className={fieldClassName}
          />
        </label>

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

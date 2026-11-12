import { Download, FileUp } from "lucide-react";
import { downloadCsvTemplate, type CsvEntity } from "../../api/onboarding";

/** Download the template for one kind of reporting data and upload the filled-in file for review. */
export function CsvUploadPanel({ entity, disabled, onPreview, onChange }: {
  entity: CsvEntity;
  disabled: boolean;
  onPreview: (file: File) => void;
  onChange: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-neutral-300 p-3 text-sm text-neutral-600">
      <span className="mr-auto">Last ned malen, fyll den ut og last den opp for gjennomgang.</span>
      <button
        type="button"
        onClick={() => void downloadCsvTemplate(entity)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Last ned CSV-mal
      </button>
      <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 ${disabled ? "pointer-events-none opacity-50" : ""}`}>
        <FileUp className="h-4 w-4" aria-hidden="true" />
        Last opp utfylt CSV
        <input
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) { onChange(); onPreview(file); }
          }}
        />
      </label>
    </div>
  );
}

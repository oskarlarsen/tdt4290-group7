import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { DerivedContract } from "../../types/contract";
import type { NewSupplierInput, TopRiskSupplier } from "../../types/dashboard";
import { DUPLICATE_SUPPLIER_ORG_ID_MESSAGE, normalizeSupplierOrgId } from "../../utils/supplier";

type Props = {
  open: boolean;
  existingSuppliers: TopRiskSupplier[];
  contracts: DerivedContract[];
  contractsLoading: boolean;
  contractsError: boolean;
  onClose: () => void;
  onAddSupplier: (supplier: NewSupplierInput) => Promise<void>;
};

export function AddSupplierDialog({
  open,
  existingSuppliers,
  contracts,
  contractsLoading,
  contractsError,
  onClose,
  onAddSupplier,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [displayName, setDisplayName] = useState("");
  const [orgId, setOrgId] = useState("");
  const [email, setEmail] = useState("");
  const [contractId, setContractId] = useState("");
  const [nameError, setNameError] = useState("");
  const [orgIdError, setOrgIdError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [contractError, setContractError] = useState("");
  const [submissionError, setSubmissionError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    dialog.showModal();
    return () => dialog.close();
  }, [open]);

  function close() {
    if (isSubmitting) return;
    resetForm();
    onClose();
  }

  function resetForm() {
    setDisplayName("");
    setOrgId("");
    setEmail("");
    setContractId("");
    setNameError("");
    setOrgIdError("");
    setEmailError("");
    setContractError("");
    setSubmissionError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const trimmedName = displayName.trim();
    const trimmedOrgId = orgId.trim();
    const trimmedEmail = email.trim();
    const nextNameError = trimmedName ? "" : "Supplier name is required.";
    const nextOrgIdError = !trimmedOrgId
      ? "Organization ID is required."
      : existingSuppliers.some(
            (supplier) =>
              normalizeSupplierOrgId(supplier.orgId) === normalizeSupplierOrgId(trimmedOrgId)
          )
        ? DUPLICATE_SUPPLIER_ORG_ID_MESSAGE
        : "";
    const nextEmailError = !trimmedEmail
      ? "Email address is required."
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)
        ? "Enter a valid email address."
        : "";
    const selectedContract = contracts.find((contract) => contract.id === contractId);
    const nextContractError =
      contractId && !selectedContract
        ? "The selected contract is no longer available. Choose another contract or leave this blank."
        : "";
    setNameError(nextNameError);
    setOrgIdError(nextOrgIdError);
    setEmailError(nextEmailError);
    setContractError(nextContractError);
    setSubmissionError("");
    if (nextNameError || nextOrgIdError || nextEmailError || nextContractError) return;

    setIsSubmitting(true);
    try {
      await onAddSupplier({
        displayName: trimmedName,
        orgId: trimmedOrgId,
        email: trimmedEmail,
        primaryContract: selectedContract?.contractName,
      });
      resetForm();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === DUPLICATE_SUPPLIER_ORG_ID_MESSAGE) setOrgIdError(message);
      else if (message === "Enter a valid email address.") setEmailError(message);
      else setSubmissionError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="add-supplier-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close();
        }
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) close();
      }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-xl border border-neutral-100 bg-white p-0 text-neutral-800 shadow-card backdrop:bg-neutral-900/30"
    >
      <header className="flex items-start justify-between gap-4 border-b border-neutral-100 px-4 py-4">
        <div>
          <h2 id="add-supplier-title" className="font-headline text-lg font-semibold text-neutral-900">
            Add supplier
          </h2>
          <p className="mt-1 text-sm leading-5 text-neutral-500">
            New suppliers start as unassessed and are marked To Review.
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          disabled={isSubmitting}
          aria-label="Close Add Supplier"
          className="shrink-0 rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-50 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <form onSubmit={submit} noValidate className="space-y-5 p-4">
        <div className="space-y-4">
          <div>
            <label htmlFor="supplier-name" className="mb-1.5 block text-xs font-medium text-neutral-700">
              Supplier name <span aria-hidden="true">*</span>
            </label>
            <input
              id="supplier-name"
              autoFocus
              required
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value);
                setNameError("");
                setSubmissionError("");
              }}
              aria-invalid={Boolean(nameError)}
              aria-describedby={nameError ? "supplier-name-error" : undefined}
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 placeholder:text-neutral-400 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
            />
            {nameError && (
              <p id="supplier-name-error" role="alert" className="mt-1 text-xs text-red-700">
                {nameError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="supplier-org-id" className="mb-1.5 block text-xs font-medium text-neutral-700">
              Organization ID <span aria-hidden="true">*</span>
            </label>
            <input
              id="supplier-org-id"
              required
              value={orgId}
              onChange={(event) => {
                setOrgId(event.target.value);
                setOrgIdError("");
                setSubmissionError("");
              }}
              aria-invalid={Boolean(orgIdError)}
              aria-describedby={orgIdError ? "supplier-org-id-error" : undefined}
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 placeholder:text-neutral-400 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
            />
            {orgIdError && (
              <p id="supplier-org-id-error" role="alert" className="mt-1 text-xs text-red-700">
                {orgIdError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="supplier-email" className="mb-1.5 block text-xs font-medium text-neutral-700">
              Email address <span aria-hidden="true">*</span>
            </label>
            <input
              id="supplier-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setEmailError("");
                setSubmissionError("");
              }}
              aria-invalid={Boolean(emailError)}
              aria-describedby={emailError ? "supplier-email-error" : "supplier-email-help"}
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 placeholder:text-neutral-400 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
            />
            {emailError ? (
              <p id="supplier-email-error" role="alert" className="mt-1 text-xs text-red-700">
                {emailError}
              </p>
            ) : (
              <p id="supplier-email-help" className="mt-1 text-xs leading-5 text-neutral-500">
                Stored as the supplier’s login email; adding this mock record does not create an account.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="supplier-contract" className="mb-1.5 block text-xs font-medium text-neutral-700">
              Primary contract <span className="font-normal text-neutral-400">(optional)</span>
            </label>
            <select
              id="supplier-contract"
              value={contractId}
              disabled={contractsLoading}
              onChange={(event) => {
                setContractId(event.target.value);
                setContractError("");
              }}
              aria-invalid={Boolean(contractError)}
              aria-describedby={contractError ? "supplier-contract-error" : "supplier-contract-help"}
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10 disabled:bg-neutral-50"
            >
              <option value="">No primary contract</option>
              {contracts.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {contract.contractName} — {contract.supplierName}
                </option>
              ))}
            </select>
            {contractError ? (
              <p id="supplier-contract-error" role="alert" className="mt-1 text-xs text-red-700">
                {contractError}
              </p>
            ) : (
              <p id="supplier-contract-help" className="mt-1 text-xs leading-5 text-neutral-500">
                {contractsLoading
                  ? "Loading existing contracts…"
                  : contractsError
                    ? "Existing contracts could not be loaded. You can still add a supplier without selecting one."
                    : contracts.length === 0
                      ? "No existing contracts are available to select."
                      : "Select an existing contract, or leave this blank."}
              </p>
            )}
          </div>

        </div>

        {submissionError && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {submissionError}
          </p>
        )}

        <footer className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
          <button
            type="button"
            onClick={close}
            disabled={isSubmitting}
            className="inline-flex min-h-8 items-center justify-center rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex min-h-8 items-center justify-center rounded-lg bg-primary-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Adding…" : "Add Supplier"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

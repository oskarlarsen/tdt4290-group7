/** Display name for an agreement: "saksnr — note". Mirrors the backend agreementLabel. */
export function hasSaksnr(agreement: { saksnr?: string | null }): boolean {
  return !!agreement.saksnr?.trim();
}

export function agreementLabel(agreement: { saksnr?: string | null; note: string }): string {
  const number = hasSaksnr(agreement) ? agreement.saksnr!.trim() : "Saksnr missing";
  const note = agreement.note.trim();
  return note ? `${number} — ${note}` : number;
}

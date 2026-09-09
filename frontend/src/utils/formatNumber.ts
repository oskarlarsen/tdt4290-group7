export function formatNumber(value: number): string {
  return new Intl.NumberFormat("no-NO").format(value);
}

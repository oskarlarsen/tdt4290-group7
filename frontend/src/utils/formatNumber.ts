export function formatNumber(value: number): string {
  return new Intl.NumberFormat("nb-NO").format(value);
}

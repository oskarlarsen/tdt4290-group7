import type { DeviationFinding, VehicleCheck } from "../../types/vehicle";
import { analyzeDeviation } from "../../utils/deviationAnalysis";

export function DeviationFacts({ finding, check }: { finding: DeviationFinding; check: VehicleCheck }) {
  const analysis = analyzeDeviation(finding, check);
  return <details className="mt-3 rounded-lg border border-neutral-200 bg-white">
    <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-primary-900">See compared values</summary>
    <div className="space-y-3 px-3 pb-3">
      <p className="text-sm text-neutral-600">{analysis.explanation}</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[30rem] table-fixed text-left text-sm">
        <caption className="sr-only">Saved facts for {analysis.title}</caption>
        <thead><tr className="border-b border-neutral-200"><th scope="col" className="w-1/4 py-2 pr-3 font-medium text-neutral-500">Fact</th><th scope="col" className="py-2 pr-3 font-medium">{analysis.comparison.leftLabel}</th><th scope="col" className="py-2 font-medium">{analysis.comparison.rightLabel}</th></tr></thead>
        <tbody>{analysis.comparison.rows.map((row, index) => <tr key={index} className="border-b border-neutral-100 last:border-0">
          <th scope="row" className="py-3 pr-3 align-top font-normal text-neutral-500">{row.label}</th>
          <td className="whitespace-pre-wrap break-words py-3 pr-3 align-top font-medium text-neutral-900">{row.left}</td>
          <td className={`whitespace-pre-wrap break-words py-3 align-top font-medium ${row.left !== row.right ? "text-red-800" : "text-neutral-900"}`}>{row.right}</td>
        </tr>)}</tbody>
      </table></div>
      {analysis.inputs && <section><h5 className="text-xs font-semibold text-neutral-600">Calculation inputs from this reporting row</h5><dl className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {analysis.inputs.map(([label, value]) => <div key={label}><dt className="text-xs text-neutral-500">{label}</dt><dd className="mt-1 break-words text-sm font-medium">{value}</dd></div>)}
      </dl></section>}
      {analysis.note && <p className="rounded bg-neutral-50 p-3 text-xs leading-5 text-neutral-600">{analysis.note}</p>}
      {analysis.explanation !== finding.description && <details className="text-xs text-neutral-500"><summary className="cursor-pointer">Original check explanation</summary><p className="mt-2 break-words">{finding.description}</p></details>}
    </div>
  </details>;
}

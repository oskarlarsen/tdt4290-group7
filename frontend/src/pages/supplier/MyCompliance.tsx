import { useMySupplierOverview } from "../../hooks/useMySupplierOverview";
import { Loader2, FileText } from "lucide-react";

export default function MyCompliance() {
  const { data, isLoading, isError, error } = useMySupplierOverview();

  if (isLoading) return <div className="flex h-64 items-center justify-center text-neutral-500"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (isError || !data) return <div className="p-8 text-center text-sm text-red-700">{error instanceof Error ? error.message : "Kunne ikke laste data"}</div>;

  const { certificates, products } = data;

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="font-headline text-2xl font-semibold text-neutral-900">Min miljøoppfølging</h1>
      <section className="rounded-xl border border-neutral-100 bg-white p-6">
         <div className="flex items-start gap-4">
            <div className="mt-1"><FileText className="h-6 w-6 text-neutral-500" /></div>
            <div>
               <h2 className="text-lg font-medium text-neutral-900 mb-2">Lagret dokumentasjon</h2>
               <p className="text-sm text-neutral-600">{certificates.length} {certificates.length === 1 ? "sertifikat" : "sertifikater"} og {products.length} {products.length === 1 ? "produkt" : "produkter"} er knyttet til avtalene dine.</p>
               <p className="mt-2 text-sm text-neutral-500">Kommunen vurderer om det er avvik. Se Påkrevde tiltak for det som venter på deg.</p>
            </div>
         </div>
      </section>
      {products.length > 0 && <section className="rounded-xl border border-neutral-100 bg-white p-6"><h2 className="mb-3 text-lg font-medium">Rapporterte produkter</h2><ul className="divide-y divide-neutral-100">{products.map((product) => <li key={product.id} className="py-3"><p className="font-medium text-neutral-900">{product.productName}</p><p className="text-sm text-neutral-500">{product.productCategory.replace(/_/g, " ")} · {product.ecolabelStandard.replace(/_/g, " ")}{product.isRepairedOrReused ? " · reparert eller gjenbrukt" : ""}</p></li>)}</ul></section>}
    </div>
  );
}
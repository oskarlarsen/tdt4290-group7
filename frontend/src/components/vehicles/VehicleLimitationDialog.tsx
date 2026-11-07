import { X, Info, Truck } from "lucide-react";

export function VehicleLimitationDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/30 p-4" onClick={onClose}>
      <div
        role="dialog"
        className="w-full max-w-md rounded-xl border border-neutral-100 bg-white shadow-card overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-amber-50 px-5 py-4 border-b border-amber-100 flex items-start justify-between">
           <div className="flex items-center gap-3">
              <div className="bg-amber-100 p-2 rounded-lg text-amber-700">
                 <Truck className="h-5 w-5" />
              </div>
              <div>
                 <h2 className="font-headline text-base font-bold text-amber-900">Vehicle Updates Unavailable</h2>
                 <p className="text-[11px] text-amber-700 font-medium uppercase tracking-wide">System Limitation</p>
              </div>
           </div>
           <button onClick={onClose} className="text-amber-500 hover:text-amber-700 hover:bg-amber-100/50 p-1.5 rounded-lg transition-colors">
             <X className="h-4 w-4" />
           </button>
        </div>
        <div className="p-5">
           <div className="flex items-start gap-3 text-sm text-neutral-700 leading-relaxed mb-4">
              <Info className="h-5 w-5 text-neutral-400 shrink-0 mt-0.5" />
              <p>
                 You cannot add or update vehicle information at this time because the required vehicle fleet management backend API (<code className="bg-neutral-100 px-1 rounded text-xs">/api/vehicle-fleet</code>) is currently offline or unreachable.
              </p>
           </div>
           <p className="text-sm text-neutral-700 leading-relaxed mb-6">
              <strong>Required Implementation:</strong> To enable this feature, municipal administrators must restore or implement the POST and PUT endpoints for vehicles and fleet agreements. Please contact support if you need to submit fleet data urgently.
           </p>
           <div className="flex justify-end">
              <button onClick={onClose} className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-200 transition-colors">
                 Understood
              </button>
           </div>
        </div>
      </div>
    </div>
  );
}
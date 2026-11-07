import { useMySupplierOverview } from "../../hooks/useMySupplierOverview";
import { Loader2, AlertTriangle, CheckCircle2, Clock, FileText, ArrowRight, MessageSquare, ChevronDown, ChevronUp, Check, Mail, Hourglass, HelpCircle, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../hooks/useAuth";
import { MOCK_SUPPLIER_MAPPING } from "../../utils/supplierOverview";
import { useSupplierNotices, useMarkNoticeAsRead } from "../../hooks/useSupplierNotices";
import { useState } from "react";
import { StatCard, TaskCard, SectionHeading } from "../../components/supplier/DashboardCards";
import { ReviewDetailsDialog } from "../../components/ui/ReviewDetailsDialog";
import { CertificateUploadDialog } from "../../components/certificates/CertificateUploadDialog";
import { VehicleLimitationDialog } from "../../components/vehicles/VehicleLimitationDialog";
import { InformationOnFileModal } from "../../components/supplier/InformationOnFileModal";
import type { PendingReview } from "../../mocks/db";
import type { Vehicle } from "../../types/vehicle";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

export default function Dashboard() {
  const { user } = useAuth();
  const authSupplierId = user?.supplierId;
  const supplierId = authSupplierId === "supplier-1" ? MOCK_SUPPLIER_MAPPING : authSupplierId;

  const { data, isLoading, isError, error } = useMySupplierOverview();
  const { data: notices } = useSupplierNotices(supplierId ?? null);
  const markAsRead = useMarkNoticeAsRead(supplierId ?? null);

  const [expandedNoticeId, setExpandedNoticeId] = useState<string | null>(null);
  const [selectedReview, setSelectedReview] = useState<PendingReview | null>(null);
  const [isCertUploadOpen, setCertUploadOpen] = useState(false);
  const [uploadContractId, setUploadContractId] = useState<string | undefined>(undefined);
  const [isVehicleLimitationOpen, setVehicleLimitationOpen] = useState(false);
  const [infoModalState, setInfoModalState] = useState<{ isOpen: boolean; type: "certificates" | "vehicles" }>({ isOpen: false, type: "certificates" });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-neutral-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-8 text-center text-sm text-red-700">
        {error instanceof Error ? error.message : "Couldn't load your supplier overview. Please try again!"}
      </div>
    );
  }

  const { supplier, contract, contracts, requiredActions, summaries, raw } = data;

  const pendingCount = data.pendingReviews ? data.pendingReviews.length : 0;
  const activeContractsCount = contracts ? contracts.filter(c => c.status === "Active").length : (contract?.status === "Active" ? 1 : 0);
  const unreadCount = notices ? notices.filter(n => !n.isRead).length : 0;

  // Filter valid certificates for the Information On File modal
  const validCertificates = raw.certificates ? raw.certificates.filter(c => {
     if (!c.validUntil) return true; // Treat unknown expiry as valid for on file display
     const daysUntilExpiry = Math.ceil((new Date(c.validUntil).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
     return daysUntilExpiry > 0;
  }) : [];

  // Filter vehicles for the Information On File modal
  let validVehicles: Vehicle[] = [];
  if (raw.vehicles && supplierId) {
     const myAgreement = raw.vehicles.agreements.find(a => a.supplierId === supplierId || a.supplierId === "sup-c");
     if (myAgreement) {
         validVehicles = raw.vehicles.vehicles.filter(v => v.agreementId === myAgreement.id);
     }
  }

  const getContractName = (id: string | null) => {
    const matched = contracts.find(c => c.id === id);
    return matched ? matched.contractName : "Municipal Contract";
  };

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="Supplier Home"
        tag="ACTIVE OPERATIONAL CYCLE"
        description={`${supplier?.name || "Supplier"} • ${contract?.contractName || "Municipal Concession"}`}
      >
        <button className="bg-white border border-neutral-200 text-neutral-800 font-semibold px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-neutral-50">
          <HelpCircle className="w-4 h-4" />
          Support
        </button>
      </PageHeader>

      {/* KPI Row - 4 Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Link to="/supplier/contracts" className="block h-full hover:opacity-90 transition-opacity">
          <StatCard
            title="My Contracts"
            value={activeContractsCount}
            description="Active agreements"
            accentColor="dark-green"
            icon={<FileText className="h-5 w-5" />}
          />
        </Link>
        <a href="#action-required" className="block h-full hover:opacity-90 transition-opacity">
          <StatCard
            title="Action Required"
            value={requiredActions.length}
            description="Pending tasks"
            bottomRightText={requiredActions.length > 0 ? "Urgent" : undefined}
            bottomRightTextColor="text-red-600"
            accentColor={requiredActions.length > 0 ? "red" : "green"}
            icon={<AlertTriangle className="h-5 w-5" />}
          />
        </a>
        <a href="#pending-review" className="block h-full hover:opacity-90 transition-opacity">
          <StatCard
            title="Pending Review"
            value={pendingCount}
            description="Awaiting sign-off"
            bottomRightText={pendingCount > 0 ? "Pending" : undefined}
            bottomRightTextColor="text-primary-900"
            accentColor="dark-green"
            icon={<Hourglass className="h-5 w-5" />}
          />
        </a>
        <a href="#messages" className="block h-full hover:opacity-90 transition-opacity">
          <StatCard
            title="Unread Messages"
            value={unreadCount}
            description="New notifications"
            bottomRightText={unreadCount > 0 ? "New" : undefined}
            bottomRightTextColor="text-indigo-600"
            accentColor="dark-green"
            icon={<MessageSquare className="h-5 w-5" />}
          />
        </a>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Left Column */}
        <div className="lg:col-span-2 space-y-8">

          {/* Action Required */}
          <div id="action-required">
            <SectionHeading
              title="Action Required"
              dotColor="bg-red-600"
              rightNode={requiredActions.length > 0 ? (
                <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 uppercase tracking-wide">
                  {requiredActions.length} Urgent Items
                </span>
              ) : undefined}
            />
            {requiredActions.length > 0 ? (
              <div className="space-y-4">
                {requiredActions.map((action, idx) => {
                  const isCertificate = action.link === "/supplier/certificates";
                  const isVehicle = action.link === "/supplier/vehicles";

                  return (
                  <TaskCard
                    key={idx}
                    title={action.title}
                    description={action.reason}
                    pill={
                      <span className="inline-flex items-center rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800">
                        <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-red-600"></span>
                        Action Required
                      </span>
                    }
                    button={
                      isCertificate ? (
                        <button
                           onClick={() => {
                             setUploadContractId(action.contractId);
                             setCertUploadOpen(true);
                           }}
                           className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary-900 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-800 w-full sm:w-auto"
                        >
                          <FileText className="h-3.5 w-3.5" /> Upload Document
                        </button>
                      ) : isVehicle ? (
                        <button
                           onClick={() => setVehicleLimitationOpen(true)}
                           className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-neutral-100 border border-neutral-200 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-200 w-full sm:w-auto"
                        >
                          <Truck className="h-3.5 w-3.5" /> Update Vehicle Data
                        </button>
                      ) : (
                        <Link to={action.link} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary-900 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-800 w-full sm:w-auto">
                          <FileText className="h-3.5 w-3.5" /> Resolve Issue
                        </Link>
                      )
                    }
                  />
                )})}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-neutral-500 bg-white rounded-xl border border-neutral-100 shadow-sm flex flex-col items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-500 mb-2" />
                <p>No immediate actions required.</p>
              </div>
            )}
          </div>

          {/* Pending Municipal Review */}
          <div id="pending-review">
            <SectionHeading
              title="Pending Municipal Review"
              dotColor="bg-primary-900"
              rightNode={
                <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-600 uppercase tracking-wide">
                  Under Administrative Evaluation
                </span>
              }
            />
            {data.pendingReviews && data.pendingReviews.length > 0 ? (
              <div className="space-y-4">
                {data.pendingReviews.map(review => (
                  <TaskCard
                    key={review.id}
                    title={review.title}
                    description={`Review requested for submission. Pending action from administrative review officers.`}
                    pill={
                      <span className="inline-flex items-center rounded bg-green-100 px-2 py-0.5 text-[10px] font-bold text-primary-900">
                        <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-primary-800"></span>
                        In Review
                      </span>
                    }
                    subtitle={`Submitted ${review.submittedAt}`}
                    button={
                      <button
                        onClick={() => setSelectedReview(review)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary-900 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-800 w-full sm:w-auto"
                      >
                        View Details
                      </button>
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-neutral-500 bg-white rounded-xl border border-neutral-100 shadow-sm flex flex-col items-center justify-center">
                <Hourglass className="h-6 w-6 text-neutral-300 mb-2" />
                <p>No pending reviews at this time.</p>
              </div>
            )}
          </div>

          {/* Messages from Municipality */}
          <div id="messages">
            <SectionHeading
              title="Messages from Municipality"
              dotColor="bg-indigo-500"
              rightNode={unreadCount > 0 ? (
                <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 uppercase tracking-wide">
                  {unreadCount} Unread
                </span>
              ) : undefined}
            />
            {notices && notices.length > 0 ? (
              <div className="space-y-4">
                {notices.map((notice) => {
                  const isExpanded = expandedNoticeId === notice.id;
                  return (
                    <div key={notice.id} className={`bg-white rounded-xl shadow-sm border p-5 ${!notice.isRead ? 'border-indigo-200 shadow-indigo-100/50' : 'border-neutral-100'}`}>
                      <button
                        onClick={() => {
                          if (!isExpanded) {
                            setExpandedNoticeId(notice.id);
                            if (!notice.isRead) markAsRead.mutate(notice.id);
                          } else {
                            setExpandedNoticeId(null);
                          }
                        }}
                        className="w-full flex items-start justify-between text-left group"
                      >
                        <div className="flex-1 pr-4">
                          <div className="flex items-center gap-2 mb-1">
                            {!notice.isRead && (
                              <span className="h-2 w-2 rounded-full bg-indigo-600 shrink-0" />
                            )}
                            <h4 className={`font-semibold text-sm ${notice.isRead ? "text-neutral-700" : "text-neutral-900"}`}>
                              {notice.title}
                            </h4>
                          </div>
                          <p className="text-[11px] text-neutral-400 font-mono">
                            {new Date(notice.createdAt).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                          {isExpanded && (
                            <div className="mt-4 text-sm text-neutral-700 whitespace-pre-line border-t border-neutral-100 pt-4 leading-relaxed">
                              {notice.message}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 mt-0.5 p-1 rounded-md text-neutral-400 group-hover:bg-neutral-50 group-hover:text-neutral-700 transition-colors">
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-neutral-500 bg-white rounded-xl border border-neutral-100 shadow-sm flex flex-col items-center justify-center">
                <MessageSquare className="h-6 w-6 text-neutral-300 mb-2" />
                <p>No messages at this time.</p>
              </div>
            )}
          </div>

        </div>

        {/* Right Column */}
        <div className="lg:col-span-1 space-y-8">
          {/* Information on File */}
          <div id="information-on-file">
            <SectionHeading
              title="Information on File"
              dotColor="bg-teal-500"
            />

            <div className="space-y-4">
              {summaries.certificates.valid > 0 ? (
                <button onClick={() => setInfoModalState({ isOpen: true, type: "certificates" })} className="w-full text-left bg-white rounded-xl border border-neutral-100 p-4 shadow-sm flex items-center justify-between hover:border-teal-300 hover:shadow-md transition-all group block">
                  <div>
                    <h4 className="font-semibold text-neutral-900 text-sm group-hover:text-teal-800 transition-colors">Active Certificates</h4>
                    <p className="text-[11px] text-neutral-500 mt-0.5">Valid certificates on record</p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
                    <Check className="w-3 h-3 mr-1" /> {summaries.certificates.valid} Verified
                  </span>
                </button>
              ) : (
                <button onClick={() => setInfoModalState({ isOpen: true, type: "certificates" })} className="w-full text-left bg-white rounded-xl border border-neutral-100 p-4 shadow-sm flex items-center justify-between hover:border-neutral-300 transition-all group block">
                  <div>
                    <h4 className="font-semibold text-neutral-900 text-sm">Active Certificates</h4>
                    <p className="text-[11px] text-neutral-500 mt-0.5">No active records found</p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-500">
                    0 Verified
                  </span>
                </button>
              )}

              {summaries.vehicles.tracked > 0 ? (
                <button onClick={() => setInfoModalState({ isOpen: true, type: "vehicles" })} className="w-full text-left bg-white rounded-xl border border-neutral-100 p-4 shadow-sm flex items-center justify-between hover:border-teal-300 hover:shadow-md transition-all group block">
                  <div>
                    <h4 className="font-semibold text-neutral-900 text-sm group-hover:text-teal-800 transition-colors">Registered Fleet</h4>
                    <p className="text-[11px] text-neutral-500 mt-0.5">Tracked vehicles on record</p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
                    <Check className="w-3 h-3 mr-1" /> {summaries.vehicles.tracked} Active
                  </span>
                </button>
              ) : (
                <button onClick={() => setInfoModalState({ isOpen: true, type: "vehicles" })} className="w-full text-left bg-white rounded-xl border border-neutral-100 p-4 shadow-sm flex items-center justify-between hover:border-neutral-300 transition-all group block">
                  <div>
                    <h4 className="font-semibold text-neutral-900 text-sm">Registered Fleet</h4>
                    <p className="text-[11px] text-neutral-500 mt-0.5">No registered vehicles</p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-500">
                    0 Active
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Assistance Banner */}
          <div className="bg-primary-900 rounded-xl p-5 text-white shadow-sm relative overflow-hidden">
            <div className="relative z-10">
              <h4 className="text-[10px] font-bold tracking-wider text-green-300 uppercase mb-2">Municipal Governance</h4>
              <h3 className="font-headline text-lg font-bold mb-2">Need assistance with requirements?</h3>
              <p className="text-xs text-green-50 mb-4 leading-relaxed">
                Municipal liaison officers are available to assist concessionaires with documentation and mass-balance certificate submissions.
              </p>
              <button className="text-xs font-bold text-white hover:text-green-200 flex items-center gap-1 group transition-colors">
                Review Compliance Handbook <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
            {/* Decorative element to simulate the image background */}
            <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none transform translate-x-1/4 translate-y-1/4">
               <HelpCircle className="w-32 h-32" />
            </div>
          </div>
        </div>

      </div>

      {selectedReview && (
        <ReviewDetailsDialog
          review={selectedReview}
          onClose={() => setSelectedReview(null)}
        />
      )}

      {isCertUploadOpen && (
        <CertificateUploadDialog
          contracts={contracts}
          onClose={() => setCertUploadOpen(false)}
          initialContractId={uploadContractId}
        />
      )}

      {isVehicleLimitationOpen && (
        <VehicleLimitationDialog onClose={() => setVehicleLimitationOpen(false)} />
      )}

      <InformationOnFileModal
        type={infoModalState.type}
        isOpen={infoModalState.isOpen}
        onClose={() => setInfoModalState({ ...infoModalState, isOpen: false })}
        certificates={validCertificates}
        vehicles={validVehicles}
        getContractName={getContractName}
      />
    </div>
  );
}
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  Banknote,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
  FileSpreadsheet,
  Filter,
  LoaderCircle,
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react"
import { getAccountsPayable } from "../../features/suppliers/suppliers.api"
import { exportReportExcel, printReport } from "../../utils/businessDocumentExport"
import RecordSupplierPaymentModal from "./RecordSupplierPaymentModal"

function formatMoney(value) {
  const n = Number(value || 0)
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function formatDate(value) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  })
}

export default function AccountsPayableModal({
  initialSupplierId = null,
  onClose,
  selectedBranch,
  suppliers = [],
  user,
}) {
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [noticeMessage, setNoticeMessage] = useState("")
  const [paymentModalItem, setPaymentModalItem] = useState(null)

  // Filter States
  const [search, setSearch] = useState("")
  const [selectedSupplierId, setSelectedSupplierId] = useState(initialSupplierId || "")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [agingFilter, setAgingFilter] = useState("ALL") // "ALL" | "OVERDUE" | "CURRENT"

  const branchId = selectedBranch?.id || user?.branchId || user?.branch?.id || ""

  const loadPayables = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage("")
    try {
      const params = {
        ...(branchId ? { branchId } : {}),
        ...(selectedSupplierId ? { supplierId: selectedSupplierId } : {}),
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
        limit: 500,
      }
      const res = await getAccountsPayable(params)
      setData(res?.data || null)
    } catch (err) {
      setErrorMessage(
        err?.response?.data?.message || err?.message || "Failed to load Accounts Payable."
      )
    } finally {
      setIsLoading(false)
    }
  }, [branchId, selectedSupplierId, dateFrom, dateTo])

  useEffect(() => {
    loadPayables()
  }, [loadPayables])

  // Client-side filtering by search query & aging
  const filteredItems = useMemo(() => {
    if (!data?.items) return []
    let list = data.items

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (it) =>
          it.transactionNo?.toLowerCase().includes(q) ||
          it.supplierName?.toLowerCase().includes(q) ||
          it.supplierCode?.toLowerCase().includes(q) ||
          it.paymentTerms?.toLowerCase().includes(q)
      )
    }

    if (agingFilter === "OVERDUE") {
      list = list.filter((it) => it.isOverdue)
    } else if (agingFilter === "CURRENT") {
      list = list.filter((it) => !it.isOverdue)
    }

    return list
  }, [data?.items, search, agingFilter])

  // Recalculate totals based on filtered items
  const totals = useMemo(() => {
    let amount = 0
    let paid = 0
    let balance = 0
    let overdueCount = 0
    let overdueAmount = 0
    const supplierSet = new Set()

    filteredItems.forEach((it) => {
      amount += Number(it.amount || 0)
      paid += Number(it.paid || 0)
      balance += Number(it.balance || 0)
      if (it.supplierId) supplierSet.add(it.supplierId)
      if (it.isOverdue) {
        overdueCount += 1
        overdueAmount += Number(it.balance || 0)
      }
    })

    return {
      totalAmount: amount,
      totalPaid: paid,
      totalBalance: balance,
      totalCount: filteredItems.length,
      supplierCount: supplierSet.size,
      overdueCount,
      overdueAmount,
    }
  }, [filteredItems])

  // Print function using clean report popup (never blank)
  const handlePrint = () => {
    const targetItems = selectedSupplierId
      ? (data?.items || []).filter((it) => it.supplierId === selectedSupplierId)
      : filteredItems

    const targetSupplier = suppliers.find((s) => s.id === selectedSupplierId)
    const supplierName = targetSupplier?.name

    printReport({
      label: selectedSupplierId
        ? `Outstanding Accounts Payable — ${supplierName?.toUpperCase() || ""}`
        : "Outstanding Accounts Payable",
      columns: [
        ["Transaction No", (it) => it.transactionNo || it.receivingCode || "-"],
        ["Date", (it) => formatDate(it.date)],
        ["Supplier", (it) => it.supplierName || "-"],
        ["Invoice Amount", (it) => `PHP ${formatMoney(it.amount)}`],
        ["Paid Amount", (it) => `PHP ${formatMoney(it.paid)}`],
        ["Outstanding Balance", (it) => `PHP ${formatMoney(it.balance)}`],
        ["Status", (it) => (it.balance <= 0 ? "Paid" : Number(it.paid || 0) > 0 ? "Partial" : "Unpaid")],
        ["Due Date", (it) => formatDate(it.dueDate)],
        ["Aging Status", (it) => (it.isOverdue ? `Overdue (${it.daysOverdue}d)` : "Current")],
      ],
      records: targetItems,
      totals: [
        ["Total Records", String(targetItems.length)],
        ["Total Invoiced Amount", `PHP ${formatMoney(totals.totalAmount)}`],
        ["Total Settled / Paid", `PHP ${formatMoney(totals.totalPaid)}`],
        ["Total Outstanding Balance", `PHP ${formatMoney(totals.totalBalance)}`],
        ["Total Overdue", `PHP ${formatMoney(totals.overdueAmount)}`],
      ],
      branch: selectedBranch || user?.branch,
      generatedBy: user,
    })
  }

  // Export to Excel (supports summary and detailed, all or single supplier)
  const handleExportExcel = (type = "summary", singleSupplierId = null, singleSupplierName = null) => {
    const targetSupplierId = singleSupplierId || selectedSupplierId
    const targetSupplier = suppliers.find((s) => s.id === targetSupplierId)
    const supplierName = singleSupplierName || targetSupplier?.name

    const targetItems = targetSupplierId
      ? (data?.items || []).filter((it) => it.supplierId === targetSupplierId)
      : filteredItems

    const activeFilters = []
    if (targetSupplierId) {
      activeFilters.push({ label: "Supplier", value: supplierName || targetSupplierId })
    }
    if (dateFrom) activeFilters.push({ label: "Date From", value: dateFrom })
    if (dateTo) activeFilters.push({ label: "Date To", value: dateTo })
    if (agingFilter !== "ALL") activeFilters.push({ label: "Aging Status", value: agingFilter })
    if (search.trim()) activeFilters.push({ label: "Search", value: search.trim() })

    const cleanSub = supplierName ? `_${supplierName.replace(/[^a-zA-Z0-9]/g, "_")}` : "_all_suppliers"

    if (type === "summary") {
      // Clean 7-column format
      const headers = [
        "Transactionno",
        "Date",
        "Supplier",
        "Invoice Amount",
        "Paid Amount",
        "Balance",
        "Payment Status",
      ]

      const rows = targetItems.map((it) => [
        it.transactionNo || it.receivingCode || "-",
        formatDate(it.date),
        it.supplierName || "-",
        Number(it.amount || 0),
        Number(it.paid || 0),
        Number(it.balance || 0),
        it.balance <= 0 ? "PAID" : Number(it.paid || 0) > 0 ? "PARTIALLY_PAID" : "UNPAID",
      ])

      exportReportExcel({
        title: supplierName
          ? `OUTSTANDING ACCOUNTS PAYABLE — ${supplierName.toUpperCase()}`
          : "OUTSTANDING ACCOUNTS PAYABLE (STATEMENT SUMMARY)",
        branchName: selectedBranch?.name || user?.branch?.name || "All Branches",
        generatedBy: user?.fullName || user?.username || "System",
        filenamePrefix: `accounts_payable_summary${cleanSub}`,
        headers,
        rows,
        activeFilters,
      })
    } else {
      // Detailed audit breakdown
      const headers = [
        "Transaction No",
        "Receiving Code",
        "Delivery Receipt No",
        "Supplier Invoice No",
        "Reference No",
        "Receiving Date",
        "Supplier Name",
        "Supplier Code",
        "Contact Person",
        "Contact Number",
        "Payment Terms",
        "Invoice Amount (PHP)",
        "Paid Amount (PHP)",
        "Outstanding Balance (PHP)",
        "Payment Status",
        "Due Date",
        "Days Overdue",
        "Aging Status",
        "Branch",
      ]

      const rows = targetItems.map((it) => [
        it.transactionNo || it.receivingCode || "-",
        it.receivingCode || "-",
        it.supplierDeliveryNo || "-",
        it.supplierInvoiceNo || "-",
        it.referenceNo || "-",
        formatDate(it.date),
        it.supplierName || "-",
        it.supplierCode || "-",
        it.contactPerson || "-",
        it.contactNo || "-",
        it.paymentTerms || "COD",
        Number(it.amount || 0),
        Number(it.paid || 0),
        Number(it.balance || 0),
        it.balance <= 0 ? "PAID" : Number(it.paid || 0) > 0 ? "PARTIALLY_PAID" : "UNPAID",
        formatDate(it.dueDate),
        it.daysOverdue || 0,
        it.isOverdue ? `Overdue (${it.daysOverdue} days)` : "Current",
        it.branch?.name || it.branch?.code || "-",
      ])

      exportReportExcel({
        title: supplierName
          ? `OUTSTANDING ACCOUNTS PAYABLE (DETAILED) — ${supplierName.toUpperCase()}`
          : "OUTSTANDING ACCOUNTS PAYABLE (DETAILED AUDIT BREAKDOWN)",
        branchName: selectedBranch?.name || user?.branch?.name || "All Branches",
        generatedBy: user?.fullName || user?.username || "System",
        filenamePrefix: `accounts_payable_detailed${cleanSub}`,
        headers,
        rows,
        activeFilters,
      })
    }
  }

  const shopName = "AUTO SUPPLY PARTS AND ACCESSORIES SHOP"
  const shopAddress =
    selectedBranch?.address ||
    "KINGSPIRE BUSINESS CENTRE, MAC ARTHUR HIGHWAY, SAN ISIDRO, CITY OF SAN FERNANDO, PAMPANGA / 0961-873-5798"

  const currentSupplier = selectedSupplierId
    ? suppliers.find((s) => s.id === selectedSupplierId)
    : null

  return (
    <div className="fixed inset-0 z-60 grid place-items-center overflow-y-auto bg-slate-950/70 p-2 sm:p-4 backdrop-blur-xs">
      {/* Print Specific Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #accounts-payable-printable, #accounts-payable-printable * {
            visibility: visible;
          }
          #accounts-payable-printable {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 20px;
            background: white !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <section
        id="accounts-payable-printable"
        className="my-auto flex flex-col max-h-[94vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all"
      >
        {/* Top Minimalist Action Bar (hidden on print) */}
        <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/90 px-5 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={loadPayables}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 shadow-2xs transition disabled:opacity-50"
              type="button"
            >
              <RefreshCw size={13} className={isLoading ? "animate-spin text-[var(--color-maroon)]" : ""} />
              <span>Preview</span>
            </button>
            <button
              onClick={handlePrint}
              disabled={isLoading || filteredItems.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 shadow-2xs transition disabled:opacity-50"
              type="button"
            >
              <Printer size={13} className="text-slate-600" />
              <span>Print</span>
            </button>

            {/* Split Save As (Summary / Detailed) */}
            <div className="inline-flex rounded-lg shadow-2xs">
              <button
                onClick={() => handleExportExcel("summary")}
                disabled={isLoading || filteredItems.length === 0}
                className="inline-flex items-center gap-1.5 rounded-l-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-50 transition disabled:opacity-50"
                type="button"
                title="Export 5-column summary format"
              >
                <FileSpreadsheet size={13} className="text-emerald-600" />
                <span>Save As (Summary)</span>
              </button>
              <button
                onClick={() => handleExportExcel("detailed")}
                disabled={isLoading || filteredItems.length === 0}
                className="inline-flex items-center gap-1 rounded-r-lg border border-l-0 border-slate-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-900 hover:bg-emerald-100 transition disabled:opacity-50"
                type="button"
                title="Export complete detailed audit breakdown"
              >
                <Download size={13} className="text-emerald-700" />
                <span>Detailed</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-500">
              As of: {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
            <button
              onClick={onClose}
              aria-label="Close Accounts Payable"
              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition shadow-2xs"
              type="button"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable Content Container */}
        <div className="overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Official Letterhead (matching photo & styled cleanly) */}
          <div className="text-center pb-2">
            <h1 className="text-sm sm:text-base font-black tracking-wide text-slate-900 uppercase">
              {shopName}
            </h1>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-600 uppercase tracking-tight max-w-xl mx-auto">
              {shopAddress}
            </p>
            <div className="mt-3 inline-block">
              <h2 className="text-base sm:text-lg font-black tracking-tight text-slate-900 border-b-2 border-slate-900 pb-0.5 px-2 inline-block">
                Outstanding Accounts Payable
                {currentSupplier ? ` — ${currentSupplier.name}` : ""}
              </h2>
            </div>
          </div>

          {/* Minimalist Interactive Filters (hidden in print) */}
          <div className="no-print grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs">
            <div className="relative min-w-0">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full min-w-0 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2.5 text-xs text-slate-800 outline-none focus:border-[var(--color-maroon)] placeholder:text-slate-400"
                placeholder="Search transaction, supplier…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-1.5 min-w-0">
              <select
                className="w-full min-w-0 truncate rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-[var(--color-maroon)]"
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
              >
                <option value="">All Suppliers ({suppliers.length})</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.supplierCode})
                  </option>
                ))}
              </select>
              {selectedSupplierId ? (
                <button
                  type="button"
                  onClick={() => setSelectedSupplierId("")}
                  className="shrink-0 rounded px-2 py-1 text-[11px] font-bold bg-slate-200 text-slate-700 hover:bg-slate-300 transition"
                  title="Show all suppliers"
                >
                  All
                </button>
              ) : null}
            </div>

            <div className="flex items-center gap-1 min-w-0">
              <input
                type="date"
                className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-[var(--color-maroon)]"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                title="Date From"
              />
              <span className="text-slate-400 font-bold shrink-0">-</span>
              <input
                type="date"
                className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-[var(--color-maroon)]"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                title="Date To"
              />
            </div>

            <div className="min-w-0">
              <select
                className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-[var(--color-maroon)]"
                value={agingFilter}
                onChange={(e) => setAgingFilter(e.target.value)}
              >
                <option value="ALL">All Aging Statuses</option>
                <option value="CURRENT">Current / Due Soon</option>
                <option value="OVERDUE">Overdue Only</option>
              </select>
            </div>
          </div>

          {/* Minimalist Summary KPI Row (hidden in print) */}
          <div className="no-print grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 text-xs">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Total Outstanding
              </p>
              <p className="mt-1 font-mono text-base font-black text-[var(--color-maroon)]">
                {formatMoney(totals.totalBalance)}
              </p>
              <p className="text-[10px] text-slate-400 font-medium">
                {totals.totalCount} active deliveries
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 shadow-2xs">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                Total Settled / Paid
              </p>
              <p className="mt-1 font-mono text-base font-black text-emerald-700">
                {formatMoney(totals.totalPaid)}
              </p>
              <p className="text-[10px] text-emerald-700/80 font-medium">
                Disbursed to suppliers
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Total Invoiced Amount
              </p>
              <p className="mt-1 font-mono text-base font-black text-slate-800">
                {formatMoney(totals.totalAmount)}
              </p>
              <p className="text-[10px] text-slate-400 font-medium">
                Gross received deliveries
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 shadow-2xs">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                Overdue Payables
              </p>
              <p className="mt-1 font-mono text-base font-black text-amber-900">
                {formatMoney(totals.overdueAmount)}
              </p>
              <p className="text-[10px] text-amber-700/80 font-bold">
                {totals.overdueCount} past due term
              </p>
            </div>
          </div>

          {/* Notice Message */}
          {noticeMessage ? (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
                <span>{noticeMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setNoticeMessage("")}
                className="text-emerald-700 hover:text-emerald-950 text-[11px] font-bold"
              >
                Dismiss
              </button>
            </div>
          ) : null}

          {/* Error Message */}
          {errorMessage ? (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
              <AlertCircle size={15} />
              <span>{errorMessage}</span>
            </div>
          ) : null}

          {/* Loading Indicator */}
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-xs font-bold text-slate-500">
              <LoaderCircle className="animate-spin text-[var(--color-maroon)]" size={18} />
              Loading Outstanding Accounts Payable…
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-14 text-center">
              <ReceiptText className="mx-auto text-slate-300" size={36} />
              <p className="mt-2 text-xs font-bold text-slate-700">
                No Outstanding Accounts Payable Found
              </p>
              <p className="text-[11px] text-slate-400">
                All supplier deliveries are settled or no records match your selected filters.
              </p>
            </div>
          ) : (
            /* Modern Minimalist Table */
            <div className="border border-slate-300 rounded-lg overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-300 bg-slate-50 text-[11px] font-bold text-slate-800">
                    <th className="px-3.5 py-2.5 font-bold border-r border-slate-300">
                      Transactionno
                    </th>
                    <th className="px-3.5 py-2.5 font-bold border-r border-slate-300">
                      Date
                    </th>
                    <th className="px-3.5 py-2.5 font-bold border-r border-slate-300">
                      Supplier
                    </th>
                    <th className="px-3.5 py-2.5 font-bold text-right border-r border-slate-300">
                      Amount
                    </th>
                    <th className="px-3.5 py-2.5 font-bold text-right border-r border-slate-300">
                      Paid
                    </th>
                    <th className="px-3.5 py-2.5 font-bold text-right border-r border-slate-300">
                      Balance
                    </th>
                    <th className="px-3.5 py-2.5 font-bold text-center border-r border-slate-300">
                      Status
                    </th>
                    <th className="no-print px-3 py-2.5 text-center font-bold">
                      Account Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {filteredItems.map((item, idx) => (
                    <tr
                      key={item.id || idx}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="px-3.5 py-2 font-mono font-bold text-slate-900 border-r border-slate-200 whitespace-nowrap">
                        {item.transactionNo || item.receivingCode}
                      </td>
                      <td className="px-3.5 py-2 font-medium text-slate-700 border-r border-slate-200 whitespace-nowrap">
                        {formatDate(item.date)}
                      </td>
                      <td className="px-3.5 py-2 font-bold text-slate-900 border-r border-slate-200">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="cursor-pointer hover:underline hover:text-[var(--color-maroon)]"
                            onClick={() => setSelectedSupplierId(item.supplierId)}
                            title="Click to view only this supplier"
                          >
                            {item.supplierName}
                          </span>
                          {item.paymentTerms ? (
                            <span className="no-print text-[10px] font-semibold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">
                              {item.paymentTerms}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3.5 py-2 font-mono text-right text-slate-800 border-r border-slate-200 whitespace-nowrap">
                        {Number(item.amount || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-3.5 py-2 font-mono text-right text-emerald-700 font-bold border-r border-slate-200 whitespace-nowrap">
                        {Number(item.paid || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-3.5 py-2 font-mono font-black text-right text-[var(--color-maroon)] border-r border-slate-200 whitespace-nowrap">
                        {Number(item.balance || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-3 py-2 text-center border-r border-slate-200 whitespace-nowrap">
                        {item.balance <= 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-300 px-2 py-0.5 text-[10px] font-black text-emerald-800">
                            <CheckCircle2 size={11} /> Paid
                          </span>
                        ) : Number(item.paid || 0) > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-300 px-2 py-0.5 text-[10px] font-black text-amber-800">
                            Partial
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                            Unpaid
                          </span>
                        )}
                      </td>
                      <td className="no-print px-3 py-1.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {item.balance > 0 ? (
                            <button
                              type="button"
                              onClick={() => setPaymentModalItem(item)}
                              className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-maroon)] bg-[var(--color-maroon)] px-2.5 py-1 text-[11px] font-black text-white hover:opacity-90 transition shadow-2xs cursor-pointer"
                              title="Disburse payment / pay supplier"
                            >
                              <Banknote size={12} /> Pay / Settle
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">
                              <CheckCircle2 size={12} className="text-emerald-600" /> Settled
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleExportExcel("detailed", item.supplierId, item.supplierName)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 transition cursor-pointer"
                            title="Export this supplier's detailed report to Excel"
                          >
                            <FileSpreadsheet size={11} /> Excel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {/* Distinctive Shaded Total Balance Row */}
                  <tr className="border-t-2 border-slate-400 bg-slate-200/90 font-mono text-xs font-black text-slate-900">
                    <td colSpan={3} className="px-3.5 py-2.5 text-right font-bold uppercase tracking-wider text-slate-700 border-r border-slate-300">
                      Total Summary:
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-bold border-r border-slate-300">
                      {Number(totals.totalAmount).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-bold text-emerald-800 border-r border-slate-300">
                      {Number(totals.totalPaid).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-black text-[var(--color-maroon)] text-sm border-r border-slate-300">
                      {Number(totals.totalBalance).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td colSpan={2} className="no-print px-3 py-2 text-center text-[10px] font-bold text-slate-600">
                      {filteredItems.length} delivery record(s)
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Signatures Section for Print Statements */}
          <div className="hidden print:grid grid-cols-3 gap-6 pt-10 text-xs text-center">
            <div>
              <div className="border-b border-slate-400 h-8 mx-6" />
              <p className="mt-1.5 font-bold text-slate-800">Prepared By</p>
              <p className="text-[10px] text-slate-500">{user?.fullName || user?.username || "Purchasing Staff"}</p>
            </div>
            <div>
              <div className="border-b border-slate-400 h-8 mx-6" />
              <p className="mt-1.5 font-bold text-slate-800">Verified By</p>
              <p className="text-[10px] text-slate-500">Accounting / Finance</p>
            </div>
            <div>
              <div className="border-b border-slate-400 h-8 mx-6" />
              <p className="mt-1.5 font-bold text-slate-800">Approved By</p>
              <p className="text-[10px] text-slate-500">Management / Owner</p>
            </div>
          </div>
        </div>

        {/* Modal Bottom Footer (hidden in print) */}
        <footer className="no-print flex items-center justify-between border-t border-slate-200 bg-slate-50/75 px-5 py-3 text-xs">
          <p className="text-slate-500">
            Showing {filteredItems.length} of {data?.items?.length || 0} record(s)
          </p>
          <div className="flex items-center gap-2">
            <button
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 shadow-2xs transition"
              onClick={onClose}
              type="button"
            >
              Close
            </button>
          </div>
        </footer>
      </section>

      {/* Record Supplier Payment Modal */}
      {paymentModalItem ? (
        <RecordSupplierPaymentModal
          item={paymentModalItem}
          onClose={() => setPaymentModalItem(null)}
          onSuccess={() => {
            loadPayables()
            setNoticeMessage("Supplier payment recorded successfully and logged in Store Expenses.")
          }}
          selectedBranch={selectedBranch}
          user={user}
        />
      ) : null}
    </div>
  )
}

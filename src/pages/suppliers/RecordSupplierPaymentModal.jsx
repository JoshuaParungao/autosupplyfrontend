import { useEffect, useState } from "react"
import {
  AlertCircle,
  Banknote,
  Building2,
  Calendar,
  CheckCircle2,
  CreditCard,
  FileText,
  Landmark,
  LoaderCircle,
  ShieldAlert,
  Smartphone,
  Vault,
  Wallet,
  X,
} from "lucide-react"

import { getCashBoxes } from "../../features/cash-boxes/cashBoxes.api"
import { recordSupplierPayment } from "../../features/suppliers/suppliers.api"

function formatMoney(value) {
  const n = Number(value || 0)
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0)
}

export default function RecordSupplierPaymentModal({
  item,
  onClose,
  onSuccess,
  selectedBranch,
  user,
}) {
  const branchId = selectedBranch?.id || user?.branchId || user?.branch?.id || item?.branch?.id || ""

  const totalAmount = Number(item?.amount || 0)
  const totalPaid = Number(item?.paid || 0)
  const remainingBalance = Math.max(0, Number(item?.balance ?? (totalAmount - totalPaid)))

  const [amount, setAmount] = useState(String(remainingBalance > 0 ? remainingBalance : ""))
  const [paymentMethod, setPaymentMethod] = useState("CASH") // CASH | BANK_TRANSFER | CHECK | GCASH | MAYA | OTHER
  const [cashBoxId, setCashBoxId] = useState("")
  const [cashBoxes, setCashBoxes] = useState([])
  const [isLoadingBoxes, setIsLoadingBoxes] = useState(false)
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [referenceNo, setReferenceNo] = useState("")
  const [notes, setNotes] = useState("")

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  // Load Cash Boxes (Cash Registers and Vaults) for this branch
  useEffect(() => {
    let isMounted = true
    async function fetchBoxes() {
      if (!branchId) return
      setIsLoadingBoxes(true)
      try {
        const res = await getCashBoxes({ branchId })
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []
        const activeBoxes = list.filter((b) => b.status === "ACTIVE")
        if (isMounted) {
          setCashBoxes(activeBoxes)
          if (activeBoxes.length > 0) {
            setCashBoxId(activeBoxes[0].id)
          }
        }
      } catch (err) {
        console.error("Failed to load cash boxes:", err)
      } finally {
        if (isMounted) setIsLoadingBoxes(false)
      }
    }
    fetchBoxes()
    return () => {
      isMounted = false
    }
  }, [branchId])

  const selectedBox = cashBoxes.find((b) => b.id === cashBoxId)
  const selectedBoxBalance = Number(selectedBox?.currentBalance || 0)
  const parsedAmount = Number(amount || 0)
  const isCash = paymentMethod === "CASH"
  const isInsufficientCash = isCash && parsedAmount > selectedBoxBalance

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMessage("")

    if (!parsedAmount || parsedAmount <= 0) {
      setErrorMessage("Please enter a valid payment amount greater than ₱0.00.")
      return
    }

    if (parsedAmount > remainingBalance + 0.01) {
      setErrorMessage(
        `Payment amount (${formatMoney(parsedAmount)}) cannot exceed the remaining balance (${formatMoney(remainingBalance)}).`
      )
      return
    }

    if (isCash) {
      if (!cashBoxId) {
        setErrorMessage("Please select a Cash Register or Vault to disburse cash from.")
        return
      }
      if (isInsufficientCash) {
        setErrorMessage(
          `Insufficient balance in ${selectedBox?.name || "selected cash register/vault"}. Available: ${formatMoney(
            selectedBoxBalance
          )}, Payment: ${formatMoney(parsedAmount)}.`
        )
        return
      }
    }

    setIsSubmitting(true)
    try {
      const payload = {
        amount: parsedAmount,
        paymentMethod,
        cashBoxId: isCash ? cashBoxId : undefined,
        paymentDate: paymentDate || undefined,
        referenceNo: referenceNo.trim() || undefined,
        notes: notes.trim() || undefined,
      }

      await recordSupplierPayment(item.id, payload)
      onSuccess?.()
      onClose?.()
    } catch (err) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        err?.message ||
        "Failed to record supplier payment."
      setErrorMessage(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const paymentMethods = [
    { id: "CASH", label: "Cash Register / Vault", icon: Banknote, desc: "Deducts physical cash drawer & logs store expense" },
    { id: "BANK_TRANSFER", label: "Bank Transfer", icon: Landmark, desc: "Direct online bank transfer" },
    { id: "GCASH", label: "GCash", icon: Smartphone, desc: "E-Wallet disbursement" },
    { id: "MAYA", label: "Maya", icon: Wallet, desc: "Maya wallet transfer" },
    { id: "CHECK", label: "Issued Check", icon: CreditCard, desc: "Company / Bank check" },
    { id: "OTHER", label: "Other Method", icon: FileText, desc: "Other payment settlement" },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4 backdrop-blur-xs">
      <div className="flex flex-col max-h-[92vh] w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/90 px-5 py-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[var(--color-maroon-soft)] text-[var(--color-maroon)] border border-[var(--color-border)]">
              <Building2 size={18} />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-slate-900 truncate">
                Disburse Supplier Payment
              </h3>
              <p className="text-[11px] font-medium text-slate-500 truncate">
                {item?.supplierName} · {item?.transactionNo || item?.receivingCode}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition shadow-2xs"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 space-y-4">
          {/* Invoice Summary Card */}
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-center">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Invoice</p>
              <p className="mt-0.5 font-mono text-xs font-black text-slate-800">{formatMoney(totalAmount)}</p>
            </div>
            <div className="border-x border-slate-200">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Already Paid</p>
              <p className="mt-0.5 font-mono text-xs font-bold text-emerald-700">{formatMoney(totalPaid)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Balance Due</p>
              <p className="mt-0.5 font-mono text-xs font-black text-[var(--color-maroon)]">{formatMoney(remainingBalance)}</p>
            </div>
          </div>

          {/* Amount to Pay */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-800">
                Payment Amount (PHP) <span className="text-rose-500">*</span>
              </label>
              {remainingBalance > 0 && parsedAmount !== remainingBalance ? (
                <button
                  type="button"
                  onClick={() => setAmount(String(remainingBalance))}
                  className="text-[10px] font-black text-[var(--color-maroon)] hover:underline cursor-pointer"
                >
                  Pay Full Balance ({formatMoney(remainingBalance)})
                </button>
              ) : null}
            </div>
            <div className="relative mt-1.5">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-slate-400">
                PHP
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={remainingBalance}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-12 pr-3 font-mono text-sm font-black text-slate-900 outline-none focus:border-[var(--color-maroon)]"
                required
              />
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="text-xs font-black text-slate-800 block mb-1.5">
              Disbursement Source & Method <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {paymentMethods.map((m) => {
                const Icon = m.icon
                const isSelected = paymentMethod === m.id
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id)}
                    className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition cursor-pointer ${
                      isSelected
                        ? "border-[var(--color-maroon)] bg-[var(--color-maroon-soft)] font-black text-slate-900 ring-1 ring-[var(--color-maroon)]"
                        : "border-slate-200 bg-white hover:border-slate-300 text-slate-700"
                    }`}
                  >
                    <Icon size={16} className={isSelected ? "text-[var(--color-maroon)]" : "text-slate-400"} />
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate leading-tight">{m.label}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Cash Register / Vault Selector (if Cash) */}
          {isCash && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                  <Vault size={14} className="text-amber-800" />
                  Select Cash Register or Store Vault
                </span>
                {isLoadingBoxes ? (
                  <span className="text-[10px] font-bold text-amber-700">Loading...</span>
                ) : null}
              </div>

              {cashBoxes.length === 0 && !isLoadingBoxes ? (
                <p className="text-xs text-rose-700 font-bold">
                  No active Cash Register or Vault found in this branch.
                </p>
              ) : (
                <div className="space-y-1.5">
                  <select
                    value={cashBoxId}
                    onChange={(e) => setCashBoxId(e.target.value)}
                    className="w-full rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[var(--color-maroon)]"
                  >
                    {cashBoxes.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.boxCode}) — Current Balance: {formatMoney(b.currentBalance)}
                      </option>
                    ))}
                  </select>

                  {selectedBox ? (
                    <div className="flex items-center justify-between text-[11px] font-bold px-1">
                      <span className="text-slate-600">Available Drawer/Vault Cash:</span>
                      <span className={`font-mono ${isInsufficientCash ? "text-rose-600" : "text-emerald-700"}`}>
                        {formatMoney(selectedBoxBalance)}
                      </span>
                    </div>
                  ) : null}

                  {isInsufficientCash ? (
                    <p className="text-[11px] font-black text-rose-700 flex items-center gap-1 mt-1">
                      <ShieldAlert size={13} />
                      Insufficient cash! Available: {formatMoney(selectedBoxBalance)}, Need: {formatMoney(parsedAmount)}
                    </p>
                  ) : parsedAmount > 0 && selectedBox ? (
                    <div className="flex items-center justify-between text-[11px] font-bold px-1 text-slate-500 border-t border-amber-200/60 pt-1">
                      <span>Balance After Disbursement:</span>
                      <span className="font-mono text-slate-800">
                        {formatMoney(Math.max(0, selectedBoxBalance - parsedAmount))}
                      </span>
                    </div>
                  ) : null}

                  <p className="text-[10px] text-amber-800/80 font-medium">
                    ⚡ Will automatically log a <strong>CASH_OUT</strong> transaction in Store Expenses Tracker under <em>"Supplier Payment / Delivery"</em>.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Date & Reference */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Disbursement Date
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-[var(--color-maroon)]"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Reference / Check / Deposit No.
              </label>
              <input
                type="text"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="e.g. BDO-9821, Check #1049"
                className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-[var(--color-maroon)] placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Notes / Remarks */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Payment Remarks (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Paid in full to agent upon delivery"
              className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-[var(--color-maroon)] placeholder:text-slate-400"
            />
          </div>

          {/* Error Banner */}
          {errorMessage ? (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs font-bold text-rose-700">
              <AlertCircle size={15} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          ) : null}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition shadow-2xs disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || (isCash && isInsufficientCash) || parsedAmount <= 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-maroon)] bg-[var(--color-maroon)] px-5 py-2 text-xs font-black text-white hover:opacity-95 transition shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <LoaderCircle size={14} className="animate-spin" />
                  Recording Disbursement...
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  Record {formatMoney(parsedAmount)} Payment
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

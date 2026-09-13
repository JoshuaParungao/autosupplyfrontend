import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  ArrowRight,
  Bell,
  BellRing,
  Building2,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Sun,
  User,
  X,
} from "lucide-react"

import { getRoleLabel } from "../constants/roles"
import { useTheme } from "../context/ThemeContext"
import { updateCurrentUserProfile } from "../features/auth/auth.api"
import { getAlertSummary } from "../features/reports/reports.api"
import { saveUser } from "../lib/sessionStorage"

function Topbar({
  activeLabel,
  user,
  selectedBranch,
  canSwitchBranch = false,
  onSwitchBranch,
  onLogout,
  onNavigate,
  onOpenMobileSidebar,
  onToggleDesktopSidebar,
  isDesktopSidebarCollapsed,
  onOpenSearch,
}) {
  const branchCode = selectedBranch?.code || user?.branch?.code || "ALL"
  const { resolvedTheme, toggleTheme } = useTheme()

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [profileForm, setProfileForm] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    username: user?.username || "",
    password: "",
    confirmPassword: "",
  })
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState("")

  const openProfileModal = () => {
    setProfileForm({
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      username: user?.username || "",
      password: "",
      confirmPassword: "",
    })
    setShowPassword(false)
    setProfileError("")
    setIsProfileModalOpen(true)
  }

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    setProfileError("")

    if (!profileForm.firstName.trim() || !profileForm.lastName.trim()) {
      setProfileError("First name and last name are required.")
      return
    }

    if (profileForm.password.trim()) {
      if (profileForm.password.trim().length < 8) {
        setProfileError("New password must be at least 8 characters.")
        return
      }
      if (profileForm.password.trim() !== profileForm.confirmPassword.trim()) {
        setProfileError("Passwords do not match. Please re-type your new password.")
        return
      }
    }

    try {
      setIsSavingProfile(true)
      const payload = {
        firstName: profileForm.firstName.trim(),
        lastName: profileForm.lastName.trim(),
        username: profileForm.username.trim(),
      }
      if (profileForm.password.trim()) {
        payload.password = profileForm.password.trim()
      }

      const response = await updateCurrentUserProfile(payload)
      if (response?.data?.user) {
        saveUser(response.data.user)
      } else if (response?.data) {
        saveUser(response.data)
      }
      setIsProfileModalOpen(false)
      window.location.reload()
    } catch (err) {
      setProfileError(err?.response?.data?.message || err?.message || "Failed to update profile.")
    } finally {
      setIsSavingProfile(false)
    }
  }

  // Action Alerts & Notifications state
  const [alertsResult, setAlertsResult] = useState(null)
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(false)
  const [isAlertsDropdownOpen, setIsAlertsDropdownOpen] = useState(false)
  const [showLoginToast, setShowLoginToast] = useState(false)
  const alertsDropdownRef = useRef(null)

  const branchId = selectedBranch?.id || user?.branchId || user?.branch?.id || ""

  const fetchAlerts = useCallback(async () => {
    setIsLoadingAlerts(true)
    try {
      const response = await getAlertSummary({ ...(branchId ? { branchId } : {}), limit: 10 })
      const data = response?.data || null
      setAlertsResult(data)
      const count = Number(data?.report?.totals?.totalAlerts || 0)
      if (count > 0) {
        // Notify on login / session if not yet dismissed
        const dismissedKey = `alerts_toast_dismissed_${user?.id || "user"}`
        const lastDismissed = sessionStorage.getItem(dismissedKey)
        if (!lastDismissed) {
          setShowLoginToast(true)
        }
      }
    } catch {
      // Ignore background notification fetch errors
    } finally {
      setIsLoadingAlerts(false)
    }
  }, [branchId, user?.id])

  useEffect(() => {
    fetchAlerts()
    const interval = setInterval(fetchAlerts, 60000)
    const onFocus = () => fetchAlerts()
    window.addEventListener("focus", onFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener("focus", onFocus)
    }
  }, [fetchAlerts])

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (alertsDropdownRef.current && !alertsDropdownRef.current.contains(event.target)) {
        setIsAlertsDropdownOpen(false)
      }
    }
    if (isAlertsDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isAlertsDropdownOpen])

  const totals = alertsResult?.report?.totals || {}
  const totalAlerts = Number(totals.totalAlerts || 0)
  const alertGroups = alertsResult?.alerts || {}

  const recentAlertItems = useMemo(() => {
    const list = []
    if (alertGroups.inventory?.records?.length) {
      alertGroups.inventory.records.slice(0, 3).forEach((rec) => {
        list.push({
          id: `inv-${rec.id}`,
          category: "inventory",
          categoryLabel: "Inventory",
          title: rec.item?.itemName || rec.message || "Low Stock Item",
          subtitle: `${rec.item?.itemCode || ""} • Available: ${rec.item?.quantityAvailable ?? 0}`,
          isCritical: rec.type === "ZERO_STOCK",
          targetPage: "inventory",
        })
      })
    }
    if (alertGroups.warrantyClaims?.records?.length) {
      alertGroups.warrantyClaims.records.slice(0, 2).forEach((rec) => {
        list.push({
          id: `war-${rec.id}`,
          category: "warrantyClaims",
          categoryLabel: "Warranty",
          title: `${rec.claimCode} — ${rec.status}`,
          subtitle: `${rec.item?.itemName || "Item"} • ${rec.customer?.fullName || "Customer"}`,
          isCritical: rec.status === "CHECKING",
          targetPage: "warranty",
        })
      })
    }
    if (alertGroups.purchaseOrders?.records?.length) {
      alertGroups.purchaseOrders.records.slice(0, 2).forEach((rec) => {
        list.push({
          id: `po-${rec.id}`,
          category: "purchaseOrders",
          categoryLabel: "Purchase Order",
          title: `${rec.poCode} — ${rec.status}`,
          subtitle: `Supplier: ${rec.supplier?.name || rec.supplierNameSnapshot || "Supplier"}`,
          isCritical: rec.status === "ORDERED",
          targetPage: "purchase-orders",
        })
      })
    }
    if (alertGroups.stockTransfers?.records?.length) {
      alertGroups.stockTransfers.records.slice(0, 2).forEach((rec) => {
        list.push({
          id: `st-${rec.id}`,
          category: "stockTransfers",
          categoryLabel: "Transfer",
          title: `${rec.transferCode} — ${rec.status}`,
          subtitle: `${rec.fromBranch?.code || "—"} → ${rec.toBranch?.code || "—"}`,
          isCritical: rec.status === "REQUESTED",
          targetPage: "stock-transfers",
        })
      })
    }
    if (alertGroups.cashHandovers?.records?.length) {
      alertGroups.cashHandovers.records.slice(0, 1).forEach((rec) => {
        list.push({
          id: `ch-${rec.id}`,
          category: "cashHandovers",
          categoryLabel: "Cash Handover",
          title: `${rec.handoverCode} — ₱${Number(rec.amount || 0).toLocaleString("en-PH")}`,
          subtitle: `${rec.cashBox?.name || "Cash box"} • Pending confirmation`,
          isCritical: true,
          targetPage: "cash-box",
        })
      })
    }
    if (alertGroups.creditAccounts?.records?.length) {
      alertGroups.creditAccounts.records.slice(0, 1).forEach((rec) => {
        list.push({
          id: `cr-${rec.id}`,
          category: "creditAccounts",
          categoryLabel: "Overdue Credit",
          title: `${rec.creditCode} — ₱${Number(rec.remainingBalance || 0).toLocaleString("en-PH")}`,
          subtitle: `${rec.customer?.fullName || "Customer"} • Due: ${rec.nextDueDate ? new Date(rec.nextDueDate).toLocaleDateString("en-PH") : "Overdue"}`,
          isCritical: true,
          targetPage: "credits",
        })
      })
    }
    return list.slice(0, 6)
  }, [alertGroups])

  const categoryPills = useMemo(() => {
    const pills = []
    if (totals.inventoryAlerts > 0) pills.push({ key: "inv", label: "Inventory", count: totals.inventoryAlerts, page: "inventory" })
    if (totals.warrantyAlerts > 0) pills.push({ key: "war", label: "Warranty", count: totals.warrantyAlerts, page: "warranty" })
    if (totals.purchaseOrderAlerts > 0) pills.push({ key: "po", label: "PO", count: totals.purchaseOrderAlerts, page: "purchase-orders" })
    if (totals.stockTransferAlerts > 0) pills.push({ key: "trans", label: "Transfers", count: totals.stockTransferAlerts, page: "stock-transfers" })
    if (totals.cashHandoverAlerts > 0) pills.push({ key: "cash", label: "Cash", count: totals.cashHandoverAlerts, page: "cash-box" })
    if (totals.overdueCreditAlerts > 0) pills.push({ key: "cred", label: "Credits", count: totals.overdueCreditAlerts, page: "credits" })
    return pills
  }, [totals])

  const dismissToast = () => {
    const dismissedKey = `alerts_toast_dismissed_${user?.id || "user"}`
    sessionStorage.setItem(dismissedKey, Date.now().toString())
    setShowLoginToast(false)
  }

  return (
    <>
      <header className="z-20 shrink-0 border-b border-[var(--color-border)] bg-[var(--color-page)]/95 px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex w-full max-w-screen-2xl items-center gap-3">
          <button
            aria-label="Open navigation"
            className="grid size-10 shrink-0 place-items-center rounded-2xl border border-[var(--color-border)] bg-white lg:hidden"
            onClick={onOpenMobileSidebar}
            type="button"
          >
            <Menu className="size-5" />
          </button>

          <button
            aria-label={isDesktopSidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            className="hidden size-10 shrink-0 place-items-center rounded-2xl border border-[var(--color-border)] bg-white lg:grid"
            onClick={onToggleDesktopSidebar}
            type="button"
          >
            {isDesktopSidebarCollapsed ? (
              <PanelLeftOpen className="size-5" />
            ) : (
              <PanelLeftClose className="size-5" />
            )}
          </button>

          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[var(--color-text-strong)] sm:text-base">
              {activeLabel}
            </p>
            <p className="hidden text-xs text-[var(--color-muted)] sm:block">
              Auto Supply Cloud POS and Business Monitoring
            </p>
          </div>

          <div className="ml-auto hidden min-w-0 flex-1 justify-center px-4 md:flex">
            <button
              aria-label="Open Omnisearch (Ctrl+K)"
              className="flex h-11 w-full max-w-2xl items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-white px-4 text-left shadow-card transition hover:border-[#002060]/50"
              onClick={onOpenSearch}
              type="button"
            >
              <div className="flex items-center gap-3 text-slate-400">
                <Search className="size-4 shrink-0 text-[var(--color-muted)]" />
                <span className="text-sm font-normal text-[var(--color-muted)]">
                  Search products, serials, receipts, quotations...
                </span>
              </div>
              <kbd className="hidden items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-500 sm:inline-flex">
                Ctrl + K
              </kbd>
            </button>
          </div>

          <button
            aria-label={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="grid size-10 shrink-0 place-items-center rounded-2xl border border-[var(--color-border)] bg-white text-[var(--color-text-strong)] shadow-card transition hover:bg-[var(--color-soft)]"
            onClick={toggleTheme}
            title={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            type="button"
          >
            {resolvedTheme === "dark" ? (
              <Sun className="size-4 text-amber-400" />
            ) : (
              <Moon className="size-4 text-[var(--color-maroon)]" />
            )}
          </button>

          {/* Action Alerts Bell & Dropdown */}
          <div className="relative" ref={alertsDropdownRef}>
            <button
              aria-label={`Action Alerts (${totalAlerts} pending)`}
              className={`relative grid size-10 shrink-0 place-items-center rounded-2xl border transition shadow-card cursor-pointer ${
                totalAlerts > 0
                  ? "border-rose-300 bg-rose-50/80 text-rose-700 hover:bg-rose-100/90 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-400"
                  : "border-[var(--color-border)] bg-white text-[var(--color-text-strong)] hover:bg-[var(--color-soft)]"
              }`}
              onClick={() => setIsAlertsDropdownOpen((prev) => !prev)}
              title={totalAlerts > 0 ? `${totalAlerts} unhandled action alert(s) - Click to review` : "No active alerts"}
              type="button"
            >
              {totalAlerts > 0 ? (
                <>
                  <BellRing className="size-4 animate-bounce text-rose-600 dark:text-rose-400" />
                  <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-rose-600 text-[10px] font-black text-white shadow-xs">
                    {totalAlerts > 9 ? "9+" : totalAlerts}
                  </span>
                </>
              ) : (
                <Bell className="size-4 text-[var(--color-maroon)]" />
              )}
            </button>

            {/* Notification Dropdown Flyout */}
            {isAlertsDropdownOpen && (
              <div className="fixed sm:absolute right-3 left-3 sm:left-auto sm:right-0 top-16 sm:top-12 z-50 max-w-[calc(100vw-1.5rem)] sm:w-96 rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-xl bg-rose-50 text-[var(--color-maroon)] dark:bg-rose-950/60 dark:text-rose-400">
                      <BellRing size={14} />
                    </span>
                    <div>
                      <h3 className="text-sm font-black text-slate-900 dark:text-white">Action Alerts</h3>
                      <p className="text-[10px] font-semibold text-slate-400">Branch: {branchCode}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 transition cursor-pointer"
                      onClick={fetchAlerts}
                      title="Refresh alerts"
                      type="button"
                    >
                      <RefreshCw className={`size-3.5 ${isLoadingAlerts ? "animate-spin text-rose-600" : ""}`} />
                    </button>
                    <button
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 transition cursor-pointer"
                      onClick={() => setIsAlertsDropdownOpen(false)}
                      type="button"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {/* Category Quick Pills */}
                {totalAlerts > 0 && categoryPills.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-b border-slate-100 pb-3 dark:border-slate-800">
                    {categoryPills.map((pill) => (
                      <button
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-700 hover:border-rose-300 hover:bg-rose-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition cursor-pointer"
                        key={pill.key}
                        onClick={() => {
                          setIsAlertsDropdownOpen(false)
                          onNavigate?.(pill.page)
                        }}
                        type="button"
                      >
                        <span>{pill.label}</span>
                        <span className="rounded-full bg-rose-600/15 px-1.5 py-0.2 text-[9px] font-black text-rose-700 dark:text-rose-300">
                          {pill.count}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Alert Items List */}
                <div className="mt-2 max-h-72 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800/60">
                  {totalAlerts === 0 ? (
                    <div className="py-6 text-center text-xs font-semibold text-slate-400">
                      🎉 No operational alerts for this branch right now.
                    </div>
                  ) : (
                    recentAlertItems.map((item, idx) => (
                      <div
                        className="group flex items-center justify-between gap-3 p-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl cursor-pointer"
                        key={item.id || idx}
                        onClick={() => {
                          setIsAlertsDropdownOpen(false)
                          onNavigate?.(item.targetPage)
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`size-1.5 rounded-full ${item.isCritical ? "bg-rose-500 animate-pulse" : "bg-amber-500"}`} />
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                              {item.categoryLabel}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-xs font-bold text-slate-800 dark:text-slate-200">
                            {item.title}
                          </p>
                          <p className="truncate text-[10px] text-slate-400">
                            {item.subtitle}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center text-slate-400 group-hover:text-[var(--color-maroon)] transition">
                          <ArrowRight size={14} />
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Footer Action */}
                <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <button
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--color-maroon)] py-2 text-xs font-bold text-white shadow-xs hover:bg-[#5c131d] transition cursor-pointer"
                    onClick={() => {
                      setIsAlertsDropdownOpen(false)
                      onNavigate?.("alerts")
                    }}
                    type="button"
                  >
                    <span>View All Action Alerts (Detailed)</span>
                    <ExternalLink size={12} />
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            className={`hidden items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--color-text-strong)] shadow-card sm:flex ${
              canSwitchBranch ? "hover:bg-[var(--color-maroon-soft)]" : "cursor-default"
            }`}
            onClick={canSwitchBranch ? onSwitchBranch : undefined}
            title={canSwitchBranch ? "Switch branch" : "Assigned branch"}
            type="button"
          >
            <Building2 className="size-4 shrink-0 text-[var(--color-maroon)]" />
            <span className="whitespace-nowrap">{branchCode}</span>
          </button>

          {/* Clickable Profile Widget */}
          <button
            type="button"
            onClick={openProfileModal}
            title="Click to edit your profile name"
            className="hidden min-w-0 items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-white px-3 py-1.5 shadow-card xl:flex hover:border-[var(--color-maroon)] hover:bg-slate-50 transition cursor-pointer text-left"
          >
            <div className="grid size-7 place-items-center rounded-xl bg-red-100 text-[var(--color-maroon)]">
              <User size={15} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="max-w-44 truncate text-xs font-bold text-[var(--color-text-strong)]">
                  {[user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.fullName || user?.username || "User"}
                </p>
                <Edit3 size={11} className="text-slate-400 hover:text-[var(--color-maroon)]" />
              </div>
            </div>
          </button>

          <button
            className="rounded-2xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-bold text-[var(--color-maroon)] shadow-card transition hover:bg-[var(--color-maroon-soft)]"
            onClick={onLogout}
            type="button"
          >
            Logout
          </button>
        </div>

        <div className="mx-auto mt-3 w-full max-w-screen-2xl md:hidden">
          <button
            aria-label="Open Omnisearch"
            className="flex h-11 w-full items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white px-4 text-left shadow-card"
            onClick={onOpenSearch}
            type="button"
          >
            <Search className="size-4 shrink-0 text-[var(--color-muted)]" />
            <span className="text-sm font-normal text-[var(--color-muted)]">
              Search products, serials, receipts...
            </span>
          </button>

          <div className="mt-3 flex gap-2">
            <button
              className={`flex-1 flex h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] bg-white px-4 text-sm font-bold text-[var(--color-text-strong)] shadow-card ${
                canSwitchBranch ? "hover:bg-[var(--color-maroon-soft)]" : "cursor-default"
              }`}
              onClick={canSwitchBranch ? onSwitchBranch : undefined}
              type="button"
            >
              <Building2 className="size-4 shrink-0 text-[var(--color-maroon)]" />
              <span className="whitespace-nowrap">
                {canSwitchBranch ? `Branch: ${branchCode}` : `Branch: ${branchCode}`}
              </span>
            </button>

            <button
              type="button"
              onClick={openProfileModal}
              className="flex h-11 items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-white px-4 text-xs font-bold text-[var(--color-text-strong)] shadow-card hover:bg-slate-50"
            >
              <User size={15} className="text-[var(--color-maroon)]" />
              <span>Edit Profile</span>
            </button>
          </div>
        </div>
      </header>

      {/* Profile Edit Modal */}
      {isProfileModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-maroon)]">Account Settings</span>
                <h3 className="text-lg font-black text-slate-900">Edit My Profile Name</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(false)}
                className="rounded-xl p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X size={18} />
              </button>
            </div>

            {profileError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
                {profileError}
              </div>
            ) : null}

            <form onSubmit={handleSaveProfile} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={profileForm.firstName}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, firstName: e.target.value }))}
                    placeholder="e.g. Joshua"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-[var(--color-maroon)] focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={profileForm.lastName}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, lastName: e.target.value }))}
                    placeholder="e.g. Parungao"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-[var(--color-maroon)] focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={profileForm.username}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, username: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-[var(--color-maroon)] focus:bg-white"
                />
              </div>

              {/* Password Update Section */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-700 uppercase">Change Password</span>
                  <span className="text-[10px] text-slate-400 font-semibold">(Leave blank to keep current)</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={profileForm.password}
                        onChange={(e) => setProfileForm((prev) => ({ ...prev, password: e.target.value }))}
                        placeholder="Min 8 characters"
                        className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3 py-2 pr-8 text-xs font-semibold text-slate-900 outline-none focus:border-[var(--color-maroon)] focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Confirm Password
                    </label>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={profileForm.confirmPassword}
                      onChange={(e) => setProfileForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                      placeholder="Repeat new password"
                      className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-[var(--color-maroon)] focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSavingProfile}
                  onClick={() => setIsProfileModalOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="rounded-xl bg-[var(--color-maroon)] px-5 py-2 text-xs font-bold text-white hover:opacity-90 transition disabled:opacity-50 shadow-xs"
                >
                  {isSavingProfile ? "Saving..." : "Save Profile & Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Floating Prompt on Login / Unopened Alerts */}
      {showLoginToast && totalAlerts > 0 && (
        <div className="fixed bottom-5 right-5 z-50 w-full max-w-sm rounded-3xl border border-rose-200 bg-white p-4 shadow-2xl dark:border-rose-900/60 dark:bg-slate-900 animate-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400">
              <BellRing className="size-5 animate-pulse" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-700 uppercase tracking-wider dark:bg-rose-950 dark:text-rose-300">
                  {totalAlerts} Action Alerts
                </span>
                <button
                  className="rounded-md p-1 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                  onClick={dismissToast}
                  type="button"
                >
                  <X size={14} />
                </button>
              </div>
              <h4 className="mt-1 text-sm font-black text-slate-900 dark:text-white">
                Unresolved Operational Items
              </h4>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                May {totalAlerts} items na nangangailangan ng atensyon sa iyong branch (Inventory, Warranty, Purchase Orders, etc.).
              </p>

              <div className="mt-3 flex items-center gap-2">
                <button
                  className="flex-1 rounded-xl bg-[var(--color-maroon)] py-1.5 text-xs font-bold text-white hover:bg-[#5c131d] transition cursor-pointer shadow-xs"
                  onClick={() => {
                    dismissToast()
                    onNavigate?.("alerts")
                  }}
                  type="button"
                >
                  View Details
                </button>
                <button
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition cursor-pointer"
                  onClick={dismissToast}
                  type="button"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Topbar

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  Ban,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UsersRound,
  X,
  XCircle,
} from "lucide-react"

import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_CONFIG,
  USER_ROLES,
  USER_STATUS,
  resolveAccountType,
} from "../../constants/roles"
import { getBranches } from "../../features/branches/branches.api"
import {
  approveUser,
  createUser,
  disableUser,
  getUserById,
  getUsers,
  rejectUser,
  updateUserById,
} from "../../features/users/users.api"
import { exportReportExcel } from "../../utils/businessDocumentExport"
import ExportExcelButton from "../../components/common/ExportExcelButton"

const ROLE_LABELS = {
  SUPER_OWNER: "Main Admin",
  BRANCH_OWNER: "Branch Owner",
  ADMIN: "Admin",
  CASHIER: "Sales Agent",
  TECHNICIAN: "Technician",
  CASH_CUSTODIAN: "Cash Custodian",
}

const ASSIGNABLE_ROLES = {
  [USER_ROLES.SUPER_OWNER]: [
    USER_ROLES.ADMIN,
    USER_ROLES.CASHIER,
    USER_ROLES.TECHNICIAN,
  ],

  [USER_ROLES.ADMIN]: [
    USER_ROLES.CASHIER,
    USER_ROLES.TECHNICIAN,
  ],
}

const ASSIGNABLE_ACCOUNT_TYPES = {
  [USER_ROLES.SUPER_OWNER]: [
    ACCOUNT_TYPES.ADMIN,
    ACCOUNT_TYPES.SALES_AGENT,
    ACCOUNT_TYPES.SENIOR_SALES_AGENT,
    ACCOUNT_TYPES.TECHNICIAN,
    ACCOUNT_TYPES.SENIOR_TECHNICIAN,
  ],

  [USER_ROLES.ADMIN]: [
    ACCOUNT_TYPES.SALES_AGENT,
    ACCOUNT_TYPES.SENIOR_SALES_AGENT,
    ACCOUNT_TYPES.TECHNICIAN,
    ACCOUNT_TYPES.SENIOR_TECHNICIAN,
  ],
}

const STATUS_STYLES = {
  ACTIVE: "bg-emerald-50 text-emerald-700",
  PENDING: "bg-amber-50 text-amber-700",
  REJECTED: "bg-red-50 text-red-700",
  DISABLED: "bg-slate-100 text-slate-600",
}

const ACTION_CONFIG = {
  approve: {
    label: "Approve",
    pastTense: "approved",
    verb: "approve",
    tone: "emerald",
    icon: CheckCircle2,
    request: approveUser,
  },
  reject: {
    label: "Reject",
    pastTense: "rejected",
    verb: "reject",
    tone: "red",
    icon: XCircle,
    request: rejectUser,
  },
  disable: {
    label: "Disable",
    pastTense: "disabled",
    verb: "disable",
    tone: "red",
    icon: Ban,
    request: disableUser,
  },
}

function formatDate(value, includeTime = false) {
  if (!value) return "—"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"

  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date)
}

function getApiErrorMessage(error, fallbackMessage) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    fallbackMessage
  )
}

function toNullableText(value) {
  const normalized = String(value ?? "").trim()
  return normalized || null
}

function canEditUser(actor, target) {
  if (!actor || !target) return false

  if (
    target.role === USER_ROLES.BRANCH_OWNER ||
    target.role === USER_ROLES.CASH_CUSTODIAN
  ) {
    return false
  }

  if (actor.role === USER_ROLES.SUPER_OWNER) return true
  if (actor.branchId !== target.branchId) return false

  return (ASSIGNABLE_ROLES[actor.role] || []).includes(target.role)
}

function canRunLifecycleAction(actor, target) {
  return actor?.id !== target?.id && canEditUser(actor, target)
}

function StatusBadge({ status }) {
  const normalized = String(status || "UNKNOWN").toUpperCase()

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${
        STATUS_STYLES[normalized] || "bg-slate-100 text-slate-700"
      }`}
    >
      {normalized.charAt(0) + normalized.slice(1).toLowerCase()}
    </span>
  )
}

function AccountTypeBadge({ role, incentiveClassification }) {
  const accountType = resolveAccountType(role, incentiveClassification)

  const label = accountType
    ? ACCOUNT_TYPE_CONFIG[accountType]?.label || accountType
    : ROLE_LABELS[role] || role

  return (
    <span className="inline-flex whitespace-nowrap rounded-full bg-[var(--color-maroon-soft)] px-3 py-1 text-xs font-bold text-[var(--color-maroon)]">
      {label}
    </span>
  )
}

function ErrorBanner({ children }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700">
      <AlertCircle className="mt-0.5 shrink-0" size={18} />
      <span>{children}</span>
    </div>
  )
}

function ModalFrame({ children, labelledBy, onClose, size = "max-w-3xl" }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  return (
    <div
      aria-labelledby={labelledBy}
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-3 sm:p-5 backdrop-blur-xs"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="dialog"
    >
      <section
        className={`max-h-[calc(100svh-2rem)] w-full ${size} overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </section>
    </div>
  )
}

function FormField({ children, label, required = false }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
        {label}
        {required ? <span className="ml-1 text-red-600">*</span> : null}
      </span>
      {children}
    </label>
  )
}

const inputClassName =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none transition focus:border-[var(--color-maroon)] focus:ring-1 focus:ring-[var(--color-maroon)] hover:border-slate-300 placeholder:text-slate-400 placeholder:font-normal disabled:cursor-not-allowed disabled:opacity-60"

function UserEditorModal({ actor, branches, mode, onClose, onSaved, selectedBranch, target }) {
  const isEdit = mode === "edit"
  const isEditingMainAdmin = target?.role === USER_ROLES.SUPER_OWNER

  const assignableAccountTypes = isEditingMainAdmin
    ? [ACCOUNT_TYPES.MAIN_ADMIN]
    : ASSIGNABLE_ACCOUNT_TYPES[actor.role] || []

  const defaultAccountType = target
    ? resolveAccountType(target.role, target.incentiveClassification)
    : assignableAccountTypes[0] || ""

  const defaultAccountConfig = ACCOUNT_TYPE_CONFIG[defaultAccountType]

  const defaultRole =
    target?.role ||
    defaultAccountConfig?.role ||
    ""

  const defaultIncentiveClassification =
    target?.incentiveClassification ||
    defaultAccountConfig?.incentiveClassification ||
    "NONE"

  const defaultBranchId =
    target?.branchId ||
    (actor.role === USER_ROLES.SUPER_OWNER
      ? selectedBranch?.id || branches.find((branch) => branch.status === "ACTIVE")?.id || ""
      : actor.branchId || "")

  const [form, setForm] = useState(() => ({
    username: target?.username || "",
    password: "",
    firstName: target?.firstName || "",
    lastName: target?.lastName || "",
    role: defaultRole,
    incentiveClassification: defaultIncentiveClassification,
    branchId: defaultRole === USER_ROLES.SUPER_OWNER ? "" : defaultBranchId,
  }))

  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  const updateField = (field, value) => {
    setForm((current) => {
      if (field === "role" && value === USER_ROLES.SUPER_OWNER) {
        return { ...current, role: value, branchId: "" }
      }

      return { ...current, [field]: value }
    })
  }

  const updateAccountType = (accountType) => {
    const config = ACCOUNT_TYPE_CONFIG[accountType]

    if (!config) return

    setForm((current) => ({
      ...current,
      role: config.role,
      incentiveClassification: config.incentiveClassification,
      branchId:
        config.role === USER_ROLES.SUPER_OWNER
          ? ""
          : current.branchId || defaultBranchId,
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrorMessage("")

    if (!form.firstName.trim() || !form.lastName.trim()) {
      setErrorMessage("First name and last name are required.")
      return
    }

    if (form.username.trim().length < 3) {
      setErrorMessage("Username must be at least 3 characters.")
      return
    }

    if (!isEdit && form.password.length < 8) {
      setErrorMessage("Temporary password must be at least 8 characters.")
      return
    }

    if (isEdit && form.password.trim() && form.password.trim().length < 8) {
      setErrorMessage("New password must be at least 8 characters.")
      return
    }

    if (!form.role) {
      setErrorMessage("Select a role.")
      return
    }

    if (form.role !== USER_ROLES.SUPER_OWNER && !form.branchId) {
      setErrorMessage("Select a branch for this user.")
      return
    }

    const payload = {
      username: form.username.trim(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      role: form.role,
      incentiveClassification: form.incentiveClassification,
      branchId: form.role === USER_ROLES.SUPER_OWNER ? null : form.branchId,
    }

    if (form.password.trim()) {
      payload.password = form.password.trim()
    }

    setIsSaving(true)

    try {
      const response = isEdit
        ? await updateUserById(target.id, payload)
        : await createUser(payload)
      const savedUser = response?.data

      if (!response?.success || !savedUser) {
        throw new Error("Invalid user response")
      }

      onSaved(savedUser, isEdit ? "updated" : "created")
    } catch (error) {
      setErrorMessage(
        getApiErrorMessage(error, `Unable to ${isEdit ? "update" : "create"} the user.`),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const activeBranches = branches.filter((branch) => branch.status === "ACTIVE")

  return (
    <ModalFrame labelledBy="user-editor-title" onClose={onClose} size="max-w-2xl">
      <form onSubmit={handleSubmit}>
        <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50/75 px-5 py-3.5">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-maroon)]">Staff Management</span>
            <h2
              className="text-base font-black text-slate-900 leading-tight"
              id="user-editor-title"
            >
              {isEdit ? "Edit User" : "Create User"}
            </h2>
            <p className="text-xs text-slate-500">
              {isEdit
                ? "Update account identity, account type, and branch assignment."
                : "The account will be created as pending and must be approved separately."}
            </p>
          </div>
          <button
            aria-label="Close user editor"
            className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </header>

        <div className="max-h-[75vh] overflow-y-auto p-5 space-y-3.5">
          {errorMessage ? <ErrorBanner>{errorMessage}</ErrorBanner> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="First name" required>
              <input
                className={inputClassName}
                maxLength={100}
                onChange={(event) => updateField("firstName", event.target.value)}
                placeholder="Given name"
                required
                value={form.firstName}
              />
            </FormField>
            <FormField label="Last name" required>
              <input
                className={inputClassName}
                maxLength={100}
                onChange={(event) => updateField("lastName", event.target.value)}
                placeholder="Family name"
                required
                value={form.lastName}
              />
            </FormField>
            <FormField label="Username" required>
              <input
                autoComplete="off"
                className={inputClassName}
                maxLength={50}
                onChange={(event) => updateField("username", event.target.value)}
                placeholder="Login username"
                required
                value={form.username}
              />
            </FormField>
            <FormField
              label={isEdit ? "Change / Reset Password (Optional)" : "Temporary password"}
              required={!isEdit}
            >
              <input
                autoComplete="new-password"
                className={inputClassName}
                maxLength={128}
                minLength={8}
                onChange={(event) => updateField("password", event.target.value)}
                placeholder={isEdit ? "Leave blank to keep unchanged, or min. 8 chars" : "Min. 8 characters"}
                type="password"
                value={form.password}
              />
            </FormField>
            <FormField label="Account type" required>
              <select
                className={inputClassName}
                disabled={isEditingMainAdmin}
                onChange={(event) => updateAccountType(event.target.value)}
                value={resolveAccountType(form.role, form.incentiveClassification) || ""}
              >
                {assignableAccountTypes.map((accountType) => (
                  <option key={accountType} value={accountType}>
                    {ACCOUNT_TYPE_CONFIG[accountType]?.label || accountType}
                  </option>
                ))}
              </select>
            </FormField>
            {form.role !== USER_ROLES.SUPER_OWNER ? (
              <FormField label="Branch" required>
                <select
                  className={inputClassName}
                  disabled={actor.role !== USER_ROLES.SUPER_OWNER}
                  onChange={(event) => updateField("branchId", event.target.value)}
                  value={form.branchId}
                >
                  <option value="">Select branch</option>
                  {activeBranches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.code} · {branch.name}
                    </option>
                  ))}
                </select>
              </FormField>
            ) : null}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2.5 border-t border-slate-200 bg-slate-50/75 px-5 py-3">
          <button
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--color-maroon)] px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[var(--color-maroon-hover)] transition disabled:opacity-50"
            disabled={isSaving}
            type="submit"
          >
            {isSaving ? "Saving…" : isEdit ? "Save Changes" : "Create Pending User"}
          </button>
        </footer>
      </form>
    </ModalFrame>
  )
}

function DetailItem({ label, value }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/75 p-3 text-xs">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 break-words font-bold text-slate-900">
        {value || "—"}
      </p>
    </div>
  )
}

function UserDetailModal({ actor, onClose, onEdit, userId }) {
  const [record, setRecord] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")

  const loadUser = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage("")

    try {
      const response = await getUserById(userId)
      if (!response?.success || !response?.data) throw new Error("Invalid user response")
      setRecord(response.data)
    } catch (error) {
      setRecord(null)
      setErrorMessage(getApiErrorMessage(error, "Unable to load this user."))
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    const timer = window.setTimeout(loadUser, 0)
    return () => window.clearTimeout(timer)
  }, [loadUser])

  return (
    <ModalFrame labelledBy="user-detail-title" onClose={onClose} size="max-w-2xl">
      <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50/75 px-5 py-3.5">
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-maroon)]">Account Details</span>
          <h2 className="text-base font-black text-slate-900 leading-tight" id="user-detail-title">
            {record?.fullName || "User Profile"}
          </h2>
        </div>
        <button
          aria-label="Close user details"
          className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          onClick={onClose}
          type="button"
        >
          <X size={16} />
        </button>
      </header>

      <div className="max-h-[75vh] overflow-y-auto p-5 space-y-4">
        {isLoading ? (
          <p className="text-xs font-semibold text-slate-500 text-center py-6">Loading user details…</p>
        ) : errorMessage ? (
          <div className="space-y-2">
            <ErrorBanner>{errorMessage}</ErrorBanner>
            <button
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50"
              onClick={loadUser}
              type="button"
            >
              Try again
            </button>
          </div>
        ) : record ? (
          <>
            <div className="flex flex-wrap gap-2 items-center">
              <AccountTypeBadge
                role={record.role}
                incentiveClassification={record.incentiveClassification}
              />
              <StatusBadge status={record.status} />
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <DetailItem label="Username" value={record.username} />
              <DetailItem label="Employee code" value={record.employeeCode} />
              <DetailItem label="Email" value={record.email} />
              <DetailItem
                label="Branch"
                value={record.branch ? `${record.branch.code} · ${record.branch.name}` : "Global"}
              />
              <DetailItem label="Created" value={formatDate(record.createdAt, true)} />
              <DetailItem label="Last login" value={formatDate(record.lastLoginAt, true)} />
              <DetailItem label="Approved" value={formatDate(record.approvedAt, true)} />
              <DetailItem label="Disabled" value={formatDate(record.disabledAt, true)} />
            </div>
          </>
        ) : null}
      </div>

      {record && canEditUser(actor, record) ? (
        <footer className="flex items-center justify-end border-t border-slate-200 bg-slate-50/75 px-5 py-3">
          <button
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-maroon)] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[var(--color-maroon-hover)] transition"
            onClick={() => onEdit(record)}
            type="button"
          >
            <Edit3 size={14} />
            Edit User
          </button>
        </footer>
      ) : null}
    </ModalFrame>
  )
}

function LifecycleDialog({ action, onClose, onSaved, target }) {
  const config = ACTION_CONFIG[action]
  const Icon = config.icon
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  const handleConfirm = async () => {
    setIsSaving(true)
    setErrorMessage("")

    try {
      const response = await config.request(target.id)
      if (!response?.success || !response?.data) throw new Error("Invalid user response")
      onSaved(response.data, action)
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, `Unable to ${config.verb} this user.`))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <ModalFrame labelledBy="user-action-title" onClose={onClose} size="max-w-md">
      <div>
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/75 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <div
              className={`grid h-7 w-7 place-items-center rounded-lg ${
                config.tone === "emerald" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
              }`}
            >
              <Icon size={15} />
            </div>
            <h2 className="text-base font-black text-slate-900 leading-tight" id="user-action-title">
              {config.label} {target.fullName}?
            </h2>
          </div>
          <button
            className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-xs leading-5 text-slate-600">
            {action === "approve"
              ? "This grants the account access according to its assigned role and branch."
              : action === "reject"
                ? "This rejects the pending account request. The action remains auditable."
                : "This prevents future login while preserving the user and historical attribution."}
          </p>
          {errorMessage ? <ErrorBanner>{errorMessage}</ErrorBanner> : null}
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 bg-slate-50/75 px-5 py-3">
          <button
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-5 py-2 text-xs font-bold text-white shadow-xs transition disabled:opacity-50 ${
              config.tone === "emerald" ? "bg-emerald-700 hover:bg-emerald-800" : "bg-red-700 hover:bg-red-800"
            }`}
            disabled={isSaving}
            onClick={handleConfirm}
            type="button"
          >
            {isSaving ? "Working…" : `Confirm ${config.label}`}
          </button>
        </div>
      </div>
    </ModalFrame>
  )
}

function UserActions({ actor, onAction, onEdit, onView, target }) {
  const canEdit = canEditUser(actor, target)
  const canLifecycle = canRunLifecycleAction(actor, target)

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <button
        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-bold text-[var(--color-text-strong)] transition hover:bg-[var(--color-soft)]"
        onClick={() => onView(target)}
        type="button"
      >
        <Eye size={14} />
        View
      </button>
      {canEdit ? (
        <button
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-bold text-[var(--color-text-strong)] transition hover:bg-[var(--color-soft)]"
          onClick={() => onEdit(target)}
          type="button"
        >
          <Edit3 size={14} />
          Edit
        </button>
      ) : null}
      {canLifecycle && target.status === USER_STATUS.PENDING ? (
        <>
          <button
            className="rounded-xl border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50"
            onClick={() => onAction(target, "approve")}
            type="button"
          >
            Approve
          </button>
          <button
            className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50"
            onClick={() => onAction(target, "reject")}
            type="button"
          >
            Reject
          </button>
        </>
      ) : null}
      {canLifecycle && target.status === USER_STATUS.ACTIVE ? (
        <button
          className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50"
          onClick={() => onAction(target, "disable")}
          type="button"
        >
          Disable
        </button>
      ) : null}
    </div>
  )
}

function UserMobileCard(props) {
  const { target } = props

  return (
    <article className="rounded-2xl border border-[var(--color-border)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-bold text-[var(--color-text-strong)]">{target.fullName}</p>
          <p className="mt-1 truncate text-xs font-semibold text-[var(--color-muted)]">
            @{target.username} {target.employeeCode ? `· ${target.employeeCode}` : ""}
          </p>
        </div>
        <StatusBadge status={target.status} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <AccountTypeBadge
          role={target.role}
          incentiveClassification={target.incentiveClassification}
        />
        <span className="rounded-full bg-[var(--color-soft)] px-3 py-1 text-xs font-bold text-[var(--color-muted)]">
          {target.branch?.code || "Global"}
        </span>
      </div>
      <div className="mt-4 border-t border-[var(--color-border)] pt-3">
        <UserActions {...props} />
      </div>
    </article>
  )
}

function UsersPage({ selectedBranch, user }) {
  const isSuperOwner = user?.role === USER_ROLES.SUPER_OWNER
  const [users, setUsers] = useState([])
  const [meta, setMeta] = useState(null)
  const [branches, setBranches] = useState(() => {
    const branch = selectedBranch || user?.branch
    return branch ? [branch] : []
  })
  const [branchError, setBranchError] = useState("")
  const [searchText, setSearchText] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [accountTypeFilter, setAccountTypeFilter] = useState("")
  const [branchFilter, setBranchFilter] = useState("")
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [noticeMessage, setNoticeMessage] = useState("")
  const [editor, setEditor] = useState(null)
  const [detailUserId, setDetailUserId] = useState(null)
  const [lifecycleRequest, setLifecycleRequest] = useState(null)
  const requestIdRef = useRef(0)
  const pageSize = 10

  const activeBranch = selectedBranch || user?.branch || null
  const assignableRoles = useMemo(() => ASSIGNABLE_ROLES[user?.role] || [], [user?.role])

  useEffect(() => {
    if (!isSuperOwner) return undefined

    let isCurrent = true

    const loadBranches = async () => {
      try {
        const response = await getBranches()
        if (!isCurrent) return
        if (!response?.success || !Array.isArray(response.data)) {
          throw new Error("Invalid branch response")
        }
        setBranches(response.data)
        setBranchError("")
      } catch (error) {
        if (!isCurrent) return
        setBranchError(getApiErrorMessage(error, "Unable to load branch choices."))
      }
    }

    loadBranches()
    return () => {
      isCurrent = false
    }
  }, [isSuperOwner])

  const loadUsers = useCallback(async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setIsLoading(true)
    setErrorMessage("")

    try {
      const params = { page, limit: pageSize }
      if (searchText.trim()) params.search = searchText.trim()
      if (statusFilter) params.status = statusFilter
      if (accountTypeFilter) {
        const config = ACCOUNT_TYPE_CONFIG[accountTypeFilter]

        if (config) {
          params.role = config.role
          params.incentiveClassification = config.incentiveClassification
        }
      }
      if (branchFilter) params.branchId = branchFilter

      const response = await getUsers(params)
      if (requestId !== requestIdRef.current) return
      if (!response?.success || !Array.isArray(response.data)) {
        throw new Error("Invalid users response")
      }

      setUsers(response.data)
      setMeta(response.meta || null)
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      setUsers([])
      setMeta(null)
      setErrorMessage(getApiErrorMessage(error, "Unable to load users right now."))
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false)
    }
  }, [accountTypeFilter, branchFilter, page, searchText, statusFilter])

  useEffect(() => {
    const timer = window.setTimeout(loadUsers, searchText.trim() ? 300 : 0)

    return () => {
      window.clearTimeout(timer)
      requestIdRef.current += 1
    }
  }, [loadUsers, searchText])

  const [isExporting, setIsExporting] = useState(false)

  const handleExportUsersExcel = async () => {
    setIsExporting(true)
    try {
      let allUsers = []
      let currPage = 1
      let totalPages = 1

      do {
        const params = { page: currPage, limit: 100 }
        if (searchText.trim()) params.search = searchText.trim()
        if (statusFilter) params.status = statusFilter
        if (accountTypeFilter) {
          const config = ACCOUNT_TYPE_CONFIG[accountTypeFilter]
          if (config) {
            params.role = config.role
            params.incentiveClassification = config.incentiveClassification
          }
        }
        if (branchFilter) params.branchId = branchFilter

        const response = await getUsers(params)
        const items = Array.isArray(response?.data) ? response.data : []
        allUsers = allUsers.concat(items)
        totalPages = Number(response?.meta?.totalPages || 1)
        currPage += 1
      } while (currPage <= totalPages && currPage <= 50)

      const activeFilters = []
      if (searchText.trim()) activeFilters.push({ label: "Search Keyword", value: searchText.trim() })
      if (statusFilter) activeFilters.push({ label: "Status", value: statusFilter })
      if (accountTypeFilter) activeFilters.push({ label: "Account Type", value: accountTypeFilter })
      if (branchFilter) {
        const foundBranch = branches.find((b) => b.id === branchFilter)
        activeFilters.push({ label: "Branch", value: foundBranch?.name || branchFilter })
      }

      const headers = [
        "User Code",
        "Full Name",
        "Username",
        "Email",
        "Role",
        "Incentive Tier",
        "Branch",
        "Status",
        "Last Login",
        "Created Date",
      ]

      const rows = allUsers.map((u) => [
        u.userCode || "-",
        u.fullName || "-",
        u.username || "-",
        u.email || "-",
        ROLE_LABELS[u.role] || u.role || "-",
        u.incentiveClassification ? String(u.incentiveClassification).replace(/_/g, " ") : "Standard",
        u.branch?.name || "-",
        u.status || "ACTIVE",
        u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("en-PH") : "Never",
        u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-PH") : "-",
      ])

      exportReportExcel({
        title: "STAFF & USER ACCOUNTS DIRECTORY REPORT",
        branchName: activeBranch?.name || "All Branches",
        generatedBy: user?.fullName || user?.username || "System",
        filenamePrefix: "staff_accounts",
        headers,
        rows,
        activeFilters,
      })
    } catch (error) {
      console.error(error)
      setErrorMessage("Failed to export users: " + (error.message || "Unknown error"))
    } finally {
      setIsExporting(false)
    }
  }

  const handleSaved = (savedUser, action) => {
    setEditor(null)
    setLifecycleRequest(null)
    setNoticeMessage(
      action === "created"
          ? `${savedUser.fullName} was created as pending.`
        : action === "updated"
          ? `${savedUser.fullName} was updated.`
          : `${savedUser.fullName} was ${ACTION_CONFIG[action].pastTense}.`,
    )
    if (action === "created" && page !== 1) setPage(1)
    else loadUsers()
  }

  const clearFilters = () => {
    setSearchText("")
    setStatusFilter("")
    setAccountTypeFilter("")
    setBranchFilter(isSuperOwner ? "" : user?.branchId || "")
    setPage(1)
  }

  const total = meta?.total ?? users.length
  const totalPages = meta?.totalPages || 1
  const hasFilters = Boolean(
    searchText.trim() || statusFilter || accountTypeFilter || (isSuperOwner && branchFilter),
  )

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--color-accent)]">Users / Account Types</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text-strong)]">
            User access management
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--color-muted)]">
            Create pending accounts, maintain branch assignments, and control the approval lifecycle.
          </p>
          {activeBranch ? (
            <p className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full bg-[var(--color-soft)] px-3 py-1.5 text-xs font-bold text-[var(--color-muted)]">
              <Building2 size={14} />
              <span className="truncate">{activeBranch.code} · {activeBranch.name}</span>
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--color-text-strong)] shadow-sm transition hover:bg-[var(--color-soft)] disabled:opacity-60"
            disabled={isLoading}
            onClick={loadUsers}
            type="button"
          >
            <RefreshCw className={isLoading ? "animate-spin" : ""} size={16} />
            Refresh
          </button>
          <ExportExcelButton
            count={total}
            isExporting={isExporting}
            onClick={handleExportUsersExcel}
          />
          <button
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-maroon)] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[var(--color-maroon-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={assignableRoles.length === 0 || branches.length === 0}
            onClick={() => setEditor({ mode: "create", target: null })}
            type="button"
          >
            <Plus size={17} />
            New user
          </button>
        </div>
      </div>

      {noticeMessage ? (
        <section className="flex items-start justify-between gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold leading-6 text-emerald-800">
          <span>{noticeMessage}</span>
          <button
            aria-label="Dismiss message"
            className="rounded-lg p-1 transition hover:bg-emerald-100"
            onClick={() => setNoticeMessage("")}
            type="button"
          >
            <X size={16} />
          </button>
        </section>
      ) : null}

      {branchError ? <ErrorBanner>{branchError}</ErrorBanner> : null}

      <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 shadow-card">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(16rem,1fr)_repeat(3,minmax(10rem,13rem))_auto] xl:items-end">
          <label className="min-w-0">
            <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">Search</span>
            <span className="relative mt-2 block">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" size={18} />
              <input
                className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-soft)] py-3 pl-11 pr-4 text-sm font-semibold outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-card)]"
                onChange={(event) => {
                  setSearchText(event.target.value)
                  setPage(1)
                }}
                placeholder="Name, username, email, or code"
                value={searchText}
              />
            </span>
          </label>

          <label>
            <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">Status</span>
            <select
              className={inputClassName}
              onChange={(event) => {
                setStatusFilter(event.target.value)
                setPage(1)
              }}
              value={statusFilter}
            >
              <option value="">All statuses</option>
              {Object.values(USER_STATUS).map((status) => (
                <option key={status} value={status}>{status.charAt(0) + status.slice(1).toLowerCase()}</option>
              ))}
            </select>
          </label>

          <label>
            <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
              Account type
            </span>
            <select
              className={inputClassName}
              onChange={(event) => {
                setAccountTypeFilter(event.target.value)
                setPage(1)
              }}
              value={accountTypeFilter}
            >
              <option value="">All account types</option>
              {[
                ACCOUNT_TYPES.MAIN_ADMIN,
                ACCOUNT_TYPES.ADMIN,
                ACCOUNT_TYPES.SENIOR_SALES_AGENT,
                ACCOUNT_TYPES.SALES_AGENT,
                ACCOUNT_TYPES.SENIOR_TECHNICIAN,
                ACCOUNT_TYPES.TECHNICIAN,
              ].map((accountType) => (
                <option key={accountType} value={accountType}>
                  {ACCOUNT_TYPE_CONFIG[accountType].label}
                </option>
              ))}
            </select>
          </label>

          {isSuperOwner ? (
            <label>
              <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">Branch</span>
              <select
                className={inputClassName}
                onChange={(event) => {
                  setBranchFilter(event.target.value)
                  setPage(1)
                }}
                value={branchFilter}
              >
                <option value="">All branches / global</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>
                ))}
              </select>
            </label>
          ) : (
            <div className="rounded-2xl bg-[var(--color-soft)] px-4 py-3 text-sm font-bold text-[var(--color-muted)]">
              {user?.branch?.code || "Assigned branch"}
            </div>
          )}

          <button
            className="rounded-2xl border border-[var(--color-border)] px-4 py-3 text-sm font-bold text-[var(--color-text-strong)] transition hover:bg-[var(--color-soft)] disabled:opacity-50"
            disabled={!hasFilters}
            onClick={clearFilters}
            type="button"
          >
            Clear
          </button>
        </div>
      </section>

      {errorMessage ? (
        <section className="space-y-3 rounded-3xl border border-red-200 bg-red-50 p-5">
          <ErrorBanner>{errorMessage}</ErrorBanner>
          <button className="rounded-2xl border border-red-200 bg-[var(--color-card)] px-4 py-2.5 text-sm font-bold text-red-700" onClick={loadUsers} type="button">
            Try again
          </button>
        </section>
      ) : null}

      <section className="min-w-0 overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-card">
        {isLoading ? (
          <div className="p-6 text-sm font-semibold text-[var(--color-muted)]">Loading users... Please wait.</div>
        ) : users.length === 0 ? (
          <div className="grid place-items-center p-8 text-center">
            <UsersRound className="text-[var(--color-muted)]" size={42} />
            <p className="mt-3 font-bold text-[var(--color-text-strong)]">
              {hasFilters ? "No matching users found" : "No users found"}
            </p>
            <p className="mt-1 max-w-md text-sm leading-6 text-[var(--color-muted)]">
              {hasFilters ? "Try different filters or clear the current search." : "Create a pending user account to begin."}
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[1050px] border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-[var(--color-soft)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Account type</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Last login</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {users.map((target) => (
                    <tr className="align-top transition hover:bg-[var(--color-soft)]" key={target.id}>
                      <td className="min-w-60 px-4 py-4">
                        <p className="font-bold text-[var(--color-text-strong)]">{target.fullName}</p>
                        <p className="mt-1 text-xs font-semibold text-[var(--color-muted)]">
                          @{target.username} {target.employeeCode ? `· ${target.employeeCode}` : ""}
                        </p>
                        <p className="mt-1 break-all text-xs text-[var(--color-muted)]">{target.email || "—"}</p>
                      </td>
                      <td className="px-4 py-4"><AccountTypeBadge
                          role={target.role}
                          incentiveClassification={target.incentiveClassification}
                        /></td>
                      <td className="whitespace-nowrap px-4 py-4 font-semibold text-[var(--color-text-strong)]">
                        {target.branch?.code || "Global"}
                      </td>
                      <td className="px-4 py-4"><StatusBadge status={target.status} /></td>
                      <td className="whitespace-nowrap px-4 py-4 text-xs text-[var(--color-muted)]">
                        {formatDate(target.lastLoginAt, true)}
                      </td>
                      <td className="px-4 py-4">
                        <UserActions
                          actor={user}
                          onAction={(selectedUser, action) => setLifecycleRequest({ target: selectedUser, action })}
                          onEdit={(selectedUser) => setEditor({ mode: "edit", target: selectedUser })}
                          onView={(selectedUser) => setDetailUserId(selectedUser.id)}
                          target={target}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 p-4 lg:hidden">
              {users.map((target) => (
                <UserMobileCard
                  actor={user}
                  key={target.id}
                  onAction={(selectedUser, action) => setLifecycleRequest({ target: selectedUser, action })}
                  onEdit={(selectedUser) => setEditor({ mode: "edit", target: selectedUser })}
                  onView={(selectedUser) => setDetailUserId(selectedUser.id)}
                  target={target}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {!isLoading && users.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-[var(--color-muted)]">
            Page {meta?.page || page} of {totalPages} · {total} user(s)
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] px-4 py-2.5 text-sm font-bold disabled:opacity-50"
              disabled={(meta?.page || page) <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              type="button"
            >
              <ChevronLeft size={16} /> Previous
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] px-4 py-2.5 text-sm font-bold disabled:opacity-50"
              disabled={(meta?.page || page) >= totalPages}
              onClick={() => setPage((current) => current + 1)}
              type="button"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </section>
      ) : null}

      <section className="flex items-start gap-3 rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 text-sm leading-6 text-[var(--color-muted)] shadow-card">
        <ShieldCheck className="mt-0.5 shrink-0 text-[var(--color-maroon)]" size={19} />
        <p>
          Branch access and role hierarchy are enforced by the server. Password hashes and credentials are never returned in user records.
        </p>
      </section>

      {editor ? (
        <UserEditorModal
          actor={user}
          branches={branches}
          key={`${editor.mode}-${editor.target?.id || "new"}`}
          mode={editor.mode}
          onClose={() => setEditor(null)}
          onSaved={handleSaved}
          selectedBranch={selectedBranch}
          target={editor.target}
        />
      ) : null}

      {detailUserId ? (
        <UserDetailModal
          actor={user}
          onClose={() => setDetailUserId(null)}
          onEdit={(target) => {
            setDetailUserId(null)
            setEditor({ mode: "edit", target })
          }}
          userId={detailUserId}
        />
      ) : null}

      {lifecycleRequest ? (
        <LifecycleDialog
          action={lifecycleRequest.action}
          key={`${lifecycleRequest.target.id}-${lifecycleRequest.action}`}
          onClose={() => setLifecycleRequest(null)}
          onSaved={handleSaved}
          target={lifecycleRequest.target}
        />
      ) : null}
    </div>
  )
}

export default UsersPage

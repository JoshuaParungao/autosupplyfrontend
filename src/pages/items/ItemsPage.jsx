import { useEffect, useMemo, useState } from "react"
import { AlertCircle, AlertTriangle, CheckCircle2, Edit3, Layers, PackageSearch, Plus, RefreshCw, Save, Search, SlidersHorizontal, Sparkles, Tag, X } from "lucide-react"
import { useCallback } from "react"

import { USER_ROLES } from "../../constants/roles"
import { createItem, getItemCategories, getItems, getUnits, updateItemById } from "../../features/items/items.api"
import { exportReportExcel } from "../../utils/businessDocumentExport"
import ExportExcelButton from "../../components/common/ExportExcelButton"
import {
  CAPACITY_PRESETS,
  formatSpecs,
  matchesItemAttributes,
  POPULAR_BRANDS,
  SPEED_PRESETS,
  TYPE_PRESETS,
} from "../../utils/attributeFilter"

const OWNER_ROLES = new Set([
  USER_ROLES.SUPER_OWNER,
  USER_ROLES.BRANCH_OWNER,
  USER_ROLES.ADMIN,
])

const PRICE_ADMIN_ROLES = new Set([
  USER_ROLES.SUPER_OWNER,
  USER_ROLES.ADMIN,
])

const PRICE_FIELDS = [
  { key: "price1", label: "Price 1" },
  { key: "price2", label: "Price 2" },
  { key: "price3", label: "Price 3" },
  { key: "price4", label: "Price 4" },
  { key: "price5", label: "Price 5" },
]

// eslint-disable-next-line react-refresh/only-export-components
export function parseItemWarranty(item) {
  if (!item) return "1 YEAR WARRANTY"
  if (item.warrantyDuration) return item.warrantyDuration
  
  if (item.id) {
    try {
      const stored = localStorage.getItem(`item_warranty_${item.id}`)
      if (stored) return stored
    } catch {
      // ignore storage error
    }
  }

  if (item.description) {
    const match = item.description.match(/\[WARRANTY:\s*([^\]]+)\]/i)
    if (match?.[1]) return match[1].trim()
  }

  if (item.hasWarranty === false && !item.isSerialized) {
    return "NO WARRANTY"
  }

  return item.isSerialized ? "1 YEAR WARRANTY" : (item.hasWarranty ? "1 YEAR WARRANTY" : "1 MONTH WARRANTY")
}

// eslint-disable-next-line react-refresh/only-export-components
export function stripWarrantyTag(description) {
  if (!description) return ""
  return description.replace(/\[WARRANTY:\s*[^\]]+\]/gi, "").trim()
}

// eslint-disable-next-line react-refresh/only-export-components
export function autoDetectSpecsFromItem({ itemName = "", brand = "", modelName = "", schema = [] }) {
  if (!itemName || !Array.isArray(schema) || schema.length === 0) return {}

  const text = `${brand || ""} ${modelName || ""} ${itemName}`.trim()
  const detected = {}

  for (const field of schema) {
    const nameLower = field.name.toLowerCase()
    const options = Array.isArray(field.options) ? field.options : []

    // 1. Try matching predefined options (longest first)
    if (options.length > 0) {
      const sorted = [...options].sort((a, b) => b.length - a.length)
      for (const opt of sorted) {
        const escaped = opt.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")
        const regex = new RegExp(`(^|[^a-zA-Z0-9])${escaped}([^a-zA-Z0-9]|$)`, "i")
        if (regex.test(text)) {
          detected[field.name] = opt
          break
        }
      }
    }

    if (detected[field.name]) continue

    // 2. Specialized Regex Patterns
    // Capacity / Storage / VRAM
    if (nameLower.includes("capacity") || nameLower.includes("size") || nameLower.includes("vram")) {
      const match = text.match(/\b(\d+)\s*(GB|TB|MB)\b/i)
      if (match) {
        detected[field.name] = `${match[1]}${match[2].toUpperCase()}`
        continue
      }
    }

    // Speed / Frequency
    if (nameLower.includes("speed") || nameLower.includes("frequency")) {
      const match = text.match(/\b(\d{3,5})\s*(MHz|MT\/s|GHz)\b/i)
      if (match) {
        const unit = match[2].toUpperCase() === "MT/S" ? " MT/s" : match[2].toUpperCase() === "GHZ" ? " GHz" : "MHz"
        detected[field.name] = `${match[1]}${unit}`
        continue
      }
    }

    // Refresh Rate
    if (nameLower.includes("refresh rate")) {
      const match = text.match(/\b(\d{2,3})\s*Hz\b/i)
      if (match) {
        detected[field.name] = `${match[1]}Hz`
        continue
      }
    }

    // Memory Type
    if (nameLower.includes("memory type")) {
      const match = text.match(/\b(DDR5|DDR4|DDR3L?|GDDR6X?|GDDR5)\b/i)
      if (match) {
        detected[field.name] = match[1].toUpperCase()
        continue
      }
    }

    // Color
    if (nameLower.includes("color")) {
      const match = text.match(/\b(Black|White|Silver|Grey|Gray|Red|Blue|Pink|Green|Yellow|Gold)\b/i)
      if (match) {
        const c = match[1].toLowerCase()
        detected[field.name] = c.charAt(0).toUpperCase() + c.slice(1)
        continue
      }
    }

    // RGB Lighting
    if (nameLower.includes("rgb") || nameLower.includes("lighting")) {
      if (/\b(Non-RGB|Without RGB|No RGB|None)\b/i.test(text)) {
        detected[field.name] = "Non-RGB"
        continue
      } else if (/\b(ARGB|Addressable RGB|A-RGB)\b/i.test(text)) {
        detected[field.name] = "ARGB"
        continue
      } else if (/\b(RGB)\b/i.test(text)) {
        detected[field.name] = "RGB"
        continue
      }
    }

    // Pin Count (for RAM)
    if (nameLower.includes("pin count") || nameLower.includes("pins")) {
      if (/\bDDR5\b/i.test(text)) {
        detected[field.name] = "288-Pin"
        continue
      } else if (/\bDDR4\b/i.test(text)) {
        detected[field.name] = "288-Pin"
        continue
      } else if (/\bDDR3\b/i.test(text)) {
        detected[field.name] = "240-Pin"
        continue
      }
    }

    // Form Factor
    if (nameLower.includes("form factor")) {
      if (/\b(SO-DIMM|SODIMM|Laptop)\b/i.test(text)) {
        detected[field.name] = "SO-DIMM"
        continue
      } else if (/\b(DIMM|Desktop|UDIMM|U-DIMM)\b/i.test(text) || (nameLower.includes("ram") || text.includes("RAM"))) {
        detected[field.name] = "DIMM"
        continue
      } else if (/\b(Micro-ATX|M-ATX|Micro ATX|mATX)\b/i.test(text)) {
        detected[field.name] = "Micro-ATX"
        continue
      } else if (/\b(Mini-ITX|Mini ITX|ITX)\b/i.test(text)) {
        detected[field.name] = "Mini-ITX"
        continue
      } else if (/\b(ATX)\b/i.test(text)) {
        detected[field.name] = "ATX"
        continue
      } else if (/\b(M\.2\s*2280)\b/i.test(text)) {
        detected[field.name] = "M.2 2280"
        continue
      } else if (/\b(2\.5["']?)\b/i.test(text)) {
        detected[field.name] = '2.5"'
        continue
      } else if (/\b(3\.5["']?)\b/i.test(text)) {
        detected[field.name] = '3.5"'
        continue
      }
    }

    // Wattage / Power
    if (nameLower.includes("wattage") || nameLower.includes("power")) {
      const match = text.match(/\b(\d{3,4})\s*W\b/i)
      if (match) {
        detected[field.name] = `${match[1]}W`
        continue
      }
    }

    // Efficiency Rating / 80 Plus
    if (nameLower.includes("efficiency") || nameLower.includes("rating")) {
      const match = text.match(/\b(80\s*Plus\s*(Titanium|Platinum|Gold|Silver|Bronze|White|Standard))\b/i)
      if (match) {
        detected[field.name] = match[1]
        continue
      }
    }

    // Socket
    if (nameLower.includes("socket")) {
      const match = text.match(/\b(AM4|AM5|LGA\s*1700|LGA\s*1851|LGA\s*1200|sTR5)\b/i)
      if (match) {
        detected[field.name] = match[1].toUpperCase()
        continue
      }
    }

    // Chipset
    if (nameLower.includes("chipset")) {
      const match = text.match(/\b(B450|B550|X570|A520|B650|X670|X870|H610|B660|B760|Z690|Z790)\b/i)
      if (match) {
        detected[field.name] = match[1].toUpperCase()
        continue
      }
    }

    // Resolution
    if (nameLower.includes("resolution")) {
      if (/\b(1920\s*x\s*1080|1080p|FHD)\b/i.test(text)) {
        detected[field.name] = "1920 x 1080 (FHD)"
        continue
      } else if (/\b(2560\s*x\s*1440|1440p|2K|QHD)\b/i.test(text)) {
        detected[field.name] = "2560 x 1440 (QHD)"
        continue
      } else if (/\b(3840\s*x\s*2160|4K|UHD)\b/i.test(text)) {
        detected[field.name] = "3840 x 2160 (4K UHD)"
        continue
      }
    }

    // Brand
    if (nameLower.includes("brand")) {
      if (brand && brand.trim()) {
        detected[field.name] = brand.trim()
        continue
      }
      const knownBrands = [
        "Kingston", "Corsair", "G.Skill", "TeamGroup", "Crucial", "Adata", "Samsung",
        "Seagate", "Western Digital", "WD", "Asus", "MSI", "Gigabyte", "ASRock", "Palit",
        "Zotac", "Galax", "Inno3D", "PowerColor", "Sapphire", "XFX", "AMD", "Intel",
        "DeepCool", "Thermaltake", "NZXT", "Cooler Master", "SilverStone", "Seasonic",
        "FSP", "Montech", "DarkFlash", "Lian Li", "Keychron", "Royal Kludge", "Logitech",
        "Razer", "Redragon", "SteelSeries", "AOC", "ViewSonic", "BenQ", "LG", "Philips"
      ]
      for (const b of knownBrands) {
        const regex = new RegExp(`(^|[^a-zA-Z0-9])${b}([^a-zA-Z0-9]|$)`, "i")
        if (regex.test(text)) {
          detected[field.name] = b
          break
        }
      }
    }
  }

  return detected
}

const EMPTY_ITEM_FORM = {
  itemCode: "",
  barcode: "",
  itemName: "",
  description: "",
  brand: "",
  modelName: "",
  categoryId: "",
  unitId: "",
  attributes: {},
  isSerialized: false,
  hasWarranty: true,
  warrantyDuration: "1 YEAR WARRANTY",
  status: "ACTIVE",
  costPrice: "0",
  price1: "0",
  price2: "0",
  price3: "0",
  price4: "0",
  price5: "0",
  minimumStock: "0",
  reorderLevel: "0",
}

function itemToForm(item) {
  if (!item) {
    return { ...EMPTY_ITEM_FORM }
  }

  const warranty = parseItemWarranty(item)

  return {
    itemCode: item.itemCode || "",
    barcode: item.barcode || "",
    itemName: item.itemName || "",
    description: stripWarrantyTag(item.description),
    brand: item.brand || "",
    modelName: item.modelName || "",
    categoryId: item.category?.id || item.categoryId || "",
    unitId: item.unit?.id || item.unitId || "",
    attributes: item.attributes && typeof item.attributes === "object" ? { ...item.attributes } : {},
    isSerialized: Boolean(item.isSerialized),
    hasWarranty: warranty !== "NO WARRANTY",
    warrantyDuration: warranty,
    status: item.status || "ACTIVE",
    costPrice: String(item.costPrice ?? 0),
    price1: String(item.price1 ?? 0),
    price2: String(item.price2 ?? 0),
    price3: String(item.price3 ?? 0),
    price4: String(item.price4 ?? 0),
    price5: String(item.price5 ?? 0),
    minimumStock: String(item.minimumStock ?? 0),
    reorderLevel: String(item.reorderLevel ?? 0),
  }
}

function getItemApiError(error, fallback) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    fallback
  )
}

function numberValue(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatMoney(value) {
  const amount = Number(value || 0)

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(amount)
}

function formatFlag(value, yesLabel, noLabel) {
  return value ? yesLabel : noLabel
}

function StatusPill({ status }) {
  const label = status || "ACTIVE"

  return (
    <span className="inline-flex rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
      {label}
    </span>
  )
}

function ItemDetailModal({ canViewCost, item, onClose }) {
  if (!item) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl border border-slate-200">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50/75 px-5 py-3.5">
          <div className="min-w-0">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-maroon)]">Item Details</span>
            <h2 className="mt-0.5 truncate text-base font-black text-slate-900 leading-tight">
              {item.itemName}
            </h2>
            <p className="text-xs font-semibold text-slate-500 font-mono">
              {item.itemCode}
            </p>
          </div>

          <button
            className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid gap-2.5 sm:grid-cols-2 text-xs">
            <div className="rounded-xl border border-slate-100 bg-slate-50/75 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Item Code</p>
              <p className="mt-1 font-mono font-bold text-slate-900">
                {item.itemCode || "—"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/75 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Barcode</p>
              <p className="mt-1 font-mono font-bold text-slate-900">
                {item.barcode || "No barcode"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/75 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Brand / Model</p>
              <p className="mt-1 font-bold text-slate-900">
                {[item.brand, item.modelName].filter(Boolean).join(" • ") || "No brand/model"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/75 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Branch</p>
              <p className="mt-1 font-bold text-slate-900">
                {item.branch?.code || item.branch?.name || "No branch"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/75 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Category</p>
              <p className="mt-1 font-bold text-slate-900">
                {item.category?.name || "No category"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/75 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Unit</p>
              <p className="mt-1 font-bold text-slate-900">
                {item.unit?.name || "No unit"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/75 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tracking</p>
              <p className="mt-1 font-bold text-slate-900">
                {item.isSerialized ? "Serialized" : "Non-serialized"}
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Warranty Coverage</p>
              <p className="mt-1 font-bold text-emerald-950">
                {parseItemWarranty(item)}
              </p>
            </div>
          </div>

          {/* Technical Specifications */}
          {item.attributes && typeof item.attributes === "object" && Object.keys(item.attributes).length > 0 ? (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                  ⚙️ Technical Specifications
                </span>
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800 border border-indigo-200">
                  {Object.keys(item.attributes).length} attributes
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 text-xs">
                {Object.entries(item.attributes).map(([key, val]) => (
                  <div key={key} className="rounded-lg bg-white border border-indigo-100 p-2 shadow-2xs">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{key}</p>
                    <p className="mt-0.5 font-bold text-slate-900">{String(val || "—")}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-200 p-3.5 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Selling Price Tiers</p>
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-5 text-xs">
              {PRICE_FIELDS.map((priceField) => (
                <div key={priceField.key} className="rounded-lg bg-slate-50 p-2.5 text-center border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-500">{priceField.label}</p>
                  <p className="mt-0.5 font-mono font-bold text-slate-900">
                    {formatMoney(item[priceField.key])}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {canViewCost ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs flex justify-between items-center">
              <span className="font-bold uppercase tracking-wider text-amber-900">Cost Price</span>
              <span className="font-mono font-black text-amber-950 text-sm">
                {formatMoney(item.costPrice)}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end border-t border-slate-200 bg-slate-50/75 px-5 py-3">
          <button
            className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function ItemEditorModal({
  canAdjustPrices,
  categories,
  errorMessage,
  form,
  isEditing,
  isSaving,
  onChange,
  onClose,
  onNavigate,
  onSave,
  units,
}) {
  const formCategoryId = form?.categoryId

  const selectedCategory = useMemo(() => {
    if (!formCategoryId) return null
    return categories.find((c) => c.id === formCategoryId) || null
  }, [categories, formCategoryId])

  const mainCategories = useMemo(() => {
    return categories.filter((c) => !c.parentId || c.parentId === "")
  }, [categories])

  const effectiveMainCatId = useMemo(() => {
    if (!selectedCategory) return ""
    return selectedCategory.parentId || selectedCategory.id
  }, [selectedCategory])

  const subcategoryOptions = useMemo(() => {
    if (!effectiveMainCatId) return []
    return categories.filter((c) => c.parentId === effectiveMainCatId)
  }, [categories, effectiveMainCatId])

  const isUnalignedLegacyItem = Boolean(
    selectedCategory && !selectedCategory.parentId && subcategoryOptions.length > 0
  )

  if (!form) return null

  const inputClass =
    "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none transition focus:border-slate-800 focus:ring-1 focus:ring-slate-800 hover:border-slate-300 placeholder:text-slate-400 placeholder:font-normal"

  const labelClass = "text-[11px] font-bold uppercase tracking-wider text-slate-600"

  const handleMainCatChange = (mainId) => {
    if (!mainId) {
      onChange("categoryId", "")
      return
    }
    const subs = categories.filter((c) => c.parentId === mainId)
    if (subs.length > 0) {
      onChange("categoryId", subs[0].id)
    } else {
      onChange("categoryId", mainId)
    }
  }

  const WARRANTY_PRESETS = [
    { label: "1 Year", duration: "1 YEAR WARRANTY" },
    { label: "2 Years", duration: "2 YEARS WARRANTY" },
    { label: "6 Mos", duration: "6 MONTHS WARRANTY" },
    { label: "1 Mo", duration: "1 MONTH WARRANTY" },
    { label: "7 Days", duration: "7 DAYS REPLACEMENT" },
    { label: "No Warranty", duration: "NO WARRANTY" },
  ]

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/40 backdrop-blur-xs p-3 sm:p-6 grid place-items-center">
      <form
        className="my-auto w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl border border-slate-200/80"
        onSubmit={(event) => {
          event.preventDefault()
          onSave()
        }}
      >
        {/* Minimalist Header */}
        <header className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 leading-tight">
              {isEditing ? "Edit Product" : "New Product"}
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {isEditing && form.itemCode
                ? `Item Code: ${form.itemCode}`
                : "Fill in product specifications and pricing"}
            </p>
          </div>

          <button
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </header>

        <div className="max-h-[75vh] overflow-y-auto p-6 space-y-4">
          {errorMessage ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
              <AlertCircle className="mt-0.5 shrink-0" size={15} />
              <span>{errorMessage}</span>
            </div>
          ) : null}

          {/* 1. Category & Classification */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                1. Category & Classification
              </span>
              {onNavigate ? (
                <button
                  className="text-[11px] font-semibold text-[var(--color-maroon)] hover:underline"
                  onClick={() => onNavigate("categories")}
                  type="button"
                >
                  Manage Categories ↗
                </button>
              ) : null}
            </div>

            {isUnalignedLegacyItem ? (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span>
                  Currently assigned to top-level category (<strong>{selectedCategory?.name}</strong>). Please select a <strong>Subcategory</strong> below.
                </span>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              {/* MAIN CATEGORY */}
              <label className="block">
                <span className={labelClass}>Main Category</span>
                <select
                  className={inputClass}
                  onChange={(event) => handleMainCatChange(event.target.value)}
                  value={effectiveMainCatId}
                >
                  <option value="">Select main category</option>
                  {mainCategories.map((mainCat) => (
                    <option key={mainCat.id} value={mainCat.id}>
                      {mainCat.name}
                    </option>
                  ))}
                </select>
              </label>

              {/* SUBCATEGORY */}
              <label className="block">
                <span className={labelClass}>
                  Subcategory <span className="text-red-500">*</span>
                </span>
                {subcategoryOptions.length > 0 ? (
                  <select
                    className={`${inputClass} ${
                      isUnalignedLegacyItem
                        ? "border-amber-400 bg-amber-50/30"
                        : ""
                    }`}
                    onChange={(event) =>
                      onChange("categoryId", event.target.value)
                    }
                    required
                    value={isUnalignedLegacyItem ? "" : form.categoryId}
                  >
                    <option value="">
                      {isUnalignedLegacyItem
                        ? `Select subcategory (e.g. ${subcategoryOptions[0]?.name})`
                        : "Select subcategory"}
                    </option>
                    {subcategoryOptions.map((subCat) => (
                      <option key={subCat.id} value={subCat.id}>
                        {subCat.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      className={`${inputClass} bg-slate-50 text-slate-500 cursor-not-allowed`}
                      disabled
                      value={selectedCategory?.name || "No subcategories"}
                    />
                    {onNavigate ? (
                      <button
                        type="button"
                        onClick={() => onNavigate("categories")}
                        className="shrink-0 mt-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-maroon)] hover:bg-slate-50"
                        title="Manage in File Maintenance"
                      >
                        + Add
                      </button>
                    ) : null}
                  </div>
                )}
              </label>
            </div>
          </section>

          {/* 2. Product Identity & Details */}
          <section className="space-y-2.5 pt-2 border-t border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              2. Product Identity & Details
            </span>

            <div className="grid gap-3 sm:grid-cols-2">
              {/* ITEM CODE */}
              <label className="block">
                <span className={labelClass}>Item Code</span>
                <input
                  className={inputClass}
                  onChange={(event) =>
                    onChange("itemCode", event.target.value.toUpperCase())
                  }
                  placeholder={isEditing ? "Item Code" : "Auto-generated"}
                  value={form.itemCode}
                />
              </label>

              {/* BARCODE */}
              <label className="block">
                <span className={labelClass}>Barcode</span>
                <input
                  autoComplete="off"
                  className={inputClass}
                  onChange={(event) =>
                    onChange("barcode", event.target.value)
                  }
                  placeholder="Scan or type barcode"
                  value={form.barcode}
                />
              </label>
            </div>

            {/* PRODUCT NAME */}
            <label className="block">
              <span className={labelClass}>
                Product Name <span className="text-red-500">*</span>
              </span>
              <input
                className={inputClass}
                onChange={(event) =>
                  onChange("itemName", event.target.value)
                }
                placeholder="e.g. Intel Core i5-12400F Processor"
                required
                value={form.itemName}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              {/* BRAND */}
              <label className="block">
                <span className={labelClass}>Brand</span>
                <input
                  className={inputClass}
                  onChange={(event) =>
                    onChange("brand", event.target.value)
                  }
                  placeholder="e.g. Intel, Asus, Kingston"
                  value={form.brand}
                />
              </label>

              {/* MODEL */}
              <label className="block">
                <span className={labelClass}>Model</span>
                <input
                  className={inputClass}
                  onChange={(event) =>
                    onChange("modelName", event.target.value)
                  }
                  placeholder="e.g. B660M, 3200MHz"
                  value={form.modelName}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {/* UNIT */}
              <label className="block">
                <span className={labelClass}>
                  Unit <span className="text-red-500">*</span>
                </span>
                <select
                  className={inputClass}
                  onChange={(event) =>
                    onChange("unitId", event.target.value)
                  }
                  required
                  value={form.unitId}
                >
                  <option value="">Select unit</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
              </label>

              {/* OPTIONAL NOTES / DESCRIPTION */}
              <label className="block">
                <span className={labelClass}>Item Notes (Optional)</span>
                <input
                  className={inputClass}
                  onChange={(event) =>
                    onChange("description", event.target.value)
                  }
                  placeholder="Optional notes or remarks…"
                  value={form.description || ""}
                />
              </label>
            </div>
          </section>

          {/* 3. Tracking, Warranty & Status */}
          <section className="space-y-2.5 pt-2 border-t border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              3. Tracking, Warranty & Status
            </span>

            <div className="grid gap-3 sm:grid-cols-2 items-start">
              {/* SERIALIZED */}
              <div>
                <span className={labelClass}>Tracking</span>
                <label className="mt-1 flex h-[38px] items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-xs font-medium text-slate-700 cursor-pointer hover:bg-slate-50 transition">
                  <input
                    type="checkbox"
                    className="rounded text-[var(--color-maroon)] focus:ring-[var(--color-maroon)]"
                    checked={Boolean(form.isSerialized)}
                    onChange={(event) =>
                      onChange("isSerialized", event.target.checked)
                    }
                  />
                  <span>Serialized item (scans serials)</span>
                </label>
              </div>

              {/* STATUS */}
              <label className="block">
                <span className={labelClass}>Status</span>
                <select
                  className={inputClass}
                  onChange={(event) =>
                    onChange("status", event.target.value)
                  }
                  value={form.status || "ACTIVE"}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </label>
            </div>

            {/* WARRANTY */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded text-[var(--color-maroon)] focus:ring-[var(--color-maroon)]"
                    checked={Boolean(form.hasWarranty)}
                    onChange={(e) => {
                      const checked = e.target.checked
                      onChange("hasWarranty", checked)
                      if (!checked) {
                        onChange("warrantyDuration", "NO WARRANTY")
                      } else if (form.warrantyDuration === "NO WARRANTY") {
                        onChange("warrantyDuration", "1 YEAR WARRANTY")
                      }
                    }}
                  />
                  <span className="text-xs font-bold text-slate-700">Warranty Coverage</span>
                </label>

                {/* 1-click quick presets */}
                <div className="flex gap-1 flex-wrap">
                  {WARRANTY_PRESETS.map((preset) => (
                    <button
                      key={preset.duration}
                      type="button"
                      onClick={() => {
                        onChange("warrantyDuration", preset.duration)
                        onChange("hasWarranty", preset.duration !== "NO WARRANTY")
                      }}
                      className={`rounded-md px-2 py-0.5 text-[10px] font-semibold transition ${
                        (form.warrantyDuration || "").trim().toUpperCase() === preset.duration
                          ? "bg-[var(--color-maroon)] text-white shadow-2xs"
                          : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <input
                className={`${inputClass} bg-white mt-0`}
                placeholder="e.g. 1 YEAR WARRANTY, 3 YEARS DISTRO WARRANTY"
                value={form.warrantyDuration || ""}
                onChange={(event) => {
                  const val = event.target.value
                  onChange("warrantyDuration", val)
                  onChange("hasWarranty", val.trim().toUpperCase() !== "NO WARRANTY" && Boolean(val.trim()))
                }}
              />
            </div>
          </section>

          {/* 4. Pricing & Stock Thresholds */}
          <section className="space-y-2 pt-2 border-t border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Prices & Stock Thresholds
            </span>

            <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-4">
              <label className="block">
                <span className={`${labelClass} text-slate-600 font-semibold`}>Cost Price</span>
                <input
                  className={`${inputClass} font-mono`}
                  min="0"
                  onChange={(event) =>
                    onChange("costPrice", event.target.value)
                  }
                  step="0.01"
                  type="number"
                  value={form.costPrice}
                />
              </label>

              {PRICE_FIELDS.map((field) => (
                <label className="block" key={field.key}>
                  <span className={labelClass}>{field.label}</span>
                  <input
                    className={`${inputClass} font-mono`}
                    min="0"
                    onChange={(event) =>
                      onChange(field.key, event.target.value)
                    }
                    step="0.01"
                    type="number"
                    value={form[field.key]}
                  />
                </label>
              ))}

              <label className="block">
                <span className={labelClass}>Minimum Stock</span>
                <input
                  className={`${inputClass} font-mono`}
                  min="0"
                  onChange={(event) =>
                    onChange("minimumStock", event.target.value)
                  }
                  step="0.01"
                  type="number"
                  value={form.minimumStock}
                />
              </label>

              <label className="block">
                <span className={labelClass}>Reorder Level</span>
                <input
                  className={`${inputClass} font-mono`}
                  min="0"
                  onChange={(event) =>
                    onChange("reorderLevel", event.target.value)
                  }
                  step="0.01"
                  type="number"
                  value={form.reorderLevel}
                />
              </label>
            </div>
          </section>
        </div>

        {/* Minimalist Footer */}
        <footer className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-3">
          <button
            className="rounded-lg px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>

          <button
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--color-maroon)] px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[var(--color-maroon-hover)] transition disabled:opacity-50"
            disabled={isSaving}
            type="submit"
          >
            <Save size={13} />
            {isSaving
              ? "Saving…"
              : isEditing
                ? "Save Changes"
                : "Create Item"}
          </button>
        </footer>
      </form>
    </div>
  )
}

function PriceEditorModal({
  errorMessage,
  item,
  onChangePrice,
  onClose,
  onSave,
  priceForm,
  isSaving,
}) {
  if (!item) return null

  const inputClass =
    "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none transition focus:border-[var(--color-maroon)] focus:ring-1 focus:ring-[var(--color-maroon)] hover:border-slate-300 placeholder:text-slate-400"

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 px-4 py-6 backdrop-blur-xs">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50/75 px-5 py-3.5">
          <div className="min-w-0">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-maroon)]">
              Pricing Management
            </span>
            <h2 className="truncate text-base font-black text-slate-900 leading-tight">
              {item.itemName}
            </h2>
            <p className="text-xs font-semibold text-slate-500 font-mono">
              {item.itemCode}
            </p>
          </div>

          <button
            className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 p-5">
          {errorMessage ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
              <AlertCircle className="mt-0.5 shrink-0" size={15} />
              <span>{errorMessage}</span>
            </div>
          ) : null}

          <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3">
            {PRICE_FIELDS.map((field) => (
              <label className="block" key={field.key}>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  {field.label}
                </span>
                <input
                  className={`${inputClass} font-mono`}
                  min="0"
                  onChange={(event) => onChangePrice(field.key, event.target.value)}
                  step="any"
                  type="number"
                  value={priceForm[field.key]}
                />
              </label>
            ))}
          </div>

          <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500 border border-slate-200">
            Updates selling price tiers only. Cost and inventory stocks remain intact.
          </p>
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
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--color-maroon)] px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[var(--color-maroon-hover)] transition disabled:opacity-50"
            disabled={isSaving}
            onClick={onSave}
            type="button"
          >
            <Save size={14} />
            {isSaving ? "Saving…" : "Save prices"}
          </button>
        </div>
      </section>
    </div>
  )
}

function ItemMobileCard({ canManagePrices, canViewCost, item, onEditPrices }) {
  return (
    <article className="rounded-3xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-[var(--color-text-strong)]">
            {item.itemName}
          </p>
          <p className="mt-1 text-xs font-bold text-[var(--color-muted)]">
            {item.itemCode}
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {[item.brand, item.modelName].filter(Boolean).join(" • ") || "No brand/model"}
          </p>
        </div>

        <StatusPill status={item.status} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-[var(--color-soft)] p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
            Branch
          </p>
          <p className="mt-1 font-bold text-[var(--color-text-strong)]">
            {item.branch?.code || "—"}
          </p>
        </div>

        <div className="rounded-2xl bg-[var(--color-soft)] p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
            Unit
          </p>
          <p className="mt-1 font-bold text-[var(--color-text-strong)]">
            {item.unit?.name || "—"}
          </p>
        </div>

        <div className="col-span-2 rounded-2xl bg-[var(--color-soft)] p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
            Category
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 font-bold text-[var(--color-text-strong)]">
            {item.category?.parent ? (
              <>
                <span className="text-xs font-semibold text-[var(--color-muted)]">
                  {item.category.parent.name}
                </span>
                <span className="text-xs text-[var(--color-muted)]">›</span>
              </>
            ) : null}
            <span>{item.category?.name || "—"}</span>
            {item.attributes && Object.keys(item.attributes).length > 0 ? (
              <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-[var(--color-maroon-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-maroon)]">
                <Tag size={11} /> {Object.keys(item.attributes).length} specs
              </span>
            ) : (!item.category?.parentId ? (
              <span className="ml-auto inline-flex items-center gap-1 rounded bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 text-[10px] font-bold" title="Main Category (Needs Subcategory Alignment)">
                ⚠️ Needs Subcategory
              </span>
            ) : null)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        {PRICE_FIELDS.map((field) => (
          <div key={field.key}>
            <p className="text-xs font-bold text-[var(--color-muted)]">{field.label}</p>
            <p className="font-bold text-[var(--color-text-strong)]">
              {formatMoney(item[field.key])}
            </p>
          </div>
        ))}

        {canViewCost ? (
          <div>
            <p className="text-xs font-bold text-[var(--color-muted)]">Cost</p>
            <p className="font-bold text-[var(--color-text-strong)]">
              {formatMoney(item.costPrice)}
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-[var(--color-soft)] px-3 py-1 text-xs font-bold text-[var(--color-muted)]">
          {formatFlag(item.isSerialized, "Serialized", "Non-serialized")}
        </span>
        <span className="rounded-full bg-[var(--color-soft)] px-3 py-1 text-xs font-bold text-[var(--color-muted)]">
          {formatFlag(item.hasWarranty, "With warranty", "No warranty")}
        </span>
      </div>

      {canManagePrices ? (
        <button
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--color-maroon)] bg-white px-4 py-3 text-sm font-bold text-[var(--color-maroon)] transition hover:bg-[var(--color-maroon-soft)]"
          onClick={() => onEditPrices(item)}
          type="button"
        >
          <Edit3 size={16} />
          Edit prices
        </button>
      ) : null}
    </article>
  )
}

function ItemsPage({ onNavigate, selectedBranch, user }) {
  const selectedBranchId = selectedBranch?.id
  const [items, setItems] = useState([])
  const [pagination, setPagination] = useState(null)
  const [searchText, setSearchText] = useState("")
  const [mainCatFilter, setMainCatFilter] = useState("")
  const [subCatFilter, setSubCatFilter] = useState("")
  const [brandFilter, setBrandFilter] = useState("")
  const [capacityFilter, setCapacityFilter] = useState("")
  const [speedFilter, setSpeedFilter] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [specSearch, setSpecSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [serializedFilter, setSerializedFilter] = useState("")
  const [warrantyFilter, setWarrantyFilter] = useState("")
  const [unitFilter, setUnitFilter] = useState("")
  const [categoryOptions, setCategoryOptions] = useState([])
  const [unitOptions, setUnitOptions] = useState([])
  const [isDetailedFiltersOpen, setIsDetailedFiltersOpen] = useState(false)
  const [page, setPage] = useState(1)
  const pageSize = 25
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [selectedItem, setSelectedItem] = useState(null)
  const [detailItem, setDetailItem] = useState(null)
  const [priceForm, setPriceForm] = useState({
    price1: "",
    price2: "",
    price3: "",
    price4: "",
    price5: "",
  })
  const [priceErrorMessage, setPriceErrorMessage] = useState("")
  const [isSavingPrices, setIsSavingPrices] = useState(false)

  const [editingItem, setEditingItem] = useState(undefined)
  const [itemForm, setItemForm] = useState(null)
  const [itemEditorError, setItemEditorError] = useState("")
  const [isSavingItem, setIsSavingItem] = useState(false)

  const canManageCatalog = useMemo(() => OWNER_ROLES.has(user?.role), [user?.role])
  const canAdjustPrices = true
  const canManagePrices = true
  const canViewCost = true

  const mainCategories = useMemo(() => {
    return categoryOptions.filter((c) => !c.parentId || c.parentId === "")
  }, [categoryOptions])

  const subcategoryOptions = useMemo(() => {
    if (!mainCatFilter) {
      return categoryOptions.filter((c) => Boolean(c.parentId))
    }
    return categoryOptions.filter((c) => c.parentId === mainCatFilter)
  }, [categoryOptions, mainCatFilter])

  const effectiveCategoryId = subCatFilter || mainCatFilter || ""

  const activeDetailedFilterCount = useMemo(() => {
    let count = 0
    if (brandFilter.trim()) count++
    if (capacityFilter) count++
    if (speedFilter) count++
    if (typeFilter) count++
    if (specSearch.trim()) count++
    if (unitFilter) count++
    if (statusFilter) count++
    if (serializedFilter) count++
    if (warrantyFilter) count++
    return count
  }, [brandFilter, capacityFilter, speedFilter, typeFilter, specSearch, unitFilter, statusFilter, serializedFilter, warrantyFilter])

  const displayedItems = useMemo(() => {
    return items.filter((item) =>
      matchesItemAttributes(item, {
        capacity: capacityFilter,
        speed: speedFilter,
        type: typeFilter,
        specSearch: specSearch,
      })
    )
  }, [items, capacityFilter, speedFilter, typeFilter, specSearch])

  const loadFilterOptions = useCallback(async () => {
    try {
      const categoryParams = {
        limit: 250,
      }

      if (selectedBranchId) {
        categoryParams.branchId = selectedBranchId
      }

      const [categoriesResponse, unitsResponse] = await Promise.all([
        getItemCategories(categoryParams),
        getUnits({ limit: 100 }),
      ])

      const categories = categoriesResponse?.data?.items
      const units = unitsResponse?.data?.items

      setCategoryOptions(Array.isArray(categories) ? categories : [])
      setUnitOptions(Array.isArray(units) ? units : [])
    } catch {
      setCategoryOptions([])
      setUnitOptions([])
    }
  }, [selectedBranchId])

  const loadItems = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage("")

    try {
      const params = {
        page,
        limit: pageSize,
      }

      if (searchText.trim()) {
        params.search = searchText.trim()
      }

      if (selectedBranchId) {
        params.branchId = selectedBranchId
      }

      if (statusFilter) {
        params.status = statusFilter
      }

      if (serializedFilter) {
        params.isSerialized = serializedFilter
      }

      if (warrantyFilter) {
        params.hasWarranty = warrantyFilter
      }

      if (effectiveCategoryId) {
        params.categoryId = effectiveCategoryId
      }

      if (brandFilter.trim()) {
        params.brand = brandFilter.trim()
      }

      if (unitFilter) {
        params.unitId = unitFilter
      }

      const response = await getItems(params)
      const result = response?.data || {}

      setItems(Array.isArray(result.items) ? result.items : [])
      setPagination(result.pagination || null)
    } catch {
      setErrorMessage("Unable to load items right now. Please refresh and try again.")
      setItems([])
      setPagination(null)
    } finally {
      setIsLoading(false)
    }
  }, [effectiveCategoryId, brandFilter, page, pageSize, searchText, selectedBranchId, serializedFilter, statusFilter, unitFilter, warrantyFilter])

  const openDetailModal = (item) => {
    setDetailItem(item)
  }

  const closeDetailModal = () => {
    setDetailItem(null)
  }

  const clearFilters = () => {
    setSearchText("")
    setMainCatFilter("")
    setSubCatFilter("")
    setBrandFilter("")
    setCapacityFilter("")
    setSpeedFilter("")
    setTypeFilter("")
    setSpecSearch("")
    setUnitFilter("")
    setStatusFilter("")
    setSerializedFilter("")
    setWarrantyFilter("")
    setPage(1)
  }

  const handleExportItemsExcel = async () => {
    try {
      const params = {
        branchId: selectedBranchId,
      }
      if (searchText.trim()) params.search = searchText.trim()
      if (statusFilter) params.status = statusFilter
      if (serializedFilter) params.isSerialized = serializedFilter
      if (effectiveCategoryId) params.categoryId = effectiveCategoryId
      if (brandFilter.trim()) params.brand = brandFilter.trim()
      if (unitFilter) params.unitId = unitFilter

      const exportItems = []
      let exportPage = 1
      let totalPages = 1

      do {
        const response = await getItems({
          ...params,
          page: exportPage,
          limit: 50,
        })
        const result = response?.data || {}
        const pageItems = Array.isArray(result.items)
          ? result.items
          : Array.isArray(result.data)
          ? result.data
          : []
        exportItems.push(...pageItems)
        totalPages = Math.max(1, Number(result.pagination?.totalPages || 1))
        exportPage += 1
      } while (exportPage <= totalPages)

      const filteredExportItems = exportItems.filter((item) =>
        matchesItemAttributes(item, {
          capacity: capacityFilter,
          speed: speedFilter,
          type: typeFilter,
          specSearch: specSearch,
        })
      )

      const exportColumns = [
        ["Item Code", (row) => row.itemCode || "—"],
        ["Item Name", (row) => row.itemName || "—"],
        ["Barcode", (row) => row.barcode || "—"],
        ["Brand", (row) => row.brand || "—"],
        ["Model", (row) => row.modelName || "—"],
        ["Category", (row) => row.category?.name || row.categoryName || "—"],
        ["Unit", (row) => row.unit?.name || row.unitName || "—"],
        ["Specifications", (row) => formatSpecs(row.attributes)],
        ["Serialized", (row) => (row.isSerialized ? "Yes" : "No")],
        ["Warranty", (row) => parseItemWarranty(row)],
        ["Min Stock", (row) => Number(row.minStock || 0)],
        ["Reorder Level", (row) => Number(row.reorderLevel || 0)],
        ["Cost Price", (row) => Number(row.costPrice || 0)],
        ["Price 1", (row) => Number(row.price1 || 0)],
        ["Price 2", (row) => Number(row.price2 || 0)],
        ["Price 3", (row) => Number(row.price3 || 0)],
        ["Price 4", (row) => Number(row.price4 || 0)],
        ["Price 5", (row) => Number(row.price5 || 0)],
        ["Status", (row) => row.status || (row.isActive ? "ACTIVE" : "INACTIVE")],
      ]

      const excelFilters = [
        ["Search Query", searchText.trim() || "All items"],
        [
          "Category Filter",
          categoryOptions.find((c) => c.id === effectiveCategoryId)?.name || "All categories",
        ],
        ["Brand Filter", brandFilter.trim() || "All brands"],
        ["Status Filter", statusFilter || "All statuses"],
        ["Serialized Only", serializedFilter ? "Yes" : "All"],
      ]
      if (capacityFilter) excelFilters.push(["Capacity Filter", capacityFilter])
      if (speedFilter) excelFilters.push(["Speed Filter", speedFilter])
      if (typeFilter) excelFilters.push(["Type Filter", typeFilter])
      if (specSearch.trim()) excelFilters.push(["Spec Search", specSearch.trim()])

      exportReportExcel({
        label: "Product Catalog",
        filename: `Product-Catalog-${new Date().toISOString().slice(0, 10)}`,
        columns: exportColumns,
        records: filteredExportItems,
        branch: selectedBranch,
        generatedBy: user,
        filters: excelFilters,
        totals: [
          ["Total Catalog Items", filteredExportItems.length],
        ],
      })
    } catch (error) {
      setErrorMessage(
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        "Could not export product catalog to Excel."
      )
    }
  }

  const openNewItem = () => {
    setEditingItem(null)
    setItemEditorError("")
    setItemForm({ ...EMPTY_ITEM_FORM })
  }

  const openItemEditor = (item) => {
    setEditingItem(item)
    setItemEditorError("")
    setItemForm(itemToForm(item))
  }

  const closeItemEditor = () => {
    if (isSavingItem) return

    setEditingItem(undefined)
    setItemForm(null)
    setItemEditorError("")
  }

  const updateItemForm = (field, value) => {
    setItemForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const saveItem = async () => {
    if (!itemForm || isSavingItem) return

    if (!itemForm.itemName.trim()) {
      setItemEditorError("Product Name is required.")
      return
    }

    if (!itemForm.categoryId) {
      setItemEditorError("Category is required.")
      return
    }

    if (!itemForm.unitId) {
      setItemEditorError("Unit is required.")
      return
    }

    // Completeness check against category specification schema
    const targetCategory = categoryOptions.find((c) => c.id === itemForm.categoryId)
    const hasChildSubcategories = categoryOptions.some((c) => c.parentId === itemForm.categoryId)
    if (hasChildSubcategories) {
      setItemEditorError(
        `Category alignment required: Please select a specific Subcategory for "${targetCategory?.name || "Main Category"}" before saving.`
      )
      return
    }

    const requiredSpecs = Array.isArray(targetCategory?.attributeSchema) ? targetCategory.attributeSchema : []
    if (requiredSpecs.length > 0) {
      const missing = requiredSpecs.filter((spec) => {
        const val = itemForm.attributes?.[spec.name]
        return val === undefined || val === null || String(val).trim() === ""
      })
      if (missing.length > 0) {
        setItemEditorError(
          `Please fill in all specifications for ${targetCategory.name}: missing ${missing.map((s) => s.name).join(", ")}. Enter "None" or "N/A" if not applicable.`
        )
        return
      }
    }

    setIsSavingItem(true)
    setItemEditorError("")

    const cleanDesc = stripWarrantyTag(itemForm.description)
    const warrantyStr = (itemForm.warrantyDuration || "1 YEAR WARRANTY").trim()
    const packagedDesc = warrantyStr
      ? (cleanDesc ? `${cleanDesc} [WARRANTY: ${warrantyStr}]` : `[WARRANTY: ${warrantyStr}]`)
      : (cleanDesc || null)

    const cleanedAttributes = {}
    if (itemForm.attributes && typeof itemForm.attributes === "object") {
      Object.entries(itemForm.attributes).forEach(([key, val]) => {
        if (val !== undefined && val !== null && String(val).trim() !== "") {
          cleanedAttributes[key] = String(val).trim()
        }
      })
    }

    const payload = {
      ...(itemForm.itemCode.trim()
        ? { itemCode: itemForm.itemCode.trim().toUpperCase() }
        : {}),
      itemName: itemForm.itemName.trim(),
      description: packagedDesc,
      barcode: itemForm.barcode.trim() || null,
      brand: itemForm.brand.trim() || null,
      modelName: itemForm.modelName.trim() || null,
      categoryId: itemForm.categoryId,
      unitId: itemForm.unitId,
      attributes: Object.keys(cleanedAttributes).length > 0 ? cleanedAttributes : null,
      isSerialized: Boolean(itemForm.isSerialized),
      hasWarranty: warrantyStr !== "NO WARRANTY" && Boolean(warrantyStr),
      ...(canAdjustPrices
        ? {
            costPrice: numberValue(itemForm.costPrice),
            price1: numberValue(itemForm.price1),
            price2: numberValue(itemForm.price2),
            price3: numberValue(itemForm.price3),
            price4: numberValue(itemForm.price4),
            price5: numberValue(itemForm.price5),
          }
        : {}),
      minimumStock: numberValue(itemForm.minimumStock),
      reorderLevel: numberValue(itemForm.reorderLevel),
    }

    try {
      let response

      if (editingItem?.id) {
        response = await updateItemById(editingItem.id, {
          ...payload,
          status: itemForm.status,
        })
      } else {
        response = await createItem({
          ...payload,
          ...(selectedBranchId ? { branchId: selectedBranchId } : {}),
        })
      }

      const savedItem = response?.data

      if (!response?.success || !savedItem) {
        throw new Error("Invalid item response.")
      }

      if (savedItem?.id && warrantyStr) {
        try {
          localStorage.setItem(`item_warranty_${savedItem.id}`, warrantyStr)
        } catch {
          // ignore storage error
        }
      }

      setItemForm(null)
      setEditingItem(undefined)
      await loadItems()
    } catch (error) {
      setItemEditorError(
        getItemApiError(
          error,
          editingItem?.id
            ? "Unable to update this item."
            : "Unable to create this item.",
        ),
      )
    } finally {
      setIsSavingItem(false)
    }
  }
  const openPriceEditor = (item) => {
    setSelectedItem(item)
    setPriceErrorMessage("")
    setPriceForm({
      price1: String(item.price1 ?? ""),
      price2: String(item.price2 ?? ""),
      price3: String(item.price3 ?? ""),
      price4: String(item.price4 ?? ""),
      price5: String(item.price5 ?? ""),
    })
  }

  const closePriceEditor = () => {
    if (isSavingPrices) return

    setSelectedItem(null)
    setPriceErrorMessage("")
  }

  const handlePriceChange = (field, value) => {
    setPriceForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const savePrices = async () => {
    if (!selectedItem) return

    setIsSavingPrices(true)
    setPriceErrorMessage("")

    try {
      const payload = {
        price1: Number(priceForm.price1 || 0),
        price2: Number(priceForm.price2 || 0),
        price3: Number(priceForm.price3 || 0),
        price4: Number(priceForm.price4 || 0),
        price5: Number(priceForm.price5 || 0),
      }

      const response = await updateItemById(selectedItem.id, payload)
      const updatedItem = response?.data

      if (!response?.success || !updatedItem) {
        throw new Error("Unable to save prices.")
      }

      setItems((currentItems) =>
        currentItems.map((item) => (item.id === updatedItem.id ? updatedItem : item)),
      )
      setSelectedItem(null)
    } catch {
      setPriceErrorMessage("Unable to save prices. Please check the values and try again.")
    } finally {
      setIsSavingPrices(false)
    }
  }

  useEffect(() => {
    // Branch changes intentionally reset branch-specific filters and pagination.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMainCatFilter("")
    setSubCatFilter("")
    setPage(1)
    loadFilterOptions()
  }, [loadFilterOptions])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadItems()
    }, 300)

    return () => window.clearTimeout(timer)
  }, [loadItems])

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--color-accent)]">
            Item Catalog
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text-strong)]">
            Product catalog
          </h1>
          <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
            View item details, selling prices, category, unit, and branch assignment.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ExportExcelButton
            filteredCount={pagination?.totalItems ?? items.length}
            label="Export Catalog (.xlsx)"
            onExport={handleExportItemsExcel}
          />

          {canManageCatalog ? (
            <button
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-maroon)] px-4 py-3 text-sm font-bold text-white shadow-sm"
              onClick={openNewItem}
              type="button"
            >
              <Plus size={17} />
              New item
            </button>
          ) : null}

          <button
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--color-text-strong)] shadow-sm transition hover:bg-[var(--color-soft)]"
            onClick={loadItems}
            type="button"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      <section className="rounded-3xl border border-[var(--color-border)] bg-white p-4 shadow-card space-y-3.5">
        {/* Row 1: Search, result count, and reset */}
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"
              size={18}
            />
            <input
              className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-soft)] py-3 pl-11 pr-4 text-sm font-semibold text-[var(--color-text-strong)] outline-none transition focus:border-[var(--color-accent)] focus:bg-white"
              onChange={(event) => {
                setSearchText(event.target.value)
                setPage(1)
              }}
              placeholder="Scan barcode / Search Item Code / Product Name / Model"
              value={searchText}
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="rounded-2xl bg-[var(--color-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-muted)]">
              Showing {displayedItems.length} of {pagination?.totalItems ?? items.length} item(s)
            </div>

            <button
              className={`rounded-2xl border px-4 py-3 text-sm font-bold transition inline-flex items-center gap-2 ${
                isDetailedFiltersOpen || activeDetailedFilterCount > 0
                  ? "border-[var(--color-maroon)] bg-[var(--color-maroon)]/5 text-[var(--color-maroon)]"
                  : "border-[var(--color-border)] bg-white text-[var(--color-text-strong)] hover:bg-[var(--color-soft)]"
              }`}
              onClick={() => setIsDetailedFiltersOpen((prev) => !prev)}
              type="button"
            >
              <SlidersHorizontal size={15} />
              Detailed Filters
              {activeDetailedFilterCount > 0 ? (
                <span className="rounded-full bg-[var(--color-maroon)] text-white text-[10px] font-black px-1.5 py-0.2">
                  {activeDetailedFilterCount}
                </span>
              ) : null}
            </button>

            <button
              className="rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--color-text-strong)] transition hover:bg-[var(--color-soft)]"
              onClick={clearFilters}
              type="button"
            >
              Clear filters
            </button>
          </div>
        </div>

        {/* Row 2: Category Hierarchy & Brand Selectors */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className="block">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
                Main Category
              </span>
              {onNavigate ? (
                <button
                  className="text-[10px] font-bold text-[var(--color-maroon)] hover:underline flex items-center gap-0.5"
                  onClick={() => onNavigate("categories")}
                  title="Manage categories in File Maintenance"
                  type="button"
                >
                  Manage ↗
                </button>
              ) : null}
            </div>
            <select
              className="mt-1.5 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-soft)] px-4 py-2.5 text-sm font-bold text-[var(--color-text-strong)] outline-none transition focus:border-[var(--color-accent)] focus:bg-white"
              onChange={(event) => {
                setMainCatFilter(event.target.value)
                setSubCatFilter("")
                setPage(1)
              }}
              value={mainCatFilter}
            >
              <option value="">All Main Categories</option>
              {mainCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
              Subcategory / Product Type
            </span>
            <select
              className="mt-1.5 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-soft)] px-4 py-2.5 text-sm font-bold text-[var(--color-text-strong)] outline-none transition focus:border-[var(--color-accent)] focus:bg-white disabled:opacity-50"
              disabled={subcategoryOptions.length === 0}
              onChange={(event) => {
                setSubCatFilter(event.target.value)
                setPage(1)
              }}
              value={subCatFilter}
            >
              <option value="">
                {mainCatFilter
                  ? `All Subcategories in ${mainCategories.find((c) => c.id === mainCatFilter)?.name || ""}`
                  : "All Subcategories"}
              </option>
              {subcategoryOptions.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
              Brand
            </span>
            <div className="relative mt-1.5">
              <input
                list="brand-suggestions-items"
                className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-soft)] px-4 py-2.5 text-sm font-bold text-[var(--color-text-strong)] outline-none transition focus:border-[var(--color-accent)] focus:bg-white placeholder:text-slate-400 placeholder:font-normal"
                onChange={(event) => {
                  setBrandFilter(event.target.value)
                  setPage(1)
                }}
                placeholder="All Brands or type brand..."
                value={brandFilter}
              />
              <datalist id="brand-suggestions-items">
                {POPULAR_BRANDS.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>
          </label>
        </div>

        {/* Detailed Specification & Attribute Shelf (Collapsible) */}
        {isDetailedFiltersOpen ? (
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/30 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                <SlidersHorizontal size={14} />
                Specification & Attribute Filters
              </span>
              <span className="text-[11px] font-semibold text-indigo-700">
                Filter precisely by GB capacity, speed, socket/generation, or custom attributes
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                  Capacity / Storage / RAM
                </span>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none transition focus:border-[var(--color-maroon)]"
                  onChange={(event) => setCapacityFilter(event.target.value)}
                  value={capacityFilter}
                >
                  <option value="">Any Capacity</option>
                  {CAPACITY_PRESETS.map((cap) => (
                    <option key={cap} value={cap}>
                      {cap}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                  Speed / Frequency / Hz
                </span>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none transition focus:border-[var(--color-maroon)]"
                  onChange={(event) => setSpeedFilter(event.target.value)}
                  value={speedFilter}
                >
                  <option value="">Any Speed</option>
                  {SPEED_PRESETS.map((spd) => (
                    <option key={spd} value={spd}>
                      {spd}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                  Type / Generation / Socket
                </span>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none transition focus:border-[var(--color-maroon)]"
                  onChange={(event) => setTypeFilter(event.target.value)}
                  value={typeFilter}
                >
                  <option value="">Any Type / Socket</option>
                  {TYPE_PRESETS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                  Custom Attribute Search
                </span>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none transition focus:border-[var(--color-maroon)] placeholder:text-slate-400 placeholder:font-normal"
                  onChange={(event) => setSpecSearch(event.target.value)}
                  placeholder="e.g. Gold, White, ATX, 750W, CL16..."
                  value={specSearch}
                />
              </label>
            </div>

            {/* Standard Catalog Filters */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 pt-2 border-t border-indigo-100/70">
              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                  Unit
                </span>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none transition focus:border-[var(--color-maroon)]"
                  onChange={(event) => {
                    setUnitFilter(event.target.value)
                    setPage(1)
                  }}
                  value={unitFilter}
                >
                  <option value="">All units</option>
                  {unitOptions.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                  Status
                </span>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none transition focus:border-[var(--color-maroon)]"
                  onChange={(event) => {
                    setStatusFilter(event.target.value)
                    setPage(1)
                  }}
                  value={statusFilter}
                >
                  <option value="">All status</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </label>

              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                  Tracking
                </span>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none transition focus:border-[var(--color-maroon)]"
                  onChange={(event) => {
                    setSerializedFilter(event.target.value)
                    setPage(1)
                  }}
                  value={serializedFilter}
                >
                  <option value="">All tracking</option>
                  <option value="true">Serialized</option>
                  <option value="false">Non-serialized</option>
                </select>
              </label>

              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                  Warranty
                </span>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none transition focus:border-[var(--color-maroon)]"
                  onChange={(event) => {
                    setWarrantyFilter(event.target.value)
                    setPage(1)
                  }}
                  value={warrantyFilter}
                >
                  <option value="">All warranty</option>
                  <option value="true">With warranty</option>
                  <option value="false">No warranty</option>
                </select>
              </label>
            </div>
          </div>
        ) : null}

        {/* Active Filter Chips */}
        {mainCatFilter || subCatFilter || brandFilter || capacityFilter || speedFilter || typeFilter || specSearch || unitFilter || statusFilter || serializedFilter || warrantyFilter ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">
              Active Filters:
            </span>
            {mainCatFilter ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                Main: {categoryOptions.find((c) => c.id === mainCatFilter)?.name || "Main Category"}
                <button onClick={() => { setMainCatFilter(""); setSubCatFilter(""); setPage(1) }} className="hover:text-red-600">
                  <X size={12} />
                </button>
              </span>
            ) : null}
            {subCatFilter ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                Sub: {categoryOptions.find((c) => c.id === subCatFilter)?.name || "Subcategory"}
                <button onClick={() => { setSubCatFilter(""); setPage(1) }} className="hover:text-red-600">
                  <X size={12} />
                </button>
              </span>
            ) : null}
            {brandFilter ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-1 text-xs font-semibold text-indigo-800">
                Brand: {brandFilter}
                <button onClick={() => { setBrandFilter(""); setPage(1) }} className="hover:text-red-600">
                  <X size={12} />
                </button>
              </span>
            ) : null}
            {capacityFilter ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs font-semibold text-blue-800">
                Capacity: {capacityFilter}
                <button onClick={() => setCapacityFilter("")} className="hover:text-red-600">
                  <X size={12} />
                </button>
              </span>
            ) : null}
            {speedFilter ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs font-semibold text-amber-800">
                Speed: {speedFilter}
                <button onClick={() => setSpeedFilter("")} className="hover:text-red-600">
                  <X size={12} />
                </button>
              </span>
            ) : null}
            {typeFilter ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 border border-purple-200 px-2.5 py-1 text-xs font-semibold text-purple-800">
                Type/Socket: {typeFilter}
                <button onClick={() => setTypeFilter("")} className="hover:text-red-600">
                  <X size={12} />
                </button>
              </span>
            ) : null}
            {specSearch ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                Spec: "{specSearch}"
                <button onClick={() => setSpecSearch("")} className="hover:text-red-600">
                  <X size={12} />
                </button>
              </span>
            ) : null}
            {unitFilter ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                Unit: {unitOptions.find((u) => u.id === unitFilter)?.name || "Unit"}
                <button onClick={() => { setUnitFilter(""); setPage(1) }} className="hover:text-red-600">
                  <X size={12} />
                </button>
              </span>
            ) : null}
            {statusFilter ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                Status: {statusFilter}
                <button onClick={() => { setStatusFilter(""); setPage(1) }} className="hover:text-red-600">
                  <X size={12} />
                </button>
              </span>
            ) : null}
            {serializedFilter ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {serializedFilter === "true" ? "Serialized" : "Non-serialized"}
                <button onClick={() => { setSerializedFilter(""); setPage(1) }} className="hover:text-red-600">
                  <X size={12} />
                </button>
              </span>
            ) : null}
            {warrantyFilter ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {warrantyFilter === "true" ? "With warranty" : "No warranty"}
                <button onClick={() => { setWarrantyFilter(""); setPage(1) }} className="hover:text-red-600">
                  <X size={12} />
                </button>
              </span>
            ) : null}
            <button onClick={clearFilters} className="text-xs font-bold text-[var(--color-maroon)] hover:underline ml-1">
              Reset all
            </button>
          </div>
        ) : null}
      </section>

      {errorMessage ? (
        <section className="flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-5 text-sm font-semibold leading-6 text-red-700">
          <AlertCircle className="mt-0.5 shrink-0" size={18} />
          <span>{errorMessage}</span>
        </section>
      ) : null}

      <section className="rounded-3xl border border-[var(--color-border)] bg-white shadow-card">
        {isLoading ? (
          <div className="p-6 text-sm font-semibold text-[var(--color-muted)]">
            Loading items... Please wait.
          </div>
        ) : displayedItems.length === 0 ? (
          <div className="grid place-items-center p-8 text-center">
            <PackageSearch className="text-[var(--color-muted)]" size={38} />
            <p className="mt-3 font-bold text-[var(--color-text-strong)]">
              No matching items found
            </p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Try clearing the filters or changing your search.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden lg:block">
              <div className="table-wrapper">
                <table className="w-full min-w-[1250px] border-separate border-spacing-0 text-left text-sm">
                  <thead className="bg-[var(--color-soft)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
                    <tr>
                      <th className="whitespace-nowrap px-3 py-3">Item</th>
                      <th className="whitespace-nowrap px-3 py-3">Branch</th>
                      <th className="whitespace-nowrap px-3 py-3">Category</th>
                      <th className="whitespace-nowrap px-3 py-3">Unit</th>
                      <th className="whitespace-nowrap px-3 py-3">Price 1</th>
                      <th className="whitespace-nowrap px-3 py-3">Price 2</th>
                      <th className="whitespace-nowrap px-3 py-3">Price 3</th>
                      <th className="whitespace-nowrap px-3 py-3">Price 4</th>
                      <th className="whitespace-nowrap px-3 py-3">Price 5</th>
                      {canViewCost ? <th className="whitespace-nowrap px-3 py-3">Cost</th> : null}
                      <th className="whitespace-nowrap px-3 py-3">Tracking</th>
                      <th className="whitespace-nowrap px-3 py-3">Status</th>
                      <th className="whitespace-nowrap px-3 py-3">Action</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[var(--color-border)]">
                    {displayedItems.map((item) => (
                      <tr key={item.id} className="align-top transition hover:bg-[var(--color-soft)]">
                        <td className="min-w-[220px] px-3 py-4">
                          <p className="font-bold text-[var(--color-text-strong)]">
                            {item.itemName}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-[var(--color-muted)]">
                            {item.itemCode}
                          </p>
                          <p className="mt-1 text-xs text-[var(--color-muted)]">
                            {[item.brand, item.modelName].filter(Boolean).join(" • ") || "No brand/model"}
                          </p>
                        </td>

                        <td className="whitespace-nowrap px-3 py-4 font-semibold text-[var(--color-text-strong)]">
                          {item.branch?.code || "—"}
                        </td>

                        <td className="min-w-[160px] px-3 py-4">
                          <div className="flex flex-col gap-0.5">
                            {item.category?.parent ? (
                              <span className="text-[11px] font-semibold text-[var(--color-muted)]">
                                {item.category.parent.name} ›
                              </span>
                            ) : null}
                            <span className="font-semibold text-[var(--color-text-strong)]">
                              {item.category?.name || "—"}
                            </span>
                            {item.attributes && Object.keys(item.attributes).length > 0 ? (
                              <div className="mt-1 flex items-center">
                                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-maroon-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-maroon)]">
                                  <Tag size={10} />
                                  {Object.keys(item.attributes).length} specs
                                </span>
                              </div>
                            ) : (!item.category?.parentId ? (
                              <div className="mt-1 flex items-center">
                                <span className="inline-flex items-center gap-1 rounded bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 text-[10px] font-bold" title="Main Category (Needs Subcategory Alignment)">
                                  ⚠️ Needs Subcategory
                                </span>
                              </div>
                            ) : null)}
                          </div>
                        </td>

                        <td className="whitespace-nowrap px-3 py-4 text-[var(--color-muted)]">
                          {item.unit?.name || "—"}
                        </td>

                        <td className="whitespace-nowrap px-3 py-4 font-semibold text-[var(--color-text-strong)]">
                          {formatMoney(item.price1)}
                        </td>

                        <td className="whitespace-nowrap px-3 py-4 font-semibold text-[var(--color-text-strong)]">
                          {formatMoney(item.price2)}
                        </td>

                        <td className="whitespace-nowrap px-3 py-4 font-semibold text-[var(--color-text-strong)]">
                          {formatMoney(item.price3)}
                        </td>

                        <td className="whitespace-nowrap px-3 py-4 font-semibold text-[var(--color-text-strong)]">
                          {formatMoney(item.price4)}
                        </td>

                        <td className="whitespace-nowrap px-3 py-4 font-semibold text-[var(--color-text-strong)]">
                          {formatMoney(item.price5)}
                        </td>

                        {canViewCost ? (
                          <td className="whitespace-nowrap px-3 py-4 font-semibold text-[var(--color-text-strong)]">
                            {formatMoney(item.costPrice)}
                          </td>
                        ) : null}

                        <td className="min-w-[120px] px-3 py-4 text-xs font-semibold leading-6 text-[var(--color-muted)]">
                          <p>{formatFlag(item.isSerialized, "Serialized", "Non-serialized")}</p>
                          <p>{formatFlag(item.hasWarranty, "With warranty", "No warranty")}</p>
                        </td>

                        <td className="whitespace-nowrap px-3 py-4">
                          <StatusPill status={item.status} />
                        </td>

                        <td className="whitespace-nowrap px-3 py-4">
                          <div className="flex flex-col gap-2">
                            <button
                              className="inline-flex items-center justify-center rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-bold text-[var(--color-text-strong)] transition hover:bg-[var(--color-soft)]"
                              onClick={() => openDetailModal(item)}
                              type="button"
                            >
                              View details
                            </button>

                            {canManageCatalog ? (
                              <button
                                className="inline-flex items-center justify-center gap-1 rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-bold text-[var(--color-text-strong)] transition hover:bg-[var(--color-soft)]"
                                onClick={() => openItemEditor(item)}
                                type="button"
                              >
                                <Edit3 size={14} />
                                Edit item
                              </button>
                            ) : null}

                            {canManagePrices ? (
                              <button
                                className="inline-flex items-center justify-center gap-1 rounded-xl border border-[var(--color-maroon)] bg-white px-3 py-2 text-xs font-bold text-[var(--color-maroon)] transition hover:bg-[var(--color-maroon-soft)]"
                                onClick={() => openPriceEditor(item)}
                                type="button"
                              >
                                <Edit3 size={14} />
                                Edit prices
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-4 p-4 lg:hidden">
              {displayedItems.map((item) => (
                <ItemMobileCard
                  canManagePrices={canManagePrices}
                  canViewCost={canViewCost}
                  item={item}
                  key={item.id}
                  onEditPrices={openPriceEditor}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {pagination ? (
        <section className="flex flex-col gap-3 rounded-3xl border border-[var(--color-border)] bg-white p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold text-[var(--color-muted)]">
            Page {pagination.page} of {pagination.totalPages} • {pagination.totalItems} item(s)
          </div>

          <div className="flex gap-3">
            <button
              className="rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--color-text-strong)] transition hover:bg-[var(--color-soft)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!pagination.hasPreviousPage || isLoading}
              onClick={() => setPage((currentPage) => Math.max(currentPage - 1, 1))}
              type="button"
            >
              Previous
            </button>

            <button
              className="rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--color-text-strong)] transition hover:bg-[var(--color-soft)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!pagination.hasNextPage || isLoading}
              onClick={() => setPage((currentPage) => currentPage + 1)}
              type="button"
            >
              Next
            </button>
          </div>
        </section>
      ) : null}

      <ItemEditorModal
        canAdjustPrices={canAdjustPrices}
        categories={categoryOptions}
        errorMessage={itemEditorError}
        form={itemForm}
        isEditing={Boolean(editingItem?.id)}
        isSaving={isSavingItem}
        onChange={updateItemForm}
        onClose={closeItemEditor}
        onNavigate={onNavigate}
        onSave={saveItem}
        units={unitOptions}
      />

      <ItemDetailModal
        canViewCost={canViewCost}
        item={detailItem}
        onClose={closeDetailModal}
      />
      <PriceEditorModal
        errorMessage={priceErrorMessage}
        isSaving={isSavingPrices}
        item={selectedItem}
        onChangePrice={handlePriceChange}
        onClose={closePriceEditor}
        onSave={savePrices}
        priceForm={priceForm}
      />
    </div>
  )
}

export default ItemsPage




























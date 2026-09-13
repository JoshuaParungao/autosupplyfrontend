import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import * as XLSX from "xlsx"
import { parseQuotationSettlement } from "./quotationSettlement"

const MAROON = [122, 31, 43]
const DARK = [31, 41, 55]
const MUTED = [100, 116, 139]
const BORDER = [226, 232, 240]
const BG_LIGHT = [248, 250, 252]

export const INSTALLMENT_TERM_MONTHS = {
  STRAIGHT: 1,
  MONTH_3: 3,
  MONTH_6: 6,
  MONTH_9: 9,
  MONTH_12: 12,
  MONTH_18: 18,
  MONTH_24: 24,
}

const DEFAULT_TERM_RATES = {
  CASH_PROMO: 1.0,
  STRAIGHT: 0.96,
  MONTH_3: 0.95,
  MONTH_6: 0.92,
  MONTH_9: 0.9,
  MONTH_12: 0.875,
  MONTH_18: 0.82,
  MONTH_24: 0.78,
  TERM_3M: 0.95,
  TERM_6M: 0.92,
  TERM_9M: 0.9,
  TERM_12M: 0.875,
  TERM_18M: 0.82,
  TERM_24M: 0.78,
}

/**
 * Universal Sanitizer for PDF Text Rendering.
 * Strips/normalizes Unicode glyphs that break jsPDF WinAnsiEncoding into '+++' or corrupted characters.
 */
export function sanitizeForPdf(value) {
  if (value === null || value === undefined) return ""
  let str = String(value)

  // Replace Philippine Peso sign
  str = str.replace(/₱/g, "PHP ")

  // Replace various dashes with standard ASCII hyphen
  str = str.replace(/[\u2010\u2012\u2013\u2014\u2015\u2212]/g, " - ")

  // Replace bullets and list marks
  str = str.replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, "-")

  // Replace smart quotes and primes
  str = str.replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
  str = str.replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')

  // Replace ellipsis
  str = str.replace(/\u2026/g, "...")

  // Replace non-breaking spaces & thin spaces
  str = str.replace(/[\u00A0\u202F\u2007\u200B]/g, " ")

  // Remove any remaining unsupported non-ASCII control characters that cause jsPDF artifacts
  str = str.replace(/[^\x20-\x7E\r\n\t]/g, "")

  // Normalize duplicate spaces
  str = str.replace(/ {2,}/g, " ").trim()

  return str
}

/**
 * Universal Sanitizer for Excel (XLSX/CSV) Text.
 */
export function sanitizeExcelText(value) {
  if (value === null || value === undefined) return ""
  let str = String(value)

  str = str.replace(/₱/g, "PHP ")
  str = str.replace(/[\u2010\u2012\u2013\u2014\u2015\u2212]/g, " - ")
  str = str.replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, "-")
  str = str.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
  str = str.replace(/[\u00A0\u202F\u2007\u200B]/g, " ")
  str = str.replace(/ {2,}/g, " ").trim()

  return str
}

function number(value) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function text(value, fallback = "-") {
  const normalized = sanitizeForPdf(value)
  return normalized || fallback
}

function php(value) {
  return `PHP ${number(value).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function quantity(value) {
  return number(value).toLocaleString("en-PH", {
    maximumFractionDigits: 2,
  })
}

function dateText(value) {
  if (!value) return "-"

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return text(value)
  }

  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  })
}

function dateTimeText(value = new Date()) {
  const date = new Date(value)

  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function branchText(branch) {
  if (!branch) return "All Branches / Consolidated"

  const code = sanitizeForPdf(branch.code || "")
  const name = sanitizeForPdf(branch.name || "")

  if (code && name) return `${code} - ${name}`
  return code || name || "All Branches / Consolidated"
}

function generatedByText(user) {
  return sanitizeForPdf(
    user?.fullName ||
    user?.name ||
    user?.username ||
    user?.email ||
    "Auto Supply User"
  )
}

function cleanFilename(value) {
  return String(value || "document")
    .replace(/[<>:"/\\|?*₱]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function getColumnAlignment(columnLabel = "") {
  const label = String(columnLabel).toLowerCase()

  // Monetary and financial amounts -> right align
  if (
    /(amount|charge|price|cost|revenue|margin|total|discount|balance|value|incentive|elimination|basis|grand|loss|paid|originated|effect|commission|refund|subtotal)/i.test(
      label
    )
  ) {
    return "right"
  }

  // Numerical counts and quantities -> right align
  if (
    /(qty|quantity|count|units|batches|serials|available|ordered|received|lost|reorder)/i.test(
      label
    )
  ) {
    return "right"
  }

  // Codes, dates, and short statuses -> center align
  if (
    /(date|status|code|po|receiving|job|claim|receipt|transfer|movement|branch|quick|role|type|next due|expiry|serial)/i.test(
      label
    )
  ) {
    return "center"
  }

  return "left"
}

function normalizeDocument(config) {
  return {
    title: sanitizeForPdf(config.title || "Business Document"),
    reference: sanitizeForPdf(config.reference || ""),
    status: sanitizeForPdf(config.status || ""),
    branch: sanitizeForPdf(config.branch || ""),
    generatedBy: sanitizeForPdf(config.generatedBy || ""),
    generatedAt: config.generatedAt || new Date(),
    meta: Array.isArray(config.meta)
      ? config.meta.map(([k, v]) => [sanitizeForPdf(k), sanitizeForPdf(v)])
      : [],
    columns: Array.isArray(config.columns)
      ? config.columns.map((c) => sanitizeForPdf(c))
      : [],
    rows: Array.isArray(config.rows)
      ? config.rows.map((row) =>
          Array.isArray(row)
            ? row.map((cell) => sanitizeForPdf(cell))
            : [sanitizeForPdf(row)]
        )
      : [],
    totals: Array.isArray(config.totals)
      ? config.totals.map(([k, v]) => [sanitizeForPdf(k), sanitizeForPdf(v)])
      : [],
    notes: Array.isArray(config.notes)
      ? config.notes
          .filter((entry) => String(entry?.value || "").trim())
          .map((entry) => ({
            label: sanitizeForPdf(entry.label || "Notes"),
            value: sanitizeForPdf(entry.value),
          }))
      : [],
    filename: cleanFilename(config.filename || config.reference || config.title),
    orientation: config.orientation || "portrait",
  }
}

export function exportBusinessPdf(rawConfig) {
  const config = normalizeDocument(rawConfig)

  const doc = new jsPDF({
    orientation: config.orientation,
    unit: "mm",
    format: "a4",
  })

  const margin = 12
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const contentWidth = pageWidth - margin * 2

  // 1. TOP CORPORATE HEADER
  doc.setTextColor(...MAROON)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.text("AUTO SUPPLY PARTS & ACCESSORIES", margin, 15)

  doc.setTextColor(...MUTED)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.text("Enterprise Cloud POS, Inventory & Auto Services System", margin, 20)

  // Accent Line
  doc.setLineWidth(0.4)
  doc.setDrawColor(...MAROON)
  doc.line(margin, 23, pageWidth - margin, 23)

  // 2. DOCUMENT TITLE & SUB-BANNER
  doc.setTextColor(...DARK)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.text(config.title.toUpperCase(), margin, 31)

  // 3. STRUCTURED METADATA GRID (Compact 2-Column Box)
  const headerMeta = [
    ...(config.reference ? [["Reference / Code", config.reference]] : []),
    ...(config.branch ? [["Branch Scope", config.branch]] : []),
    ...(config.status ? [["Status", config.status]] : []),
    ...config.meta,
  ]

  let y = 35

  if (headerMeta.length > 0) {
    const halfWidth = (contentWidth - 6) / 2
    const metaBoxPadding = 3
    const rowHeight = 4.5
    const metaRowsCount = Math.ceil(headerMeta.length / 2)
    const boxHeight = metaRowsCount * rowHeight + metaBoxPadding * 2

    // Background Card for Meta
    doc.setFillColor(...BG_LIGHT)
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.2)
    doc.roundedRect(margin, y, contentWidth, boxHeight, 1.5, 1.5, "FD")

    let currentMetaY = y + metaBoxPadding + 3.5

    for (let i = 0; i < headerMeta.length; i += 2) {
      // Left Column
      const [lbl1, val1] = headerMeta[i]
      doc.setFont("helvetica", "bold")
      doc.setFontSize(7.5)
      doc.setTextColor(...MUTED)
      doc.text(`${lbl1}:`, margin + 3, currentMetaY)

      doc.setFont("helvetica", "normal")
      doc.setTextColor(...DARK)
      const val1Wrapped = doc.splitTextToSize(String(val1 || "-"), halfWidth - 30)
      doc.text(val1Wrapped, margin + 30, currentMetaY)

      // Right Column (if exists)
      if (i + 1 < headerMeta.length) {
        const [lbl2, val2] = headerMeta[i + 1]
        const col2X = margin + halfWidth + 6
        doc.setFont("helvetica", "bold")
        doc.setTextColor(...MUTED)
        doc.text(`${lbl2}:`, col2X, currentMetaY)

        doc.setFont("helvetica", "normal")
        doc.setTextColor(...DARK)
        const val2Wrapped = doc.splitTextToSize(String(val2 || "-"), halfWidth - 30)
        doc.text(val2Wrapped, col2X + 27, currentMetaY)
      }

      currentMetaY += rowHeight
    }

    y += boxHeight + 4
  } else {
    y += 4
  }

  // 4. COLUMN STYLING & ALIGNMENT CONFIGURATION
  const columnStyles = {}
  config.columns.forEach((col, index) => {
    const align = getColumnAlignment(col)
    columnStyles[index] = {
      halign: align,
      fontStyle: align === "right" ? "bold" : "normal",
    }
  })

  const isWide = config.columns.length >= 8
  const tableFontSize = isWide ? 6.8 : config.columns.length >= 6 ? 7.2 : 7.8
  const cellPadding = isWide ? 1.6 : 2.0

  // 5. MAIN DATA TABLE (AutoTable)
  autoTable(doc, {
    startY: y,
    head: [config.columns],
    body: config.rows,
    theme: "grid",
    margin: {
      left: margin,
      right: margin,
    },
    styles: {
      font: "helvetica",
      fontSize: tableFontSize,
      cellPadding: cellPadding,
      textColor: DARK,
      lineColor: BORDER,
      lineWidth: 0.15,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: MAROON,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      lineColor: MAROON,
      lineWidth: 0.2,
      fontSize: tableFontSize + 0.5,
    },
    columnStyles,
    alternateRowStyles: {
      fillColor: BG_LIGHT,
    },
  })

  let cursorY = (doc.lastAutoTable?.finalY || y) + 6

  // 6. TOTALS / SUMMARY CARD
  if (config.totals.length > 0) {
    const summaryWidth = Math.min(110, contentWidth * 0.55)
    const summaryX = pageWidth - margin - summaryWidth
    const rowH = 5
    const totalBoxHeight = config.totals.length * rowH + 6

    if (cursorY + totalBoxHeight > pageHeight - 25) {
      doc.addPage()
      cursorY = 16
    }

    // Background Card for Totals
    doc.setFillColor(...BG_LIGHT)
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.2)
    doc.roundedRect(summaryX, cursorY, summaryWidth, totalBoxHeight, 1.5, 1.5, "FD")

    let tY = cursorY + 4.5

    for (const [label, value] of config.totals) {
      doc.setFontSize(8)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(...MUTED)
      doc.text(text(label), summaryX + 4, tY)

      doc.setTextColor(...DARK)
      doc.text(text(value), summaryX + summaryWidth - 4, tY, {
        align: "right",
      })

      tY += rowH
    }

    cursorY += totalBoxHeight + 4
  }

  // 7. NOTES & REMARKS SECTION
  if (config.notes.length > 0) {
    for (const note of config.notes) {
      if (cursorY > pageHeight - 35) {
        doc.addPage()
        cursorY = 16
      }

      doc.setFont("helvetica", "bold")
      doc.setFontSize(8)
      doc.setTextColor(...MUTED)
      doc.text(text(note.label), margin, cursorY)

      cursorY += 4

      doc.setFont("helvetica", "normal")
      doc.setTextColor(...DARK)

      const wrapped = doc.splitTextToSize(text(note.value), contentWidth)
      doc.text(wrapped, margin, cursorY)
      cursorY += wrapped.length * 4 + 4
    }
  }

  // 8. MULTI-PAGE NUMBERING & PROFESSIONAL FOOTER
  const pageCount = doc.getNumberOfPages()

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber)

    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.2)
    doc.line(margin, pageHeight - 11, pageWidth - margin, pageHeight - 11)

    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.setTextColor(...MUTED)

    const genText = `Generated by ${config.generatedBy || "Auto Supply User"} | ${dateTimeText(
      config.generatedAt
    )} | Official Auto Supply Report`
    doc.text(genText, margin, pageHeight - 6.5)

    doc.text(
      `Page ${pageNumber} of ${pageCount}`,
      pageWidth - margin,
      pageHeight - 6.5,
      { align: "right" }
    )
  }

  doc.save(`${config.filename}.pdf`)
}

export function printBusinessDocument(rawConfig) {
  const config = normalizeDocument(rawConfig)

  const popup = window.open("", "_blank", "width=1100,height=800")

  if (!popup) {
    window.alert("Please allow pop-ups to print this document.")
    return
  }

  const metaRows = [
    ...(config.reference ? [["Reference", config.reference]] : []),
    ...(config.status ? [["Status", config.status]] : []),
    ...(config.branch ? [["Branch", config.branch]] : []),
    ...config.meta,
  ]

  const tableHead = config.columns
    .map((column) => `<th>${escapeHtml(column)}</th>`)
    .join("")

  const tableRows = config.rows
    .map(
      (row) => `
        <tr>
          ${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}
        </tr>
      `
    )
    .join("")

  const metaHtml = metaRows
    .map(
      ([label, value]) => `
        <div class="meta-row">
          <strong>${escapeHtml(label)}</strong>
          <span>${escapeHtml(value)}</span>
        </div>
      `
    )
    .join("")

  const totalsHtml = config.totals
    .map(
      ([label, value]) => `
        <div class="total-row">
          <strong>${escapeHtml(label)}</strong>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `
    )
    .join("")

  const notesHtml = config.notes
    .map(
      (note) => `
        <section class="note">
          <strong>${escapeHtml(note.label)}</strong>
          <p>${escapeHtml(note.value)}</p>
        </section>
      `
    )
    .join("")

  popup.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(config.title)}</title>
        <style>
          @page {
            size: A4;
            margin: 14mm;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            font-family: Arial, Helvetica, sans-serif;
            color: #1f2937;
            font-size: 12px;
          }

          .company {
            color: #011C6B;
            font-size: 20px;
            font-weight: 800;
          }

          .subtitle {
            margin-top: 2px;
            color: #64748b;
            font-size: 10px;
          }

          h1 {
            margin: 14px 0 10px;
            font-size: 17px;
          }

          .meta {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 6px 16px;
            margin-bottom: 14px;
            padding: 8px 12px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
          }

          .meta-row {
            display: grid;
            grid-template-columns: 110px 1fr;
            gap: 8px;
          }

          .meta-row strong {
            color: #64748b;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          th {
            padding: 7px 8px;
            background: #011C6B;
            color: white;
            border: 1px solid #011C6B;
            text-align: left;
            font-size: 10px;
          }

          td {
            padding: 6px 8px;
            border: 1px solid #e2e8f0;
            vertical-align: top;
            font-size: 9.5px;
          }

          tr:nth-child(even) {
            background-color: #f8fafc;
          }

          tr {
            break-inside: avoid;
          }

          .totals {
            width: 320px;
            margin: 14px 0 0 auto;
            padding: 8px 12px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
          }

          .total-row {
            display: flex;
            justify-content: space-between;
            gap: 20px;
            padding: 3px 0;
          }

          .note {
            margin-top: 14px;
          }

          .note strong {
            color: #64748b;
          }

          .note p {
            margin: 4px 0 0;
            white-space: pre-wrap;
          }

          footer {
            margin-top: 20px;
            padding-top: 8px;
            border-top: 1px solid #e2e8f0;
            color: #64748b;
            font-size: 9px;
          }

          @media print {
            button {
              display: none !important;
            }
          }
        </style>
      </head>

      <body>
        <div class="company">AUTO SUPPLY</div>
        <div class="subtitle">Cloud POS and Inventory Management System</div>

        <h1>${escapeHtml(config.title)}</h1>

        <div class="meta">
          ${metaHtml}
        </div>

        <table>
          <thead>
            <tr>${tableHead}</tr>
          </thead>

          <tbody>
            ${tableRows}
          </tbody>
        </table>

        ${totalsHtml ? `<div class="totals">${totalsHtml}</div>` : ""}

        ${notesHtml}

        <footer>
          Generated by ${escapeHtml(
            config.generatedBy || "Auto Supply User"
          )} - ${escapeHtml(dateTimeText(config.generatedAt))}
        </footer>
      </body>
    </html>
  `)

  popup.document.close()

  window.setTimeout(() => {
    popup.focus()
    popup.print()
  }, 250)
}

export function purchaseOrderDocument(order, context = {}) {
  const lines = Array.isArray(order?.items) ? order.items : []

  let computedSubtotal = 0
  let computedDiscount = 0

  const rows = lines.map((line) => {
    const ordered = number(line.quantity)
    const received = number(line.receivedQuantity)
    const unitCost = number(line.unitCost)
    const discount = number(line.discountAmount)

    const gross = ordered * unitCost
    const lineTotal =
      line.lineTotal != null
        ? number(line.lineTotal)
        : Math.max(0, gross - discount)

    computedSubtotal += gross
    computedDiscount += discount

    return [
      text(line.item?.itemCode || "Unlinked"),
      text(line.description || line.item?.itemName),
      quantity(ordered),
      quantity(received),
      php(unitCost),
      php(discount),
      php(lineTotal),
    ]
  })

  const subtotal =
    order?.subtotal != null ? number(order.subtotal) : computedSubtotal

  const totalDiscount =
    order?.totalDiscount != null ? number(order.totalDiscount) : computedDiscount

  const grandTotal =
    order?.grandTotal != null
      ? number(order.grandTotal)
      : Math.max(0, subtotal - totalDiscount)

  return {
    title: "Purchase Order",
    reference: text(order?.poCode),
    status: text(order?.status),
    branch: branchText(order?.branch || context.branch),
    generatedBy: generatedByText(context.generatedBy),
    filename: `${text(order?.poCode, "Purchase-Order")}_${new Date()
      .toISOString()
      .slice(0, 10)}`,
    meta: [
      ["Supplier", text(order?.supplierNameSnapshot || order?.supplier?.name)],
      ["Order date", dateText(order?.orderDate)],
      ["Expected date", dateText(order?.expectedDate)],
    ],
    columns: [
      "Item Code",
      "Description",
      "Ordered",
      "Received",
      "Unit Cost",
      "Discount",
      "Line Total",
    ],
    rows,
    totals: [
      ["Subtotal", php(subtotal)],
      ["Discount", php(totalDiscount)],
      ["Grand Total", php(grandTotal)],
    ],
    notes: [
      {
        label: "Notes",
        value: order?.notes || "",
      },
    ],
  }
}

export function receivingDocument(receiving, context = {}) {
  const lines = Array.isArray(receiving?.items) ? receiving.items : []

  let computedSubtotal = 0
  let computedDiscount = 0

  const rows = lines.map((line) => {
    const qty = number(line.quantityReceived)
    const unitCost = number(line.unitCost)
    const discount = number(line.discountAmount)
    const gross = qty * unitCost

    const lineTotal =
      line.lineTotal != null
        ? number(line.lineTotal)
        : Math.max(0, gross - discount)

    computedSubtotal += gross
    computedDiscount += discount

    const serials = Array.isArray(line.serials)
      ? line.serials
          .map((serial) => serial.serialNumber)
          .filter(Boolean)
          .join(", ")
      : ""

    return [
      text(line.item?.itemCode),
      text(line.item?.itemName || line.description),
      quantity(qty),
      php(unitCost),
      php(discount),
      text(line.batchCode),
      dateText(line.expiryDate),
      serials ? sanitizeForPdf(serials) : "-",
      php(lineTotal),
    ]
  })

  const subtotal =
    receiving?.subtotal != null
      ? number(receiving.subtotal)
      : computedSubtotal

  const totalDiscount =
    receiving?.totalDiscount != null
      ? number(receiving.totalDiscount)
      : computedDiscount

  const grandTotal =
    receiving?.grandTotal != null
      ? number(receiving.grandTotal)
      : Math.max(0, subtotal - totalDiscount)

  return {
    title: "Purchase Receiving / Delivery",
    reference: text(receiving?.receivingCode),
    status: text(receiving?.status),
    branch: branchText(receiving?.branch || context.branch),
    generatedBy: generatedByText(context.generatedBy),
    filename: `${text(
      receiving?.receivingCode,
      "Receiving"
    )}_${new Date().toISOString().slice(0, 10)}`,
    orientation: "landscape",
    meta: [
      ["Supplier", text(receiving?.supplierNameSnapshot)],
      ["Purchase order", text(receiving?.purchaseOrder?.poCode || "Standalone")],
      ["Receiving date", dateText(receiving?.receivingDate)],
      ["Delivery no.", text(receiving?.supplierDeliveryNo)],
      ["Invoice no.", text(receiving?.supplierInvoiceNo)],
      ["Reference", text(receiving?.referenceNo)],
    ],
    columns: [
      "Item Code",
      "Item",
      "Qty",
      "Unit Cost",
      "Discount",
      "Batch",
      "Expiry",
      "Serial Number(s)",
      "Line Total",
    ],
    rows,
    totals: [
      ["Subtotal", php(subtotal)],
      ["Discount", php(totalDiscount)],
      ["Grand Total", php(grandTotal)],
    ],
    notes: [
      {
        label: "Notes",
        value: receiving?.notes || "",
      },
    ],
  }
}

export function inventoryDocument(items, context = {}) {
  const records = Array.isArray(items) ? items : []

  return {
    title: "Inventory Stock Report",
    reference: "",
    status: "",
    branch: branchText(context.branch),
    generatedBy: generatedByText(context.generatedBy),
    filename: `Inventory_${cleanFilename(
      branchText(context.branch)
    )}_${new Date().toISOString().slice(0, 10)}`,
    orientation: "landscape",
    meta: Array.isArray(context.filters) ? context.filters : [],
    columns: [
      "Item Code",
      "Product Name",
      "Brand",
      "Category",
      "Available",
      "Total In",
      "Batches",
      "Serials",
      "Reorder",
      "Tracking",
      "Stock Level",
      "Branch",
    ],
    rows: records.map((item) => [
      text(item.itemCode),
      text(item.itemName),
      text(item.brand),
      text(item.category?.name || item.categoryName),
      quantity(item.quantityAvailable),
      quantity(item.quantityIn),
      quantity(item.batchCount),
      quantity(item.serialCount),
      quantity(item.reorderLevel),
      item.isSerialized ? "Serialized" : "Non-serialized",
      number(item.quantityAvailable) <= 0
        ? "Out of stock"
        : item.isLowStock
        ? "Low stock"
        : "Healthy",
      text(item.branch?.code || item.branch?.name),
    ]),
    totals: [
      ["Inventory item count", quantity(records.length)],
      [
        "Total available units",
        quantity(
          records.reduce(
            (sum, item) => sum + number(item.quantityAvailable),
            0
          )
        ),
      ],
    ],
  }
}

export function reportDocument({
  label,
  columns,
  records,
  totals = [],
  branch,
  generatedBy,
  filters = [],
  filename,
}) {
  const safeColumns = Array.isArray(columns) ? columns : []
  const safeRecords = Array.isArray(records) ? records : []

  return {
    title: sanitizeForPdf(label || "Business Report"),
    branch: branchText(branch),
    generatedBy: generatedByText(generatedBy),
    filename: cleanFilename(
      filename ||
      `${cleanFilename(label || "Report")}_${new Date()
        .toISOString()
        .slice(0, 10)}`
    ),
    orientation: safeColumns.length >= 7 ? "landscape" : "portrait",
    meta: filters.map(([k, v]) => [sanitizeForPdf(k), sanitizeForPdf(v)]),
    totals: totals.map(([k, v]) => [sanitizeForPdf(k), sanitizeForPdf(v)]),
    columns: safeColumns.map(([columnLabel]) => sanitizeForPdf(columnLabel)),
    rows: safeRecords.map((record) =>
      safeColumns.map(([, accessor]) => {
        try {
          return sanitizeForPdf(accessor(record))
        } catch {
          return "-"
        }
      })
    ),
  }
}

export function groupReceiptItems(items = [], options = {}) {
  const { termBasis = 1, isCreditCardWithDp = false } = options

  const groups = []
  const groupMap = new Map()
  const safeItems = Array.isArray(items) ? items : []

  safeItems.forEach((item, index) => {
    if (!item || typeof item !== "object") return
    const itemCode = item.itemCodeSnapshot || item.item?.itemCode || "—"
    const description = item.description || item.item?.itemName || "Item"
    const warrantyBadge = (
      item.warrantyDuration ||
      (item.item?.hasWarranty ? "1 YEAR WARRANTY" : "") ||
      ""
    ).trim()

    const baseSnapshot =
      item.baseUnitPriceSnapshot != null
        ? Number(item.baseUnitPriceSnapshot)
        : null
    const shouldScaleItem =
      !isCreditCardWithDp && baseSnapshot != null && termBasis < 1
    const unitPrice = shouldScaleItem
      ? Math.round((baseSnapshot / termBasis) * 100) / 100
      : Number(baseSnapshot != null ? baseSnapshot : (item.unitPrice || 0))

    const serial = (
      item.serialNumber ||
      item.serial?.serialNumber ||
      ""
    ).trim()

    const returnedQty = Number(item.returnedQuantity || 0)
    const itemId = item.itemId || item.item?.id || itemCode
    const groupKey = `${itemId}___${itemCode}___${description}___${warrantyBadge}___${unitPrice}`

    const qty = Number(item.quantity || 1)
    const lineTotal = shouldScaleItem
      ? Math.round((qty * unitPrice) * 100) / 100
      : Number(item.lineTotal != null ? item.lineTotal : (qty * unitPrice))

    let availableStock = null
    if (item.availableStock !== undefined && item.availableStock !== null) {
      availableStock = Number(item.availableStock)
    } else if (item.item && Array.isArray(item.item.inventoryBatches)) {
      availableStock = item.item.inventoryBatches.reduce(
        (acc, b) => acc + Number(b.quantityAvailable || 0),
        0
      )
    } else if (item.item?.quantityAvailable !== undefined && item.item?.quantityAvailable !== null) {
      availableStock = Number(item.item.quantityAvailable)
    } else if (item.batch?.quantityAvailable !== undefined && item.batch?.quantityAvailable !== null) {
      availableStock = Number(item.batch.quantityAvailable)
    }

    if (groupMap.has(groupKey)) {
      const existing = groupMap.get(groupKey)
      existing.quantity += qty
      existing.lineTotal =
        Math.round((existing.lineTotal + lineTotal) * 100) / 100
      existing.returnedQuantity += returnedQty
      if (availableStock !== null && (existing.availableStock === null || existing.availableStock === undefined)) {
        existing.availableStock = availableStock
      }
      if (serial && !existing.serialNumbers.includes(serial)) {
        existing.serialNumbers.push(serial)
      }
    } else {
      const newGroup = {
        id: item.id || `group-${index}`,
        itemCode,
        description,
        warrantyBadge,
        unitPrice,
        quantity: qty,
        lineTotal,
        returnedQuantity: returnedQty,
        serialNumbers: serial ? [serial] : [],
        rawItem: item,
        availableStock,
      }
      groupMap.set(groupKey, newGroup)
      groups.push(newGroup)
    }
  })

  return groups
}

export function groupQuotationItems(items = [], options = {}) {
  const { termRate = 0.875 } = options

  const groups = []
  const groupMap = new Map()
  const safeItems = Array.isArray(items) ? items : []

  safeItems.forEach((item, index) => {
    if (!item || typeof item !== "object") return
    const itemCode = item.itemCodeSnapshot || item.item?.itemCode || "—"
    const description = item.description || item.item?.itemName || "Item"
    const warrantyBadge = (
      item.warrantyDuration ||
      (item.item?.hasWarranty ? "1 YEAR WARRANTY" : "") ||
      ""
    ).trim()

    const cashUnit = Number(item.unitPrice ?? item.baseUnitPrice ?? 0)
    const qty = Number(item.quantity || 0)
    const cashTotal = Number(
      item.lineTotal ?? (qty * cashUnit - (Number(item.discountAmount) || 0))
    )

    const rate = termRate > 0 ? termRate : 0.875
    const regUnit = Math.round((cashUnit / rate) * 100) / 100
    const regTotal = Math.round((cashTotal / rate) * 100) / 100

    const rawSerial = (
      item.serialNumber ||
      item.serial?.serialNumber ||
      item.remarks ||
      ""
    ).trim()
    const serial = rawSerial.replace(/^S\/N:\s*/i, "").trim()

    const itemId = item.itemId || item.item?.id || itemCode
    const groupKey = `${itemId}___${itemCode}___${description}___${warrantyBadge}___${cashUnit}`

    let availableStock = null
    if (item.availableStock !== undefined && item.availableStock !== null) {
      availableStock = Number(item.availableStock)
    } else if (item.item && Array.isArray(item.item.inventoryBatches)) {
      availableStock = item.item.inventoryBatches.reduce(
        (acc, b) => acc + Number(b.quantityAvailable || 0),
        0
      )
    } else if (item.item?.quantityAvailable !== undefined && item.item?.quantityAvailable !== null) {
      availableStock = Number(item.item.quantityAvailable)
    }

    if (groupMap.has(groupKey)) {
      const existing = groupMap.get(groupKey)
      existing.quantity += qty
      existing.cashTotal =
        Math.round((existing.cashTotal + cashTotal) * 100) / 100
      existing.regTotal =
        Math.round((existing.regTotal + regTotal) * 100) / 100
      if (availableStock !== null && (existing.availableStock === null || existing.availableStock === undefined)) {
        existing.availableStock = availableStock
      }
      if (serial && !existing.serialNumbers.includes(serial)) {
        existing.serialNumbers.push(serial)
      }
    } else {
      const newGroup = {
        id: item.id || `quote-group-${index}`,
        itemCode,
        description,
        warrantyBadge,
        quantity: qty,
        cashUnit,
        cashTotal,
        regUnit,
        regTotal,
        serialNumbers: serial ? [serial] : [],
        rawItem: item,
        availableStock,
      }
      groupMap.set(groupKey, newGroup)
      groups.push(newGroup)
    }
  })

  return groups
}

export function exportWarrantyReceiptPdf(sale, options = {}) {
  const context = options.context || {}
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  })

  const margin = 12
  const pageWidth = 210
  const contentWidth = pageWidth - margin * 2

  const branch = sale?.branch || context?.branch || {}
  const customer = sale?.customer || {}
  const cashier = sale?.cashier || {}
  const quotation = sale?.quotation || {}
  let technician =
    sale?.technician?.fullName ||
    quotation?.serviceDoneBy?.fullName ||
    context?.technician ||
    ""

  if (!technician || technician === "-" || technician === "—") {
    const serviceItemWithDoneBy = (sale?.items || []).find(
      (item) =>
        typeof item.description === "string" &&
        item.description.includes("[Done by:")
    )
    if (serviceItemWithDoneBy) {
      const match = serviceItemWithDoneBy.description.match(
        /\[Done by:\s*([^\]]+)\]/
      )
      if (match && match[1]) {
        technician = match[1].trim()
      }
    }
  }

  technician = sanitizeForPdf(technician || "-")

  let paymentType = "CASH"
  if (sale?.creditAccount) {
    const provider = sanitizeForPdf(
      String(sale.creditAccount.provider || sale.paymentMethod || "").replaceAll(
        "_",
        " "
      )
    )
    if ((sale?.payments || []).length > 0) {
      const dp = sale.payments
        .map((p) =>
          sanitizeForPdf(String(p.paymentMethod || "").replaceAll("_", " "))
        )
        .join(", ")
      paymentType = `${provider} (DP: ${dp})`
    } else {
      paymentType = `${provider} Receivable`
    }
  } else if ((sale?.payments || []).length > 0) {
    paymentType = sale.payments
      .map((p) =>
        sanitizeForPdf(String(p.paymentMethod || "").replaceAll("_", " "))
      )
      .join(", ")
  }

  const terms = sanitizeForPdf(
    sale?.creditAccount?.term || sale?.receivable?.term || sale?.creditTerm
      ? `${String(
          sale?.creditAccount?.term || sale?.receivable?.term || sale?.creditTerm
        ).replaceAll("_", " ")}`
      : "FULL / OUTRIGHT"
  )

  const leftColX = margin
  const leftColWidth = 96

  const rightColX = margin + 102
  const rightLabelWidth = 26
  const rightValX = rightColX + rightLabelWidth
  const rightValWidth = contentWidth - 102 - rightLabelWidth

  // Left side: Company Name & Address
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(0, 0, 0)
  const storeTitleLines = doc.splitTextToSize(
    "AUTO SUPPLY PARTS AND ACCESSORIES SHOP",
    leftColWidth
  )
  doc.text(storeTitleLines, leftColX, 14)

  let leftY = 14 + storeTitleLines.length * 3.8 + 0.5
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(50, 50, 50)
  const branchAddress = sanitizeForPdf(
    branch.address ||
      "Kingspire Business Centre, Km.71, Mac Arthur Highway, San Isidro, City of San Fernando, Pampanga"
  )
  const addressLines = doc.splitTextToSize(branchAddress, leftColWidth)
  doc.text(addressLines, leftColX, leftY)

  leftY += addressLines.length * 3.4 + 1
  const branchContact = sanitizeForPdf(
    branch.contactNo || "0961-873-5798 / 045-404-0673"
  )
  doc.text(branchContact, leftColX, leftY)
  leftY += 4

  // Right side: Transaction Metadata
  let rightY = 14
  const saleDateFormatted = sale?.saleDate
    ? new Date(sale.saleDate)
        .toLocaleDateString("en-PH", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
        .toUpperCase()
    : "-"

  const metaRows = [
    ["Date:", saleDateFormatted],
    [
      "Customer Name:",
      sanitizeForPdf(customer.fullName || "Walk-in customer").toUpperCase(),
    ],
    ["Address:", sanitizeForPdf(customer.address || "-")],
    [
      "Contact No.:",
      sanitizeForPdf(customer.mobileNumber || customer.email || "-"),
    ],
    [
      "Salesman:",
      sanitizeForPdf(cashier.fullName || cashier.username || "-").toUpperCase(),
    ],
    ["Payment Type:", paymentType],
    ["TERMS:", terms],
    ["TECHNICIAN:", technician.toUpperCase()],
  ]

  for (const [lbl, val] of metaRows) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7.5)
    doc.setTextColor(70, 70, 70)
    doc.text(lbl, rightColX, rightY)

    doc.setFont("helvetica", "normal")
    doc.setTextColor(0, 0, 0)
    const valLines = doc.splitTextToSize(String(val || "-"), rightValWidth)
    doc.text(valLines, rightValX, rightY)

    rightY += Math.max(3.4, valLines.length * 3.1 + 0.3)
  }

  const bannerY = Math.max(leftY, rightY) + 5

  // Centered Title Banner
  doc.setFont("helvetica", "bolditalic")
  doc.setFontSize(11)
  doc.setTextColor(0, 32, 96)
  doc.text(
    "WARRANTY RECEIPT",
    margin + contentWidth / 2 - 8,
    bannerY,
    { align: "center" }
  )

  // Receipt Number on Right
  doc.setFont("helvetica", "bolditalic")
  doc.setFontSize(9)
  doc.setTextColor(0, 32, 96)
  doc.text("No.", margin + contentWidth - 28, bannerY)

  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.setTextColor(0, 32, 96)
  const safeReceiptCode = sanitizeForPdf(sale?.receiptCode || "-")
  doc.text(safeReceiptCode, margin + contentWidth, bannerY, { align: "right" })

  const codeWidth = doc.getTextWidth(safeReceiptCode)
  doc.setLineWidth(0.3)
  doc.setDrawColor(0, 32, 96)
  doc.line(
    margin + contentWidth - codeWidth - 1,
    bannerY + 1.2,
    margin + contentWidth,
    bannerY + 1.2
  )

  const tableStartY = bannerY + 6

  const paidAmount = Number(
    sale?.amountPaid ??
      sale?.creditAccount?.downpaymentAmount ??
      sale?.creditAccount?.initialPaymentAmount ??
      options?.installmentCalculation?.downpayment ??
      0
  )
  const isCreditCardWithDp =
    (sale?.creditAccount?.provider === "CREDIT_CARD" ||
      options?.installmentCalculation?.isCreditCardWithDp ||
      options?.paymentMethod === "CREDIT_CARD" ||
      sale?.paymentMethod === "CREDIT_CARD") &&
    paidAmount > 0
  const cashPromoTotal = Number(
    sale?.creditAccount?.cashPromoTotalAmount ??
      sale?.creditAccount?.sourceTotalAmountSnapshot ??
      options?.installmentCalculation?.cashPromoTotal ??
      sale?.subtotal ??
      0
  )

  const isCredit = Boolean(sale?.creditAccount || options?.isCredit)
  const rawTermBasis = Number(
    sale?.creditAccount?.termBasis ||
      (isCredit && options?.installmentCalculation?.termBasis) ||
      0
  )
  const termKey = sale?.creditAccount?.term || options?.installmentCalculation?.term || options?.creditTerm || sale?.creditTerm
  const termBasis = rawTermBasis > 0 && rawTermBasis < 1
    ? rawTermBasis
    : (termKey && DEFAULT_TERM_RATES[termKey]) || 1

  const tableHead = [
    ["ITEM CODE", "ITEM DESCRIPTION", "QTY.", "UNIT PRICE", "AMOUNT"],
  ]
  const groupedItems = groupReceiptItems(sale?.items || [], {
    termBasis,
    isCreditCardWithDp,
  })

  const tableBody = groupedItems.map((group) => {
    const itemCode = sanitizeForPdf(group.itemCode || "-")
    const serialText =
      group.serialNumbers.length > 0
        ? `\nS/N: ${sanitizeForPdf(group.serialNumbers.join(", "))}`
        : ""
    const warrantyText = group.warrantyBadge
      ? ` | ${sanitizeForPdf(group.warrantyBadge)}`
      : ""
    const fullDescription = sanitizeForPdf(
      `${group.description}${warrantyText}${serialText}`
    )

    const qty = String(group.quantity)
    const unitPrice = group.unitPrice.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    const lineTotal = group.lineTotal.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })

    return [itemCode, fullDescription, qty, unitPrice, lineTotal]
  })

  autoTable(doc, {
    startY: tableStartY,
    head: tableHead,
    body: tableBody,
    theme: "plain",
    margin: { left: margin, right: margin },
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: { top: 1.6, bottom: 1.6, left: 1.2, right: 1.2 },
      textColor: [0, 0, 0],
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fontStyle: "bold",
      textColor: [0, 0, 0],
      fontSize: 8,
      lineWidth: { top: 0.7, bottom: 0.7 },
      lineColor: [0, 0, 0],
      cellPadding: { top: 2, bottom: 2, left: 1.2, right: 1.2 },
    },
    columnStyles: {
      0: { cellWidth: 22, fontStyle: "bold" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 14, halign: "center" },
      3: { cellWidth: 25, halign: "right" },
      4: { cellWidth: 27, halign: "right", fontStyle: "bold" },
    },
  })

  let finalY = doc.lastAutoTable?.finalY || tableStartY + 20

  if (sale?.remarks) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7.5)
    doc.setTextColor(0, 0, 0)
    doc.text("Remarks: ", margin, finalY + 3.5)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(50, 50, 50)
    const remarksLines = doc.splitTextToSize(
      sanitizeForPdf(sale.remarks),
      contentWidth - 16
    )
    doc.text(remarksLines, margin + 14, finalY + 3.5)
    finalY += Math.max(remarksLines.length * 3.5, 4) + 1.5
  }

  doc.setLineWidth(0.6)
  doc.setDrawColor(0, 0, 0)
  doc.line(margin, finalY + 1, margin + contentWidth, finalY + 1)
  doc.line(margin, finalY + 1.8, margin + contentWidth, finalY + 1.8)

  finalY += 4

  // Financial Summary
  doc.setFont("helvetica", "italic")
  doc.setFontSize(8)
  doc.setTextColor(60, 60, 60)
  doc.text("This receipt is not valid for input tax.", margin, finalY + 4)

  const totalsLabelX = margin + contentWidth - 65
  const totalsValueX = margin + contentWidth

  const savedRegular = Number(
    sale?.creditAccount?.regularPriceTotalAmount ||
      sale?.creditAccount?.principalAmount ||
      options?.installmentCalculation?.regularPriceTotalAmount ||
      0
  )
  const rawTotalAmount =
    isCredit && savedRegular > 0
      ? savedRegular
      : Number(sale?.grandTotal || sale?.subtotal || 0)

  const ccSwipeAmount = isCreditCardWithDp && termBasis < 1 && cashPromoTotal > 0
    ? Math.round((Math.max(cashPromoTotal - paidAmount, 0) / termBasis) * 100) / 100
    : null
  const totalAmount = ccSwipeAmount != null
    ? Math.round((paidAmount + ccSwipeAmount) * 100) / 100
    : (termBasis < 1 && termBasis > 0 && cashPromoTotal > 0
        ? (savedRegular > cashPromoTotal ? savedRegular : Math.round((cashPromoTotal / termBasis) * 100) / 100)
        : rawTotalAmount)
  const balanceToPay = ccSwipeAmount != null
    ? ccSwipeAmount
    : Math.max(0, Math.round((totalAmount - paidAmount) * 100) / 100)

  const isFinance = Boolean(isCreditCardWithDp || isCredit || sale?.creditAccount)

  if (isFinance) {
    let curY = finalY + 4
    const cashPrice = cashPromoTotal > 0 ? cashPromoTotal : totalAmount

    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.5)
    doc.setTextColor(60, 60, 60)
    doc.text("ORIGINAL CASH PRICE", totalsLabelX, curY)
    doc.text(
      cashPrice.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      totalsValueX,
      curY,
      { align: "right" }
    )
    curY += 4

    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.5)
    doc.setTextColor(0, 0, 0)
    doc.text("CASH DOWNPAYMENT", totalsLabelX, curY)
    doc.text(
      paidAmount.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      totalsValueX,
      curY,
      { align: "right" }
    )
    curY += 4

    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    doc.setTextColor(0, 0, 0)
    doc.text("Balance to pay", totalsLabelX, curY)
    doc.text(
      balanceToPay.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      totalsValueX,
      curY,
      { align: "right" }
    )

    finalY = curY + 6
  } else {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    doc.setTextColor(0, 0, 0)

    doc.text("TOTAL AMOUNT", totalsLabelX, finalY + 4)
    doc.text(
      totalAmount.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      totalsValueX,
      finalY + 4,
      { align: "right" }
    )

    if (paidAmount > 0) {
      doc.text("AMOUNT PAID", totalsLabelX, finalY + 8)
      doc.text(
        paidAmount.toLocaleString("en-PH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        totalsValueX,
        finalY + 8,
        { align: "right" }
      )
    }

    doc.text("BALANCE TO PAY", totalsLabelX, finalY + 12)
    doc.text(
      balanceToPay.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      totalsValueX,
      finalY + 12,
      { align: "right" }
    )

    finalY += 16
  }

  // Warranty Disclaimers
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(0, 0, 0)
  doc.text(
    "NO WARRANTY ON SOFTWARE/S (O.S. - WINDOWS and MS OFFICE), IF ANY",
    margin + contentWidth / 2,
    finalY,
    { align: "center" }
  )

  doc.setFontSize(7)
  doc.text(
    "Pls. read all WARRANTY GUIDELINES & PROCEDURES at the back of this page. (BRING - IN WARRANTY)",
    margin + contentWidth / 2,
    finalY + 3.6,
    { align: "center" }
  )

  finalY += 9

  // Signatures Section
  const sigColWidth = contentWidth / 4

  doc.setFont("helvetica", "italic")
  doc.setFontSize(7.5)
  doc.setTextColor(50, 50, 50)
  doc.text(
    "Received Items in good order and Condition",
    margin + sigColWidth * 3 + (sigColWidth - 4) / 2,
    finalY,
    { align: "center" }
  )

  finalY += 4

  const sigColStartX = [
    margin,
    margin + sigColWidth + 2,
    margin + sigColWidth * 2 + 4,
    margin + sigColWidth * 3 + 6,
  ]
  const sigLineW = sigColWidth - 4

  const sigRows = [
    {
      label: "Prepared by:",
      name: sanitizeForPdf(
        cashier.fullName || cashier.username || ""
      ).toUpperCase(),
      sub: "",
    },
    { label: "Warehouse:", name: "", sub: "" },
    { label: "Releasing:", name: "", sub: "" },
    { label: "Received by:", name: "", sub: "Signature over Printed Name" },
  ]

  for (let i = 0; i < 4; i++) {
    const col = sigRows[i]
    const x = sigColStartX[i]

    doc.setFont("helvetica", "bold")
    doc.setFontSize(7)
    doc.setTextColor(70, 70, 70)
    doc.text(col.label, x, finalY)

    if (col.name) {
      doc.setFont("helvetica", "bold")
      doc.setFontSize(7.5)
      doc.setTextColor(0, 0, 0)
      doc.text(col.name, x + sigLineW / 2, finalY + 6.5, { align: "center" })
    }

    doc.setLineWidth(0.3)
    doc.setDrawColor(120, 120, 120)
    doc.line(x, finalY + 8, x + sigLineW, finalY + 8)

    if (col.sub) {
      doc.setFont("helvetica", "normal")
      doc.setFontSize(6.5)
      doc.setTextColor(100, 100, 100)
      doc.text(col.sub, x + sigLineW / 2, finalY + 11.5, { align: "center" })
    }
  }

  if (options.autoPrint) {
    doc.autoPrint()
    const blobUrl = doc.output("bloburl")
    window.open(blobUrl, "_blank")
  } else {
    const filename = `Warranty-Receipt-${safeReceiptCode || "receipt"}.pdf`
    doc.save(filename)
  }
}

export function printWarrantyReceipt(sale, options = {}) {
  exportWarrantyReceiptPdf(sale, { ...options, autoPrint: true })
}

export function exportCustomerQuotationPdf(quotation, options = {}) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  })

  const margin = 12
  const pageWidth = 210
  const contentWidth = pageWidth - margin * 2

  const branch = quotation?.branch || {}
  const customer = quotation?.customer || {}
  const settlement = parseQuotationSettlement(quotation?.notes)
  const salesman = sanitizeForPdf(
    quotation?.salesman ||
      settlement?.salesmanName ||
      quotation?.preparedBy?.fullName ||
      quotation?.preparedBy?.username ||
      quotation?.cashier?.fullName ||
      quotation?.cashier?.username ||
      "-"
  )

  const leftColX = margin
  const leftColWidth = 96

  const rightColX = margin + 102
  const rightLabelWidth = 26
  const rightValX = rightColX + rightLabelWidth
  const rightValWidth = contentWidth - 102 - rightLabelWidth

  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(0, 0, 0)
  const storeTitleLines = doc.splitTextToSize(
    "AUTO SUPPLY PARTS AND ACCESSORIES SHOP",
    leftColWidth
  )
  doc.text(storeTitleLines, leftColX, 14)

  let leftY = 14 + storeTitleLines.length * 3.8 + 0.5
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(50, 50, 50)
  const branchAddress = sanitizeForPdf(
    branch.address ||
      "Kingspire Business Centre, Km.71, Mac Arthur Highway, San Isidro, City of San Fernando, Pampanga"
  )
  const addressLines = doc.splitTextToSize(branchAddress, leftColWidth)
  doc.text(addressLines, leftColX, leftY)

  leftY += addressLines.length * 3.4 + 1
  const branchContact = sanitizeForPdf(
    branch.contactNo || "0961-873-5798 / 045-404-0673"
  )
  doc.text(branchContact, leftColX, leftY)
  leftY += 4

  let rightY = 14
  const quoteDate =
    quotation?.createdAt || quotation?.quotationDate || new Date()
  const formattedDate = new Date(quoteDate)
    .toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    .toUpperCase()

  const installmentCalc =
    options.installmentCalculation ||
    parseQuotationSettlement(quotation?.notes)?.installmentCalculation
  const isAR = Boolean(installmentCalc)

  const metaRows = [
    ["Date:", formattedDate],
    [
      "Customer Name:",
      sanitizeForPdf(customer.fullName || "Walk-in customer").toUpperCase(),
    ],
    ["Address:", sanitizeForPdf(customer.address || "-")],
    [
      "Contact No.:",
      sanitizeForPdf(customer.mobileNumber || customer.email || "-"),
    ],
    ["Salesman:", String(salesman).toUpperCase()],
    [
      "TERMS:",
      isAR
        ? `${installmentCalc?.months || 24} MONTHS (AR / INSTALLMENT)`
        : "CASH DISCOUNTED PRICE",
    ],
  ]

  for (const [lbl, val] of metaRows) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7.5)
    doc.setTextColor(70, 70, 70)
    doc.text(lbl, rightColX, rightY)

    doc.setFont("helvetica", "normal")
    doc.setTextColor(0, 0, 0)
    const valLines = doc.splitTextToSize(String(val || "-"), rightValWidth)
    doc.text(valLines, rightValX, rightY)

    rightY += Math.max(3.4, valLines.length * 3.1 + 0.3)
  }

  const bannerY = Math.max(leftY, rightY) + 5

  doc.setFont("helvetica", "bolditalic")
  doc.setFontSize(11)
  doc.setTextColor(0, 32, 96)
  doc.text("QUOTATION", margin + contentWidth / 2 - 8, bannerY, {
    align: "center",
  })

  const rawCode = sanitizeForPdf(
    quotation?.quotationCode || quotation?.code || "-"
  )
  const numericCodeMatch = rawCode.match(/\d+$/)
  const displayCode = numericCodeMatch
    ? numericCodeMatch[0].padStart(5, "0")
    : rawCode

  doc.setFont("helvetica", "bolditalic")
  doc.setFontSize(9)
  doc.setTextColor(0, 32, 96)
  doc.text("No.", margin + contentWidth - 28, bannerY)

  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.setTextColor(0, 32, 96)
  doc.text(displayCode, margin + contentWidth, bannerY, { align: "right" })

  const codeWidth = doc.getTextWidth(displayCode)
  doc.setLineWidth(0.3)
  doc.setDrawColor(0, 32, 96)
  doc.line(
    margin + contentWidth - codeWidth - 1,
    bannerY + 1.2,
    margin + contentWidth,
    bannerY + 1.2
  )

  const tableStartY = bannerY + 6
  const tableHead = [
    [
      "ITEM CODE",
      "ITEM DESCRIPTION",
      "QTY.",
      "REGULAR PRICE",
      "REGULAR AMOUNT",
      "CASH PROMO",
      "CASH AMOUNT",
    ],
  ]

  const termRate = Number(
    installmentCalc?.rate ||
      installmentCalc?.termBasis ||
      options.installmentCalculation?.termBasis ||
      0.875
  )
  const groupedItems = groupQuotationItems(quotation?.items || [], { termRate })
  const tableBody = groupedItems.map((group) => {
    const itemCode = sanitizeForPdf(group.itemCode || "-")
    const serialText =
      group.serialNumbers.length > 0
        ? `\nS/N: ${sanitizeForPdf(group.serialNumbers.join(", "))}`
        : ""
    const warrantyText = group.warrantyBadge
      ? ` | ${sanitizeForPdf(group.warrantyBadge)}`
      : ""
    const fullDescription = sanitizeForPdf(
      `${group.description}${warrantyText}${serialText}`
    )

    return [
      itemCode,
      fullDescription,
      String(group.quantity),
      group.regUnit.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      group.regTotal.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      group.cashUnit.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      group.cashTotal.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    ]
  })

  autoTable(doc, {
    startY: tableStartY,
    head: tableHead,
    body: tableBody,
    theme: "plain",
    margin: { left: margin, right: margin },
    styles: {
      font: "helvetica",
      fontSize: 7,
      cellPadding: { top: 1.5, bottom: 1.5, left: 1, right: 1 },
      textColor: [0, 0, 0],
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fontStyle: "bold",
      textColor: [0, 0, 0],
      fontSize: 7.5,
      lineWidth: { top: 0.7, bottom: 0.7 },
      lineColor: [0, 0, 0],
      cellPadding: { top: 1.8, bottom: 1.8, left: 1, right: 1 },
    },
    columnStyles: {
      0: { cellWidth: 18, fontStyle: "bold" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 10, halign: "center" },
      3: {
        cellWidth: 23,
        halign: "right",
        textColor: isAR ? [0, 0, 0] : [130, 130, 130],
      },
      4: {
        cellWidth: 23,
        halign: "right",
        fontStyle: isAR ? "bold" : "normal",
        textColor: isAR ? [0, 32, 96] : [130, 130, 130],
      },
      5: {
        cellWidth: 23,
        halign: "right",
        textColor: !isAR ? [0, 0, 0] : [130, 130, 130],
      },
      6: {
        cellWidth: 24,
        halign: "right",
        fontStyle: !isAR ? "bold" : "normal",
        textColor: !isAR ? [0, 0, 0] : [130, 130, 130],
      },
    },
  })

  let finalY = doc.lastAutoTable?.finalY || tableStartY + 20

  doc.setLineWidth(0.6)
  doc.setDrawColor(0, 0, 0)
  doc.line(margin, finalY + 1, margin + contentWidth, finalY + 1)
  doc.line(margin, finalY + 1.8, margin + contentWidth, finalY + 1.8)

  finalY += 4

  const cashPromoTotal = Number(
    quotation?.grandTotal || quotation?.subtotal || 0
  )
  const baseRegularPrice = Math.round((cashPromoTotal / 0.875) * 100) / 100
  const srpTotal = Math.round((cashPromoTotal / 0.96) * 100) / 100
  const financedTotal = installmentCalc?.regularPriceTotalAmount
    ? Number(installmentCalc.regularPriceTotalAmount)
    : Math.round((cashPromoTotal / (termRate > 0 && termRate < 1 ? termRate : 0.875)) * 100) / 100

  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(0, 0, 0)

  let noteY = finalY + 3
  const isPcBuild = quotation?.isPcBuild || options?.isPcBuild
  if (isPcBuild) {
    doc.text(
      "(FREE PC BUILD, CABLE MANAGEMENT & ESSENTIAL APP INSTALLATION)",
      margin,
      noteY
    )
    noteY += 3.4
    doc.setFont("helvetica", "normal")
    doc.setFontSize(6.5)
    doc.text(
      "Exclusive to complete PC builds purchased from us. Not applicable to individual component purchases.",
      margin,
      noteY
    )
    noteY += 4.5
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7.5)
  }

  doc.text(
    "ONE (1) YEAR WARRANTY ON MAJOR PARTS & ONE (1) MONTH ON ACCESSORIES",
    margin,
    noteY
  )
  noteY += 3.4
  doc.setFont("helvetica", "normal")
  doc.setFontSize(6.5)
  doc.text(
    "COMPLETE BOX & INCLUSIONS (7 DAYS OUTRIGHT REPLACEMENT EXCEPT FOR PRINTERS)",
    margin,
    noteY
  )
  noteY += 3.6
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7)
  doc.setTextColor(150, 0, 0)
  doc.text(
    "CASH DISCOUNTED PRICE APPLIES ONLY FOR CASH, GCASH, BANK TRANSFER",
    margin,
    noteY
  )

  const totalsLabelX = margin + contentWidth - 75
  const totalsValueX = margin + contentWidth

  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)

  if (isAR) {
    doc.setTextColor(120, 120, 120)
    doc.text("ORIGINAL CASH PROMO", totalsLabelX, finalY + 4)
    doc.text(
      cashPromoTotal.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      totalsValueX,
      finalY + 4,
      { align: "right" }
    )

    doc.setTextColor(120, 120, 120)
    doc.text("REGULAR PRICE", totalsLabelX, finalY + 8.5)
    doc.text(
      baseRegularPrice.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      totalsValueX,
      finalY + 8.5,
      { align: "right" }
    )

    doc.setFontSize(8)
    doc.setTextColor(0, 32, 96)
    doc.text("TOTAL FINANCED BALANCE", totalsLabelX, finalY + 13)
    doc.text(
      financedTotal.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      totalsValueX,
      finalY + 13,
      { align: "right" }
    )
  } else {
    doc.setTextColor(0, 0, 0)
    doc.text("TOTAL CASH DISCOUNTED PRICE", totalsLabelX, finalY + 4)
    doc.text(
      cashPromoTotal.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      totalsValueX,
      finalY + 4,
      { align: "right" }
    )

    doc.setTextColor(120, 120, 120)
    doc.text("SUGGESTED RETAIL PRICE (SRP)", totalsLabelX, finalY + 8.5)
    doc.text(
      srpTotal.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      totalsValueX,
      finalY + 8.5,
      { align: "right" }
    )

    doc.setTextColor(120, 120, 120)
    doc.text("REGULAR PRICE", totalsLabelX, finalY + 13)
    doc.text(
      baseRegularPrice.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      totalsValueX,
      finalY + 13,
      { align: "right" }
    )
  }

  finalY = Math.max(noteY + 8, finalY + 20)

  const leftSigX = margin
  const rightSigX = margin + contentWidth - 75

  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(0, 0, 0)
  doc.text("Prepared by:", leftSigX, finalY)
  doc.text("CONFORME:", rightSigX, finalY)

  doc.setLineWidth(0.3)
  doc.line(leftSigX, finalY + 12, leftSigX + 65, finalY + 12)
  doc.line(rightSigX, finalY + 12, rightSigX + 75, finalY + 12)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(7)
  doc.setTextColor(60, 60, 60)
  doc.text(
    String(salesman).toUpperCase(),
    leftSigX + 32.5,
    finalY + 15.5,
    { align: "center" }
  )
  doc.text(
    "Signature over Printed Name/ Date",
    rightSigX + 37.5,
    finalY + 15.5,
    { align: "center" }
  )

  if (options.autoPrint) {
    doc.autoPrint()
    const pdfUrl = doc.output("bloburl")
    const printWindow = window.open(pdfUrl, "_blank")
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.focus()
        printWindow.print()
      }
    } else {
      doc.save(`Quotation_${displayCode}.pdf`)
    }
    return
  }

  doc.save(`Quotation_${displayCode}.pdf`)
}

export function printCustomerQuotation(quotation, options = {}) {
  exportCustomerQuotationPdf(quotation, { ...options, autoPrint: true })
}

export function exportPurchaseOrderPdf(order, context) {
  exportBusinessPdf(purchaseOrderDocument(order, context))
}

export function printPurchaseOrder(order, context) {
  printBusinessDocument(purchaseOrderDocument(order, context))
}

export function exportReceivingPdf(receiving, context) {
  exportBusinessPdf(receivingDocument(receiving, context))
}

export function printReceiving(receiving, context) {
  printBusinessDocument(receivingDocument(receiving, context))
}

export function exportInventoryPdf(items, context) {
  exportBusinessPdf(inventoryDocument(items, context))
}

export function exportReportPdf(options) {
  exportBusinessPdf(reportDocument(options))
}

export function printReport(options) {
  printBusinessDocument(reportDocument(options))
}

/**
 * Parses raw cell value for Excel, transforming currency strings into native numbers
 * so formulas (SUM, AVERAGE), sorting, and numerical filters work seamlessly in Microsoft Excel.
 */
function parseExcelValue(val, colLabel = "") {
  if (val === null || val === undefined || val === "") return ""
  if (typeof val === "number") return val

  const str = String(val).trim()

  // Pure integer / float string e.g. "1234.50" or "-500"
  if (/^-?[0-9]+(\.[0-9]+)?$/.test(str)) {
    const num = Number(str)
    if (!Number.isNaN(num)) return num
  }

  // Peso or currency formatted string e.g. "₱1,234.50", "PHP 1,234.50", "-₱500.00", "(₱500.00)"
  const cleanStr = str.replace(/[₱PHP\s]/gi, "").trim()
  if (/^-?\(?[0-9]{1,3}(,[0-9]{3})*(\.[0-9]+)?\)?$/.test(cleanStr)) {
    const isNegative = str.startsWith("-") || str.startsWith("(")
    const num = parseFloat(cleanStr.replace(/[,()]/g, ""))
    if (!Number.isNaN(num)) {
      return isNegative ? -num : num
    }
  }

  // Formatted integer counts e.g. "1,250"
  if (/^[0-9]{1,3}(,[0-9]{3})+$/.test(str)) {
    const intVal = parseInt(str.replace(/,/g, ""), 10)
    if (!Number.isNaN(intVal)) return intVal
  }

  // If column label strongly indicates currency / numeric amount
  if (
    /(amount|charge|price|cost|revenue|margin|total|discount|balance|value|loss|incentive)/i.test(
      colLabel
    )
  ) {
    const digitsOnly = str.replace(/[^0-9.-]/g, "")
    if (digitsOnly && /^-?[0-9]+(\.[0-9]+)?$/.test(digitsOnly)) {
      const num = Number(digitsOnly)
      if (!Number.isNaN(num)) return num
    }
  }

  return sanitizeExcelText(str)
}

/**
 * Enterprise Excel (XLSX) Exporter
 * Generates beautifully structured, mathematical workbooks with native Excel numeric formats.
 * Seamlessly supports both { columns, records } and { headers, rows } calling conventions.
 */
export function exportReportExcel({
  filename = "report",
  filenamePrefix,
  label = "Report",
  title,
  columns = [],
  headers: propHeaders,
  records = [],
  rows: propRows,
  totals = [],
  branch = null,
  branchName,
  generatedBy = null,
  filters = [],
  activeFilters,
}) {
  const actualLabel = title || label || "Report"
  const cleanLabel = sanitizeExcelText(actualLabel)
  const actualBranch = branchName || (branch ? branchText(branch) : "All Branches / Consolidated")
  const cleanBranch = sanitizeExcelText(actualBranch)
  const cleanUser = generatedBy ? sanitizeExcelText(generatedByText(generatedBy)) : "Auto Supply User"
  const genDateStr = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })
  const actualFilename = filenamePrefix || filename || `${cleanLabel}-report`

  const aoa = []

  // 1. Corporate Header Block
  aoa.push(["AUTO SUPPLY PARTS & ACCESSORIES SHOP"])
  aoa.push([`${cleanLabel.toUpperCase()}`])
  aoa.push([`Branch: ${cleanBranch}`, `Generated: ${genDateStr}`, `Generated By: ${cleanUser}`])
  aoa.push([])

  // 2. Filter Parameters Block (if any)
  const rawFilters = activeFilters || filters || []
  if (rawFilters.length > 0) {
    aoa.push(["APPLIED FILTERS", ""])
    rawFilters.forEach((item) => {
      if (Array.isArray(item)) {
        aoa.push([sanitizeExcelText(item[0]), sanitizeExcelText(item[1])])
      } else if (item && typeof item === "object") {
        aoa.push([sanitizeExcelText(item.label || item.key), sanitizeExcelText(item.value)])
      }
    })
    aoa.push([])
  }

  // 3. Summary Metrics & KPIs Block (if any)
  if (totals.length > 0) {
    aoa.push(["SUMMARY METRICS & TOTALS", ""])
    totals.forEach(([key, val]) => {
      const parsedVal = parseExcelValue(val, key)
      aoa.push([sanitizeExcelText(key), parsedVal])
    })
    aoa.push([])
  }

  // 4. Data Table Header Row
  let tableHeaders = []
  if (Array.isArray(propHeaders) && propHeaders.length > 0) {
    tableHeaders = propHeaders.map((h) => sanitizeExcelText(h))
  } else if (Array.isArray(columns) && columns.length > 0) {
    tableHeaders = columns.map(([colLabel]) => sanitizeExcelText(colLabel))
  }
  if (tableHeaders.length > 0) {
    aoa.push(tableHeaders)
  }

  // 5. Data Rows with Typed Values
  const dataRowCount =
    Array.isArray(propRows) && propRows.length > 0
      ? propRows.length
      : Array.isArray(records)
      ? records.length
      : 0

  if (Array.isArray(propRows) && propRows.length > 0) {
    propRows.forEach((row) => {
      if (Array.isArray(row)) {
        const parsedRow = row.map((cell, idx) => {
          const colName = tableHeaders[idx] || ""
          return parseExcelValue(cell, colName)
        })
        aoa.push(parsedRow)
      }
    })
  } else if (Array.isArray(records) && records.length > 0) {
    records.forEach((record) => {
      const row = columns.map(([colLabel, render]) => {
        try {
          const val = render(record)
          return parseExcelValue(val, colLabel)
        } catch {
          return "-"
        }
      })
      aoa.push(row)
    })
  }

  try {
    const worksheet = XLSX.utils.aoa_to_sheet(aoa)

    // Apply native numeric number formatting to all number cells
    const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1")
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C })
        const cell = worksheet[cellAddress]
        if (cell && cell.t === "n") {
          if (Number.isInteger(cell.v)) {
            cell.z = "#,##0"
          } else {
            cell.z = "#,##0.00"
          }
        }
      }
    }

    // Auto-compute generous column widths (never cramped, minimum 16, max 75, +6 padding)
    const maxCols = aoa.reduce((max, r) => Math.max(max, r.length), 0)
    worksheet["!cols"] = Array.from({ length: maxCols }, (_, colIdx) => {
      let maxLen = 14
      aoa.forEach((row, rowIdx) => {
        // Skip title/header banner rows when computing column 0 width
        if (rowIdx < 4 && colIdx === 0) return
        const cellVal = row[colIdx]
        if (cellVal !== undefined && cellVal !== null) {
          const str =
            typeof cellVal === "number"
              ? cellVal.toLocaleString("en-PH", { minimumFractionDigits: 2 })
              : String(cellVal)
          maxLen = Math.max(maxLen, str.length)
        }
      })
      return { wch: Math.max(16, Math.min(75, maxLen + 5)) }
    })

    // Enable Excel AutoFilter dropdown on the data table header row
    const headerRowIdx = aoa.indexOf(tableHeaders)
    if (headerRowIdx >= 0 && dataRowCount > 0 && tableHeaders.length > 0) {
      worksheet["!autofilter"] = {
        ref: XLSX.utils.encode_range({
          s: { r: headerRowIdx, c: 0 },
          e: { r: headerRowIdx + dataRowCount, c: tableHeaders.length - 1 },
        }),
      }
    }

    const workbook = XLSX.utils.book_new()
    const sheetName = cleanLabel.slice(0, 31).replace(/[\\/?*[\]]/g, "")
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName || "Report Data")

    const cleanName = cleanFilename(actualFilename)
    XLSX.writeFile(workbook, `${cleanName}.xlsx`)
  } catch (error) {
    console.error("XLSX export fallback to CSV:", error)
    const csvContent =
      "\uFEFF" +
      aoa
        .map((r) =>
          r
            .map((cell) => {
              const escaped = String(cell ?? "").replace(/"/g, '""')
              return `"${escaped}"`
            })
            .join(",")
        )
        .join("\r\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    const cleanName = cleanFilename(actualFilename)
    link.setAttribute("download", `${cleanName}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }
}

/**
 * Clean isolated HTML printing helper.
 * Opens an isolated popup window to avoid React SPA and modal layout clipping.
 */
export function printBusinessHtml(htmlContent, title = "Print Document") {
  const printWindow = window.open("", "_blank", "width=1000,height=800")
  if (!printWindow) {
    window.alert("Please allow popups to print this document.")
    return
  }

  printWindow.document.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${sanitizeForPdf(title)}</title>
    <style>
      @page {
        size: A4 portrait;
        margin: 12mm 10mm;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        padding: 10px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        color: #0f172a;
        background: #ffffff;
        font-size: 11px;
        line-height: 1.4;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 12px;
      }
      th, td {
        border: 1px solid #94a3b8;
        padding: 5px 6px;
        font-size: 9.5px;
      }
      th {
        background-color: #f1f5f9;
        font-weight: 700;
        color: #0f172a;
      }
      .text-right { text-align: right; }
      .text-center { text-align: center; }
      .font-bold { font-weight: 700; }
      .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
      .uppercase { text-transform: uppercase; }
      .bg-slate-50 { background-color: #f8fafc; }
      .bg-slate-100 { background-color: #f1f5f9; }
      @media print {
        body { padding: 0; }
      }
    </style>
  </head>
  <body>
    ${htmlContent}
  </body>
</html>`)

  printWindow.document.close()

  window.setTimeout(() => {
    printWindow.focus()
    printWindow.print()
    window.setTimeout(() => {
      try {
        printWindow.close()
      } catch {
        // Window already closed
      }
    }, 1500)
  }, 400)
}

/**
 * Official Client Statement of Account (SOA) PDF Generator & Auto-Printer
 * Produces the exact corporate format with aging buckets and accounting notice.
 */
export function exportStatementOfAccountPdf({
  customer = {},
  rows = [],
  totals = {},
  asOfDate = new Date(),
  branch = null,
  user = null,
  autoPrint = false,
}) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  })

  const margin = 10
  const pageWidth = doc.internal.pageSize.getWidth()
  const contentWidth = pageWidth - margin * 2

  // 1. TOP RIGHT: Official Shop Letterhead
  const shopName = "AUTO SUPPLY PARTS AND ACCESSORIES SHOP"
  const shopAddr1 = branch?.address || "Kingspire Business Centre, Km.71, Mac Arthur Highway,"
  const shopAddr2 = "San Isidro, City of San Fernando, Pampanga"
  const shopContact = branch?.contactNo || "0997-732-7689/ 045-404-0673"

  doc.setFont("helvetica", "bold")
  doc.setFontSize(8.5)
  doc.setTextColor(15, 23, 42) // slate-900
  doc.text(shopName, pageWidth - margin, 14, { align: "right" })

  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(71, 85, 105) // slate-600
  doc.text(shopAddr1, pageWidth - margin, 18, { align: "right" })
  doc.text(shopAddr2, pageWidth - margin, 21.5, { align: "right" })
  doc.text(shopContact, pageWidth - margin, 25, { align: "right" })

  // 2. TOP LEFT: Customer Details
  const custName = sanitizeForPdf(customer.fullName || customer.name || "CUSTOMER").toUpperCase()
  const custAddr = sanitizeForPdf(customer.address || customer.city || "—").toUpperCase()

  doc.setFont("helvetica", "bold")
  doc.setFontSize(8.5)
  doc.setTextColor(15, 23, 42)
  doc.text("CUSTOMER:", margin, 16)
  doc.setFont("helvetica", "bold")
  doc.text(custName, margin + 22, 16)

  doc.text("ADDRESS:", margin, 22)
  doc.setFont("helvetica", "normal")
  const addrLines = doc.splitTextToSize(custAddr, 80)
  doc.text(addrLines, margin + 22, 22)

  // 3. CENTER: Statement of Account Title & As-of Date
  const asOfStr = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(asOfDate)

  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.setTextColor(15, 23, 42)
  doc.text("STATEMENT OF ACCOUNT", pageWidth / 2, 34, { align: "center" })

  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(71, 85, 105)
  doc.text(`AS OF ${asOfStr.toUpperCase()}`, pageWidth / 2, 38.5, { align: "center" })

  // 4. AGING BUCKETS TABLE
  const tableHead = [
    [
      "TRANSACTION NO.",
      "DATE",
      "0 - 30 DAYS",
      "31 TO 60 DAYS",
      "61 TO 90 DAYS",
      "91 TO 120 DAYS",
      "121 TO 150 DAYS",
      "OVER 150 DAYS",
      "TOTAL",
    ],
  ]

  const formatCell = (num) => {
    if (!num || Number(num) === 0) return ""
    return Number(num).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  const tableBody = rows.map((r) => [
    sanitizeForPdf(r.transactionNo || "-"),
    r.date ? new Date(r.date).toLocaleDateString("en-US") : "—",
    formatCell(r.bucket_0_30),
    formatCell(r.bucket_31_60),
    formatCell(r.bucket_61_90),
    formatCell(r.bucket_91_120),
    formatCell(r.bucket_121_150),
    formatCell(r.bucket_over_150),
    formatCell(r.total),
  ])

  // Add Grand Total Row
  const tableFoot = [
    [
      "GRAND TOTAL",
      "",
      formatCell(totals.t_0_30),
      formatCell(totals.t_31_60),
      formatCell(totals.t_61_90),
      formatCell(totals.t_91_120),
      formatCell(totals.t_121_150),
      formatCell(totals.t_over_150),
      formatCell(totals.grandTotal),
    ],
  ]

  autoTable(doc, {
    startY: 42,
    head: tableHead,
    body: tableBody,
    foot: tableFoot,
    theme: "grid",
    margin: { left: margin, right: margin },
    styles: {
      font: "helvetica",
      fontSize: 6.8,
      cellPadding: { top: 1.8, bottom: 1.8, left: 1.2, right: 1.2 },
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.15,
      valign: "middle",
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: "bold",
      halign: "center",
      fontSize: 6.8,
      lineColor: [148, 163, 184],
      lineWidth: 0.2,
    },
    footStyles: {
      fillColor: [248, 250, 252],
      textColor: [15, 23, 42],
      fontStyle: "bold",
      lineColor: [100, 116, 139],
      lineWidth: 0.3,
    },
    columnStyles: {
      0: { cellWidth: 30, halign: "center", fontStyle: "bold" },
      1: { cellWidth: 18, halign: "center" },
      2: { cellWidth: "auto", halign: "right" },
      3: { cellWidth: "auto", halign: "right" },
      4: { cellWidth: "auto", halign: "right" },
      5: { cellWidth: "auto", halign: "right" },
      6: { cellWidth: "auto", halign: "right" },
      7: { cellWidth: "auto", halign: "right" },
      8: { cellWidth: "auto", halign: "right", fontStyle: "bold" },
    },
  })

  let finalY = doc.lastAutoTable?.finalY || 100

  // 5. ACCOUNTING COLLECTION NOTE
  finalY += 6
  doc.setFont("helvetica", "italic")
  doc.setFontSize(7.5)
  doc.setTextColor(71, 85, 105)
  const noteText =
    "Note: Pls. disregard if payment has been made and send proof payment. Thank you very much."
  doc.text(noteText, margin, finalY)

  doc.setFont("helvetica", "bold")
  doc.text("Auto Supply Accounting", margin, finalY + 4)

  // Prepared By footer
  finalY += 14
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7)
  doc.setTextColor(100, 116, 139)
  const encoder = user?.fullName || user?.username || "Accounting Department"
  doc.text(`Prepared by: ${sanitizeForPdf(encoder)}`, margin, finalY)
  doc.text(`Generated: ${new Date().toLocaleString("en-PH")}`, pageWidth - margin, finalY, {
    align: "right",
  })

  const cleanCust = custName.replace(/[^a-zA-Z0-9]/g, "_")
  const pdfFilename = `statement_of_account_${cleanCust}`

  if (autoPrint) {
    doc.autoPrint()
    const pdfUrl = doc.output("bloburl")
    const printWindow = window.open(pdfUrl, "_blank")
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.focus()
        printWindow.print()
      }
    } else {
      doc.save(`${pdfFilename}.pdf`)
    }
    return
  }

  doc.save(`${pdfFilename}.pdf`)
}


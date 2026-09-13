import { createElement as h } from "react"

function formatNumber(value) {
  const number = Number(value || 0)
  return number.toLocaleString("en-PH")
}

function formatDate(value) {
  if (!value) return "No date"

  return new Date(value).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function movementLabel(type) {
  const labels = {
    STOCK_IN: "Stock in",
    TRANSFER_IN: "Transfer in",
    TRANSFER_OUT: "Transfer out",
    ADJUSTMENT_IN: "Adjustment in",
    ADJUSTMENT_OUT: "Adjustment out",
  }

  return labels[type] || type || "Movement"
}

export default function StockMovementHistoryPanel({ movements = [], isLoading = false, message = "" }) {
  return h(
    "section",
    {
      className:
        "mt-5 rounded-3xl border border-[var(--color-border)] bg-white p-5 shadow-sm",
    },
    h(
      "div",
      {
        className:
          "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
      },
      h(
        "div",
        null,
        h(
          "p",
          {
            className:
              "text-xs font-black uppercase tracking-[0.2em] text-[var(--color-maroon)]",
          },
          "Stock movement history"
        ),
        h(
          "h3",
          {
            className:
              "mt-2 text-xl font-black text-[var(--color-text-strong)]",
          },
          "Recent movements"
        )
      ),
      h(
        "p",
        {
          className: "text-sm font-bold text-[var(--color-muted)]",
        },
        `${formatNumber(movements.length)} record(s)`
      )
    ),

    isLoading
      ? h(
          "p",
          {
            className:
              "mt-5 rounded-2xl bg-[var(--color-soft)] px-4 py-3 text-sm font-bold text-[var(--color-muted)]",
          },
          "Loading movement history..."
        )
      : message
        ? h(
            "p",
            {
              className:
                "mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700",
            },
            message
          )
        : movements.length === 0
          ? h(
              "p",
              {
                className:
                  "mt-5 rounded-2xl bg-[var(--color-soft)] px-4 py-3 text-sm font-bold text-[var(--color-muted)]",
              },
              "No movement history loaded yet."
            )
          : h(
          "div",
          {
            className: "mt-5 overflow-x-auto rounded-2xl border border-[var(--color-border)]",
          },
          h(
            "table",
            {
              className: "w-full min-w-[900px] text-left text-sm",
            },
            h(
              "thead",
              {
                className: "bg-[var(--color-soft)] text-xs uppercase text-[var(--color-muted)]",
              },
              h(
                "tr",
                null,
                h("th", { className: "px-4 py-3" }, "Type"),
                h("th", { className: "px-4 py-3" }, "Qty"),
                h("th", { className: "px-4 py-3" }, "Previous"),
                h("th", { className: "px-4 py-3" }, "New"),
                h("th", { className: "px-4 py-3" }, "Reference"),
                h("th", { className: "px-4 py-3" }, "Reason / Notes"),
                h("th", { className: "px-4 py-3" }, "Date"),
                h("th", { className: "px-4 py-3" }, "By")
              )
            ),
            h(
              "tbody",
              {
                className: "divide-y divide-[var(--color-border)]",
              },
              ...movements.map((movement) =>
                h(
                  "tr",
                  {
                    key: movement.id,
                    className: "align-top",
                  },
                  h("td", { className: "px-4 py-3 font-black" }, movementLabel(movement.type)),
                  h("td", { className: "px-4 py-3 font-bold" }, formatNumber(movement.quantity)),
                  h("td", { className: "px-4 py-3" }, formatNumber(movement.previousQuantity)),
                  h("td", { className: "px-4 py-3" }, formatNumber(movement.newQuantity)),
                  h("td", { className: "px-4 py-3" }, movement.referenceNo || "—"),
                  h("td", { className: "px-4 py-3" }, movement.remarks || "—"),
                  h("td", { className: "px-4 py-3" }, formatDate(movement.movementDate)),
                  h("td", { className: "px-4 py-3" }, movement.createdBy?.fullName || movement.createdBy?.username || "—")
                )
              )
            )
          )
        )
  )
}


import { DEFAULT_SHOP_INFO, extractIntakeRecord } from "./serviceJobForms"

function formatDate(dateValue) {
  if (!dateValue) return ""
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return String(dateValue)
  const mm = date.getMonth() + 1
  const dd = date.getDate()
  const yyyy = date.getFullYear()
  return `${mm}/${dd}/${yyyy}`
}

function PrintSquareBox({ checked = false }) {
  return (
    <span className="jo-square-checkbox">
      {checked ? "X" : ""}
    </span>
  )
}

export default function JobOrderReceiptPrint({ isBlank = false, job = {} }) {
  const branch = job.branch || {}
  const shopName = branch.name || DEFAULT_SHOP_INFO.name || "ARUNAFELTZ COMPUTER PARTS and ACCESSORIES SHOP"
  const shopAddress = branch.address || DEFAULT_SHOP_INFO.address || "Kingspire Business Centre, Km.71, Mac Arthur Highway, San Isidro, City of San Fernando, Pampanga"
  const shopContact = branch.contactNo || DEFAULT_SHOP_INFO.contactNo || "0961-873-5798/ 045-404-0673"

  const intake = isBlank ? {} : extractIntakeRecord(job)

  const customerName = isBlank ? "" : (job.customerNameSnapshot || job.customer?.fullName || "")
  const customerContact = isBlank ? "" : (job.customerContactSnapshot || job.customer?.mobileNumber || job.customer?.email || "")
  const customerAddress = isBlank ? "" : (intake?.customerAddress || job.customer?.address || "")

  const technicianName = isBlank ? "" : (job.assignedTechnician?.fullName || job.serviceDoneBy?.fullName || job.receivedBy?.fullName || "")
  const jobCode = isBlank ? "" : (job.jobCode || "")
  const dateStr = isBlank ? "" : formatDate(job.receivedAt || job.createdAt)
  const releasedByName = isBlank ? "" : (job.releasedBy?.fullName || job.releasedByStaffSnapshot || "")
  const releasedDateStr = isBlank ? "" : (job.releasedAt ? formatDate(job.releasedAt) : "")

  // Unit details & type resolution
  const unitTypeFromIntake = (intake?.unitType || "").toLowerCase()
  const devDesc = (job.deviceDescription || "").toLowerCase()
  const brandModel = isBlank ? "" : (intake?.brandModel || job.deviceDescription || "")
  const serialNumber = isBlank ? "" : (job.serialNumber || "")

  const isUnit = (keyword) => {
    if (isBlank) return false
    const kw = keyword.toLowerCase()
    return unitTypeFromIntake.includes(kw) || devDesc.includes(kw)
  }

  const isLaptop = isUnit("laptop") || isUnit("notebook")
  const isMotherboard = isUnit("motherboard") || isUnit("mobo")
  const isGpu = isUnit("graphics") || isUnit("gpu") || isUnit("video card") || isUnit("rx") || isUnit("rtx") || isUnit("gtx")
  const isDesktop = isUnit("desktop") || isUnit("system unit") || isUnit("pc") || isUnit("tower")
  const isPrinter = isUnit("printer")
  const isOtherUnit = !isBlank && !isLaptop && !isMotherboard && !isGpu && !isDesktop && !isPrinter && Boolean(brandModel)
  const otherUnitText = isOtherUnit ? brandModel : ""

  // Requested services resolution
  const hasService = (keyword) => {
    if (isBlank) return false
    const kw = keyword.toLowerCase()
    const reqs = (intake?.requestedServices || []).map((s) => s.toLowerCase())
    if (reqs.some((r) => r.includes(kw))) return true
    const title = (job.jobTitle || "").toLowerCase()
    if (title.includes(kw)) return true
    if (kw === "repair" && ((job.repairType || "").includes("REPAIR") || title.includes("repair"))) return true
    if (kw === "diagnostic" && (intake?.intakeType === "DIAGNOSTIC" || (job.repairType || "").includes("BOARD") || title.includes("diagnos") || title.includes("check"))) return true
    if (kw === "maintenance" && (intake?.intakeType === "MAINTENANCE" || title.includes("maintenance") || title.includes("pms"))) return true
    if (kw === "cleaning" && (title.includes("clean") || title.includes("repaste") || reqs.some((r) => r.includes("clean")))) return true
    if (kw === "upgrade" && (title.includes("upgrade") || reqs.some((r) => r.includes("upgrade")))) return true
    if (kw === "reformat" && (title.includes("reformat") || title.includes("os") || reqs.some((r) => r.includes("reformat")))) return true
    if (kw === "printer service" && (title.includes("printer") || reqs.some((r) => r.includes("printer")))) return true
    return false
  }

  const isDiagnostic = hasService("diagnostic")
  const isRepair = hasService("repair")
  const isMaintenance = hasService("maintenance")
  const isCleaning = hasService("cleaning")
  const isUpgrade = hasService("upgrade")
  const isReformat = hasService("reformat")
  const isPrinterService = hasService("printer service")
  const isOtherService = !isBlank && !isDiagnostic && !isRepair && !isMaintenance && !isCleaning && !isUpgrade && !isReformat && !isPrinterService && Boolean(job.jobTitle)
  const otherServiceText = isOtherService ? job.jobTitle : ""

  // Problem description
  const problemText = isBlank ? "" : (job.problemDescription || intake?.problemDescription || "")

  // Current Status & Stage detection
  const status = isBlank ? "" : (job.status || "PENDING")
  const hasFormulatedTasks = !isBlank && (
    Number(job.finalServiceCharge || job.baseServiceCharge || 0) > 0 ||
    Boolean(job.serviceNotes && job.serviceNotes.includes("[SERVICE_TASKS_V1]:"))
  )
  const isReceived = !isBlank && (status === "PENDING" || status === "IN_PROGRESS" || status === "READY_FOR_RELEASE" || status === "COMPLETED")
  const isUnderDiagnosis = !isBlank && status === "PENDING" && !hasFormulatedTasks
  const isWaitingApproval = !isBlank && status === "PENDING" && hasFormulatedTasks
  const isRepairInProgress = !isBlank && status === "IN_PROGRESS"
  const isTesting = !isBlank && status === "IN_PROGRESS" && (
    (job.serviceNotes || "").toLowerCase().includes("test") ||
    (job.diagnosis || "").toLowerCase().includes("test")
  )
  const isReadyPickup = !isBlank && (status === "READY_FOR_RELEASE" || status === "COMPLETED")

  return (
    <div className="jo-official-print-sheet">
      {/* 1. Header Section */}
      <header className="jo-official-header">
        <div className="jo-official-brand">
          <h1 className="jo-official-shop-name">{shopName}</h1>
          <p className="jo-official-shop-address">{shopAddress}</p>
          <p className="jo-official-shop-contact">{shopContact}</p>
        </div>

        <div className="jo-official-meta">
          <div className="jo-official-meta-row">
            <span className="jo-official-meta-label">J.O. #</span>
            <span className="jo-official-jo-num">{isBlank ? "______________" : jobCode}</span>
          </div>
          <div className="jo-official-meta-row">
            <span className="jo-official-meta-label">DATE:</span>
            <span className="jo-official-meta-val">{isBlank ? "______________" : dateStr}</span>
          </div>
        </div>
      </header>

      {/* 2. Title Banner */}
      <div className="jo-official-title-banner">
        JOB ORDER/ SERVICE REQUEST RECEIPT
      </div>

      {/* 3. Customer Info */}
      <section className="jo-official-customer-section">
        <div className="jo-official-field-row">
          <div className="jo-official-flex-field" style={{ flex: 3 }}>
            <span className="jo-official-field-label">Received from:</span>
            <span className="jo-official-underline-val jo-bold">{customerName}</span>
          </div>
          <div className="jo-official-flex-field" style={{ flex: 2 }}>
            <span className="jo-official-field-label">Contact No.:</span>
            <span className="jo-official-underline-val">{customerContact}</span>
          </div>
        </div>

        <div className="jo-official-field-row">
          <div className="jo-official-flex-field" style={{ width: "100%" }}>
            <span className="jo-official-field-label">Address:</span>
            <span className="jo-official-underline-val">{customerAddress}</span>
          </div>
        </div>
      </section>

      {/* 4. Unit Information Section */}
      <section className="jo-official-section">
        <div className="jo-official-section-header">
          <span className="jo-official-section-title">Unit Information</span>
          <span className="jo-official-section-sub">Type of Unit (x): <em>Put x on the Box</em></span>
        </div>

        <div className="jo-official-checkbox-grid jo-grid-3-col">
          <label className="jo-official-check-item">
            <PrintSquareBox checked={isLaptop} />
            <span>Laptop</span>
          </label>
          <label className="jo-official-check-item">
            <PrintSquareBox checked={isMotherboard} />
            <span>Motherboard</span>
          </label>
          <label className="jo-official-check-item">
            <PrintSquareBox checked={isGpu} />
            <span>Graphics Card (GPU)</span>
          </label>
          <label className="jo-official-check-item">
            <PrintSquareBox checked={isDesktop} />
            <span>Desktop / System Unit</span>
          </label>
          <label className="jo-official-check-item">
            <PrintSquareBox checked={isPrinter} />
            <span>Printer</span>
          </label>
          <label className="jo-official-check-item">
            <PrintSquareBox checked={isOtherUnit} />
            <span>Other: <span className="jo-inline-val-line">{otherUnitText}</span></span>
          </label>
        </div>

        <div className="jo-official-field-row" style={{ marginTop: "2mm" }}>
          <div className="jo-official-flex-field" style={{ flex: 1.2 }}>
            <span className="jo-official-field-label">Brand &amp; Model:</span>
            <span className="jo-official-underline-val jo-bold">{brandModel}</span>
          </div>
          <div className="jo-official-flex-field" style={{ flex: 1 }}>
            <span className="jo-official-field-label">Serial Number (if available):</span>
            <span className="jo-official-underline-val">{serialNumber}</span>
          </div>
        </div>
      </section>

      {/* 5. Requested Service Section */}
      <section className="jo-official-section">
        <div className="jo-official-section-header">
          <span className="jo-official-section-title">Requested Service:</span>
          <span className="jo-official-section-sub"><em>Put x on the Box</em></span>
        </div>

        <div className="jo-official-checkbox-grid jo-grid-4-col">
          <label className="jo-official-check-item">
            <PrintSquareBox checked={isDiagnostic} />
            <span>Diagnostic</span>
          </label>
          <label className="jo-official-check-item">
            <PrintSquareBox checked={isRepair} />
            <span>Repair</span>
          </label>
          <label className="jo-official-check-item">
            <PrintSquareBox checked={isMaintenance} />
            <span>Maintenance</span>
          </label>
          <label className="jo-official-check-item">
            <PrintSquareBox checked={isCleaning} />
            <span>Cleaning</span>
          </label>
          <label className="jo-official-check-item">
            <PrintSquareBox checked={isUpgrade} />
            <span>Upgrade</span>
          </label>
          <label className="jo-official-check-item">
            <PrintSquareBox checked={isReformat} />
            <span>Reformat</span>
          </label>
          <label className="jo-official-check-item">
            <PrintSquareBox checked={isPrinterService} />
            <span>Printer Service</span>
          </label>
          <label className="jo-official-check-item">
            <PrintSquareBox checked={isOtherService} />
            <span>Other <span className="jo-inline-val-line">{otherServiceText}</span></span>
          </label>
        </div>
      </section>

      {/* 6. Customer Reported Issue or Request */}
      <section className="jo-official-section">
        <div className="jo-official-section-header">
          <span className="jo-official-section-title">Customer Reported Issue or Request:</span>
        </div>
        <div className="jo-official-issue-lines">
          <div className="jo-official-issue-line jo-bold">
            {problemText}
          </div>
          <div className="jo-official-issue-line" />
        </div>
      </section>

      {/* 7. TERMS & CONDITIONS */}
      <section className="jo-official-terms-section">
        <h2 className="jo-official-terms-title">TERMS &amp; CONDITIONS</h2>

        <div className="jo-official-term-item">
          <strong>Free Check-up &amp; Diagnostic Fee:</strong> Basic inspection and initial assessment are <strong>FREE</strong>. Advanced diagnostics (including board-level troubleshooting, extensive testing, disassembly, firmware programming, or complex fault isolation) may incur a <strong>₱300.00–₱500.00</strong> diagnostic fee. No fee will be charged without customer approval and will be waived if the approved repair proceeds.
        </div>

        <div className="jo-official-term-item">
          <strong>Service Risk:</strong> Electronic devices may have hidden defects, liquid damage, corrosion, previous repairs, or other pre-existing conditions. While we exercise reasonable care, diagnosis or repair may cause an already unstable unit to become completely non-functional due to its existing condition. Diagnosis does not guarantee a successful repair. The shop is not liable for loss or damage caused by robbery, fire, typhoon, flood, earthquake, or other fortuitous events beyond its reasonable control.
        </div>

        <div className="jo-official-term-item">
          <strong>Data Responsibility:</strong> The customer is responsible for backing up all important data. The shop is not liable for any loss of data, software, or personal files.
        </div>

        <div className="jo-official-term-item">
          <strong>Warranty:</strong> if applicable, covers only the specific repair or replacement performed. It does not cover unrelated failures, pre-existing defects, liquid damage, misuse, power surges, unauthorized repairs, customer-supplied parts, software issues, or physical damage after release.
        </div>

        <div className="jo-official-term-item">
          <strong>Claiming, Storage &amp; Abandoned Units:</strong> Completed or unserviceable units must be claimed within <strong>7 calendar days</strong> after notification. Units left beyond 15 days will incur a <strong>₱50.00 storage fee per day</strong> until claimed. Units unclaimed after <strong>30 days</strong> may be considered abandoned and may be disposed by Auto Supply.
        </div>

        <div className="jo-official-term-item">
          <strong>Release of Unit:</strong> Present this <strong>Job Order / Service Request Receipt</strong> when claiming your unit.<br />
          If claimed by another person, present the Receipt, an Authorization Letter, and valid IDs of both the customer and the claimant.
        </div>
      </section>

      {/* 8. CUSTOMER DECLARATION */}
      <section className="jo-official-declaration-section">
        <h2 className="jo-official-declaration-title">CUSTOMER DECLARATION</h2>
        <p className="jo-official-declaration-text">
          I have read, understood, and agree to the Terms &amp; Conditions stated above. I authorize Auto Supply to perform the requested diagnostic, repair, PMS, parts installation, or other automotive services on my vehicle/unit.
        </p>
      </section>

      {/* 9. Signatures & Status Grid */}
      <section className="jo-official-sig-status-grid">
        <div className="jo-official-left-sig-col">
          <div className="jo-official-sig-box">
            <div className="jo-official-sig-line">
              <span className="jo-official-sig-name">{customerName}</span>
            </div>
            <span className="jo-official-sig-caption">Customer Signature Over Printed Name</span>
          </div>

          <div className="jo-official-status-block">
            <span className="jo-official-status-label">Status:</span>
            <div className="jo-official-status-grid">
              <label className="jo-official-status-item">
                <PrintSquareBox checked={isReceived} />
                <span>Received</span>
              </label>
              <label className="jo-official-status-item">
                <PrintSquareBox checked={isUnderDiagnosis} />
                <span>Under Diagnosis</span>
              </label>
              <label className="jo-official-status-item">
                <PrintSquareBox checked={isWaitingApproval} />
                <span>Waiting for Customer Approval</span>
              </label>
              <label className="jo-official-status-item">
                <PrintSquareBox checked={isRepairInProgress} />
                <span>Repair In Progress</span>
              </label>
              <label className="jo-official-status-item">
                <PrintSquareBox checked={isTesting} />
                <span>Testing /Stresstest</span>
              </label>
              <label className="jo-official-status-item">
                <PrintSquareBox checked={isReadyPickup} />
                <span>Ready for Pickup</span>
              </label>
            </div>
          </div>
        </div>

        <div className="jo-official-right-sig-col">
          <div className="jo-official-received-by-wrap">
            <span className="jo-official-received-label">Received by:</span>
            <div className="jo-official-tech-sig-box">
              <div className="jo-official-tech-name-line">
                <span className="jo-bold">{technicianName || (isBlank ? "" : "LEO")}</span>
              </div>
              <span className="jo-official-sig-caption">Technician Full Name &amp; Signature</span>
            </div>
          </div>
        </div>
      </section>

      {/* 10. UNIT RELEASE Box */}
      <footer className="jo-official-unit-release-box">
        <div className="jo-official-release-header">
          UNIT RELEASE
        </div>
        <div className="jo-official-release-body">
          <div className="jo-official-field-row">
            <div className="jo-official-flex-field" style={{ flex: 1.2 }}>
              <span className="jo-official-field-label">Released By:</span>
              <span className="jo-official-underline-val jo-bold">{releasedByName}</span>
            </div>
            <div className="jo-official-flex-field" style={{ flex: 1 }}>
              <span className="jo-official-field-label">Date Released:</span>
              <span className="jo-official-underline-val">{releasedDateStr}</span>
            </div>
          </div>

          <div className="jo-official-field-row" style={{ marginTop: "2mm" }}>
            <div className="jo-official-flex-field" style={{ flex: 1 }}>
              <span className="jo-official-field-label">Received By (Customer):</span>
              <span className="jo-official-underline-val jo-bold">{job.status === "COMPLETED" ? customerName : ""}</span>
            </div>
          </div>

          <div className="jo-official-field-row" style={{ marginTop: "2mm" }}>
            <div className="jo-official-flex-field" style={{ flex: 1 }}>
              <span className="jo-official-field-label">Customer Signature:</span>
              <span className="jo-official-underline-val" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

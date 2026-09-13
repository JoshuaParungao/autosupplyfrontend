// Utilities and types for Service / Job Order Intakes and Receipts

export const INTAKE_RECORD_HEADER = "[INTAKE_RECORD_V1]:"

export const DEFAULT_SHOP_INFO = {
  name: "AUTO SUPPLY & AUTO SERVICE CENTER",
  address: "Main Highway Commercial Center, City of San Fernando, Pampanga",
  contactNo: "0917-123-4567 / 045-404-0000",
}

export const UNIT_TYPES = [
  "Sedan",
  "SUV / AUV",
  "Pickup Truck",
  "MPV / Van",
  "Hatchback",
  "Motorcycle / Scooter",
  "Commercial Truck / Fleet",
  "Loose Engine / Transmission",
  "Loose Alternator / Starter / Part",
  "Other Vehicle / Assembly",
]

export const ACCESSORIES_OPTIONS = [
  "Car Key / Remote",
  "Spare Tire & Jack",
  "Dashcam / Headunit",
  "Service Manual / Booklet",
  "Old Replaced Parts",
  "Others",
]

export const PHYSICAL_CONDITIONS = [
  "Good / Well Maintained",
  "Dents / Body Scratches",
  "Fluid / Oil Leakage Noted",
  "Worn Out Tires / Brakes",
  "Check Engine / Warning Light ON",
  "Underchassis Rust / Corrosion",
  "Missing Clips / Bolts",
  "Signs of Previous Repair / Modification",
  "Battery Terminal Corrosion",
  "Other Mechanical Notes",
]

export const PREVIOUS_REPAIR_ACTIONS = [
  "OBD-II Diagnostic Only",
  "PMS / Oil Change Service",
  "Brake Overhaul",
  "Underchassis & Suspension Repair",
  "Engine Top / General Overhaul",
  "Transmission Repair / Flush",
  "Electrical / Alternator Repair",
  "Parts Replacement Only",
  "Other",
]

export const REQUESTED_MAINTENANCE_SERVICES = [
  "Preventive Maintenance Service (PMS)",
  "Engine Oil & Filter Change (Change Oil)",
  "Transmission Fluid (ATF/CVTF) Drain & Fill",
  "Brake Pads / Shoes Replacement",
  "Brake Rotor Resurfacing / Replacement",
  "Brake Bleeding & Fluid Flush",
  "Radiator Coolant Flush & Refill",
  "Spark Plugs Replacement",
  "Engine Tune-Up & Throttle Body Cleaning",
  "Suspension Shock / Strut Replacement",
  "Ball Joint / Tie Rod / Stabilizer Link Replacement",
  "Wheel Alignment & Tire Balancing",
  "Battery Testing & Replacement",
  "Aircon Cabin Filter Replacement",
  "Alternator / Starter Motor Replacement",
  "Car Aircon Cleaning / Freon Recharge",
  "Wiper Blade Replacement",
  "Diagnostic OBD-II Scan & Troubleshooting",
  "General Mechanical Repair",
  "Other Auto Service",
]

export const SPECIAL_ATTENTION_ITEMS = [
  "Check Engine Light (MIL) On",
  "Squeaking / Grinding Brake Noise",
  "Engine Overheating / High Coolant Temp",
  "Hard Starting / Battery Drain",
  "Underchassis Clunking / Knocking Sound",
  "Steering Vibration / Pulling to One Side",
  "Black / White Exhaust Smoke",
  "Oil / Fluid Puddle Under Vehicle",
  "Poor Acceleration / Engine Hesitation",
  "Aircon Blowing Warm Air",
  "Other Symptoms",
]

export function extractIntakeRecord(job) {
  if (!job) return null
  const notes = job.serviceNotes || ""
  const idx = notes.indexOf(INTAKE_RECORD_HEADER)
  if (idx !== -1) {
    try {
      const rest = notes.slice(idx + INTAKE_RECORD_HEADER.length)
      const nextHeaderIdx = rest.search(/\[(SERVICE_TASKS_V1|SERVICE_PARTS_V1)\]:/)
      const jsonStr = nextHeaderIdx !== -1 ? rest.slice(0, nextHeaderIdx).trim() : rest.split("\n\n")[0].trim()
      return JSON.parse(jsonStr)
    } catch {
      // ignore parse error
    }
  }

  // If no structured envelope is stored, synthesize an intake object from the job's standard fields
  return {
    intakeType: job.repairType === "BOARD_LEVEL_REPAIR" ? "DIAGNOSTIC" : "MAINTENANCE",
    customerAddress: job.customer?.address || "",
    unitType: detectUnitType(job.deviceDescription),
    brandModel: job.deviceDescription || "",
    serialNumber: job.serialNumber || "",
    problemSymptoms: job.problemDescription || "",
    whenProblemStarted: "",
    checkedByOtherShop: "No",
    numShopsHandled: "",
    otherShopsList: "",
    previousRepairs: [],
    otherPreviousRepairs: "",
    componentsModified: "No",
    receivedAccessories: parseChecklist(job.accessoriesReceived, ACCESSORIES_OPTIONS),
    otherAccessories: extractOtherText(job.accessoriesReceived, ACCESSORIES_OPTIONS),
    physicalConditions: parseChecklist(job.receivingRemarks, PHYSICAL_CONDITIONS),
    otherConditionNotes: extractOtherText(job.receivingRemarks, PHYSICAL_CONDITIONS),
    requestedServices: parseChecklist(job.jobTitle + " " + (job.problemDescription || ""), REQUESTED_MAINTENANCE_SERVICES),
    otherRequestedService: "",
    firstTimeMaintenance: "Yes (First Maintenance)",
    numTimesMaintained: "",
    lastMaintenanceWhen: "",
    lastMaintenanceWho: "",
    upgradedDuringMaintenance: "No",
    upgradedSpecify: "",
    specialAttention: [],
    otherSpecialAttention: "",
  }
}

export const SERVICE_TASKS_HEADER = "[SERVICE_TASKS_V1]:"
export const SERVICE_PARTS_HEADER = "[SERVICE_PARTS_V1]:"

export function extractServiceTasks(job) {
  if (!job) return []
  const notes = job.serviceNotes || ""
  const idx = notes.indexOf(SERVICE_TASKS_HEADER)
  if (idx !== -1) {
    try {
      const rest = notes.slice(idx + SERVICE_TASKS_HEADER.length)
      const nextHeaderIdx = rest.search(/\[(INTAKE_RECORD_V1|SERVICE_PARTS_V1)\]:/)
      const jsonStr = nextHeaderIdx !== -1 ? rest.slice(0, nextHeaderIdx).trim() : rest.split("\n\n")[0].trim()
      const parsed = JSON.parse(jsonStr)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    } catch {
      // ignore parse error
    }
  }

  // Fallback: If no explicit task list is stored yet, synthesize from single job line
  const tech = job.serviceDoneBy || job.assignedTechnician
  const amount = Number(job.baseServiceCharge ?? job.finalServiceCharge ?? job.estimatedServiceCharge ?? 0)
  if (job.jobTitle || amount > 0) {
    return [
      {
        id: `task-primary-${job.id || "1"}`,
        title: job.jobTitle || "General Service",
        amount: amount,
        technicianId: tech?.id || "",
        technicianName: tech?.fullName || "Assigned Technician",
        warrantyDuration: "30 DAYS SERVICE WARRANTY",
      },
    ]
  }
  return []
}

export function extractServiceParts(job) {
  if (!job) return []
  const notes = job.serviceNotes || ""
  const idx = notes.indexOf(SERVICE_PARTS_HEADER)
  if (idx !== -1) {
    try {
      const rest = notes.slice(idx + SERVICE_PARTS_HEADER.length)
      const nextHeaderIdx = rest.search(/\[(INTAKE_RECORD_V1|SERVICE_TASKS_V1)\]:/)
      const jsonStr = nextHeaderIdx !== -1 ? rest.slice(0, nextHeaderIdx).trim() : rest.split("\n\n")[0].trim()
      const parsed = JSON.parse(jsonStr)
      if (Array.isArray(parsed)) return parsed
    } catch {
      // ignore parse error
    }
  }
  return []
}

export function serializeStructuredNotes({
  intakeRecord = null,
  tasks = [],
  parts = [],
  freeNotes = "",
}) {
  const partsList = []
  if (intakeRecord) {
    partsList.push(`${INTAKE_RECORD_HEADER}${JSON.stringify(intakeRecord)}`)
  }
  if (Array.isArray(tasks) && tasks.length > 0) {
    partsList.push(`${SERVICE_TASKS_HEADER}${JSON.stringify(tasks)}`)
  }
  if (Array.isArray(parts) && parts.length > 0) {
    partsList.push(`${SERVICE_PARTS_HEADER}${JSON.stringify(parts)}`)
  }
  const cleanFree = (freeNotes || "").trim()
  if (cleanFree) {
    // strip out existing header blocks from free notes if present
    const stripped = cleanFree
      .replace(/\[INTAKE_RECORD_V1\]:.*?(\n\n|$)/gs, "")
      .replace(/\[SERVICE_TASKS_V1\]:.*?(\n\n|$)/gs, "")
      .replace(/\[SERVICE_PARTS_V1\]:.*?(\n\n|$)/gs, "")
      .trim()
    if (stripped) {
      partsList.push(stripped)
    }
  }
  return partsList.join("\n\n")
}

function detectUnitType(deviceDesc = "") {
  const d = deviceDesc.toLowerCase()
  if (d.includes("macbook") || d.includes("imac") || d.includes("apple")) return "MacBook"
  if (d.includes("laptop") || d.includes("notebook")) return "Laptop"
  if (d.includes("desktop") || d.includes("system unit")) return "Desktop"
  if (d.includes("gpu") || d.includes("graphics card") || d.includes("geforce") || d.includes("radeon") || d.includes("rtx") || d.includes("gtx")) return "GPU"
  if (d.includes("motherboard") || d.includes("mobo")) return "Motherboard"
  if (d.includes("printer")) return "Printer"
  if (d.includes("monitor")) return "Monitor"
  if (d.includes("phone") || d.includes("tablet") || d.includes("ipad") || d.includes("android")) return "Smartphone / Tablet"
  if (d.includes("console") || d.includes("playstation") || d.includes("ps4") || d.includes("ps5") || d.includes("switch") || d.includes("xbox")) return "Console"
  if (d.includes("component") || d.includes("ram") || d.includes("psu") || d.includes("ssd") || d.includes("hdd")) return "PC Component"
  return "Other"
}

function parseChecklist(text = "", options = []) {
  if (!text) return []
  const lower = text.toLowerCase()
  return options.filter((opt) => lower.includes(opt.toLowerCase().replace(/[()]/g, "").trim()))
}

function extractOtherText(text = "") {
  if (!text) return ""
  return text
}


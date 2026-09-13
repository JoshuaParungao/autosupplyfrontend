import { useEffect, useState } from "react"
import { Building2, LogOut, MapPin, Phone } from "lucide-react"

import Card from "../../components/ui/Card"
import Badge from "../../components/ui/Badge"
import { getBranches } from "../../features/branches/branches.api"

function BranchChooserPage({ onSelectBranch, onLogout, user }) {
  const [branches, setBranches] = useState([])
  const [errorMessage, setErrorMessage] = useState("")
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadBranches = async () => {
      setIsLoading(true)
      setErrorMessage("")

      try {
        const response = await getBranches()

        if (!response?.success || !Array.isArray(response?.data)) {
          throw new Error("Invalid branches response from server.")
        }

        setBranches(response.data.filter((branch) => branch.status === "ACTIVE"))
      } catch (error) {
        setErrorMessage(
          error?.response?.data?.message ||
            error?.message ||
            "Unable to load branches.",
        )
      } finally {
        setIsLoading(false)
      }
    }

    loadBranches()
  }, [])

  return (
    <main className="min-h-svh bg-[var(--color-page)] px-4 py-8 text-[var(--color-text)]">
      <section className="mx-auto w-full max-w-5xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <img
              alt="Auto Supply Logo"
              className="size-14 rounded-2xl object-contain shadow-card bg-white p-1"
              src="/arunafeltzlogo.png"
            />
            <div className="min-w-0">
              <Badge tone="maroon">Branch Selection</Badge>
              <h1 className="brand-text mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-text-strong)]">
                Auto Supply
              </h1>
              <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
                Welcome, {user?.fullName || user?.username || "Super Owner"}. Select a branch to monitor.
              </p>
            </div>
          </div>

          <button
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--color-maroon)] shadow-card"
            onClick={onLogout}
            type="button"
          >
            <LogOut className="size-4" />
            Logout
          </button>
        </div>

        {isLoading ? (
          <Card className="mt-6">
            <p className="font-bold text-[var(--color-text-strong)]">Loading branches...</p>
            <p className="mt-2 text-sm text-[var(--color-muted)]">Please wait.</p>
          </Card>
        ) : null}

        {errorMessage ? (
          <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {!isLoading && !errorMessage ? (
          <section className="mt-6 grid gap-4 md:grid-cols-2">
            {branches.map((branch) => (
              <button
                className="text-left"
                key={branch.id}
                onClick={() => onSelectBranch(branch)}
                type="button"
              >
                <Card className="h-full transition hover:-translate-y-0.5 hover:border-[var(--color-maroon)]">
                  <div className="flex items-start gap-4">
                    <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--color-maroon-soft)] text-[var(--color-maroon)]">
                      <Building2 className="size-5" />
                    </div>

                    <div className="min-w-0">
                      <p className="text-lg font-bold text-[var(--color-text-strong)]">
                        {branch.code}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">
                        {branch.name}
                      </p>

                      <div className="mt-4 space-y-2 text-sm text-[var(--color-muted)]">
                        <p className="flex gap-2">
                          <MapPin className="mt-0.5 size-4 shrink-0" />
                          <span>{branch.address || "No address set"}</span>
                        </p>
                        <p className="flex gap-2">
                          <Phone className="mt-0.5 size-4 shrink-0" />
                          <span>{branch.contactNo || "No contact number set"}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>
              </button>
            ))}
          </section>
        ) : null}
      </section>
    </main>
  )
}

export default BranchChooserPage

import React, { useEffect, useMemo, useState } from "react"
import { supabase } from "./lib/supabase"

const OPERATOR_PIN = import.meta.env.VITE_OPERATOR_PIN || "2400"

const COUNTRY_CODES = [
  { name: "Thailand", code: "+66" },
  { name: "United States", code: "+1" },
  { name: "Canada", code: "+1" },
  { name: "United Kingdom", code: "+44" },
  { name: "India", code: "+91" },
  { name: "Australia", code: "+61" },
  { name: "Germany", code: "+49" },
  { name: "France", code: "+33" },
  { name: "China", code: "+86" },
  { name: "Japan", code: "+81" },
  { name: "South Korea", code: "+82" },
  { name: "Russia", code: "+7" },
  { name: "UAE", code: "+971" },
]

function onlyDigits(value) {
  return value.replace(/\D/g, "")
}

function formatPhoneNumber(countryCode, value) {
  const digits = onlyDigits(value)

  if (countryCode === "+66") {
    if (digits.length <= 3) return digits
    if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)}`
  }

  if (countryCode === "+1") {
    if (digits.length <= 3) return digits
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`
  }

  if (countryCode === "+91") {
    if (digits.length <= 5) return digits
    return `${digits.slice(0, 5)} ${digits.slice(5, 10)}`
  }

  if (countryCode === "+44") {
    if (digits.length <= 4) return digits
    if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 11)}`
  }

  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 12)}`
}

function getTimeAgo(dateString) {
  if (!dateString) return ""

  const now = new Date()
  const date = new Date(dateString)
  const diffMs = now - date
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return "Just now"
  if (diffMin < 60) return `${diffMin} min`

  const hours = Math.floor(diffMin / 60)
  if (hours < 24) return `${hours} hr`

  const days = Math.floor(hours / 24)
  return `${days} day`
}

function formatTHB(value) {
  return `฿${Number(value || 0).toFixed(2)}`
}

function isToday(dateString) {
  if (!dateString) return false

  const date = new Date(dateString)
  const today = new Date()

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  )
}

export default function App() {
  const [view, setView] = useState(() => {
    return localStorage.getItem("paythai_view") || "customer"
  })

  const [customerStep, setCustomerStep] = useState(() => {
    return localStorage.getItem("paythai_tracking") ? 5 : 1
  })

  const [operatorUnlocked, setOperatorUnlocked] = useState(() => {
    return localStorage.getItem("paythai_operator_unlocked") === "yes"
  })

  const [operatorPinInput, setOperatorPinInput] = useState("")
  const [operatorError, setOperatorError] = useState("")

  const [requests, setRequests] = useState([])
  const [search, setSearch] = useState("")
  const [activeFilter, setActiveFilter] = useState("all")
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState(null)
  const [copiedId, setCopiedId] = useState("")

  const [trackingSearch, setTrackingSearch] = useState(() => {
    return localStorage.getItem("paythai_tracking") || ""
  })
  const [trackingResult, setTrackingResult] = useState(null)
  const [trackingMessage, setTrackingMessage] = useState("")

  const [formData, setFormData] = useState({
    customer_name: "",
    customer_email: "",
    country_code: "+66",
    customer_phone: "",
    amount_thb: "",
    payment_method: "Card",
    reason_type: "condo",
    condo_name: "",
    condo_unit: "",
    agency_name: "",
    reference_number: "",
    service_name: "",
    invoice_note: "",
  })

  const [qrFile, setQrFile] = useState(null)
  const [successMessage, setSuccessMessage] = useState("")

  useEffect(() => {
    localStorage.setItem("paythai_view", view)
  }, [view])

  async function fetchRequests() {
    const { data, error } = await supabase
      .from("payment_requests")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error(error)
      return
    }

    setRequests(data || [])
  }

  useEffect(() => {
    fetchRequests()

    const channel = supabase
      .channel("payment-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "payment_requests",
        },
        () => {
          fetchRequests()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    const activeTracking = trackingSearch.trim().toUpperCase()
    if (!activeTracking) return

    async function loadTracking() {
      const { data } = await supabase
        .from("payment_requests")
        .select("*")
        .eq("tracking_id", activeTracking)
        .maybeSingle()

      if (data) {
        setTrackingResult(data)
        setCustomerStep(5)
      }
    }

    loadTracking()

    const trackingChannel = supabase
      .channel(`customer-live-tracking-${activeTracking}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "payment_requests",
        },
        (payload) => {
          if (
            payload.new?.tracking_id?.toUpperCase() ===
            activeTracking.toUpperCase()
          ) {
            setTrackingResult(payload.new)
            setCustomerStep(5)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(trackingChannel)
    }
  }, [trackingSearch])

  async function copyTrackingId(trackingId) {
    if (!trackingId) return

    try {
      await navigator.clipboard.writeText(trackingId)
      setCopiedId(trackingId)

      setTimeout(() => {
        setCopiedId("")
      }, 1500)
    } catch (error) {
      console.error(error)
      alert("Could not copy tracking ID")
    }
  }

  async function uploadQrImage(file) {
    if (!file) return null

    const fileExt = file.name.split(".").pop()
    const fileName = `qr-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${fileExt}`

    const { error } = await supabase.storage
      .from("payment-files")
      .upload(fileName, file)

    if (error) {
      console.error(error)
      return null
    }

    const { data } = supabase.storage.from("payment-files").getPublicUrl(fileName)

    return data.publicUrl
  }

  function buildInvoiceNote() {
    const lines = []

    if (formData.reason_type === "condo") {
      lines.push("Reason: Condo / Rent / Utility")
      lines.push(`Condo / Building: ${formData.condo_name}`)
      lines.push(`Room / Unit: ${formData.condo_unit}`)
    }

    if (formData.reason_type === "government") {
      lines.push("Reason: Fine / Ticket / Government")
      lines.push(`Agency / Office: ${formData.agency_name}`)
      lines.push(`Reference Number: ${formData.reference_number}`)
    }

    if (formData.reason_type === "service") {
      lines.push("Reason: Other QR Payment / Service")
      lines.push(`Services: ${formData.service_name}`)
    }

    if (formData.invoice_note.trim()) {
      lines.push(`Optional Note: ${formData.invoice_note.trim()}`)
    }

    return lines.join("\n")
  }

  async function submitRequest(e) {
    e.preventDefault()
    setLoading(true)
    setSuccessMessage("")

    try {
      let qrUrl = null

      if (qrFile) {
        qrUrl = await uploadQrImage(qrFile)
      }

      const trackingId = "PT-" + Math.floor(100000 + Math.random() * 900000)

      const { error } = await supabase.from("payment_requests").insert([
        {
          customer_name: formData.customer_name,
          customer_email: formData.customer_email,
          customer_phone: `${formData.country_code} ${formData.customer_phone}`,
          amount_thb: Number(formData.amount_thb),
          payment_method: formData.payment_method,
          invoice_note: buildInvoiceNote(),
          qr_image_url: qrUrl,
          status: "pending",
          tracking_id: trackingId,
        },
      ])

      if (error) {
        console.error(error)
        alert("Submission failed")
        return
      }

      localStorage.setItem("paythai_tracking", trackingId)
      setTrackingSearch(trackingId)
      setSuccessMessage(`✅ Request submitted. Tracking ID: ${trackingId}`)
      setCustomerStep(5)

      setFormData({
        customer_name: "",
        customer_email: "",
        country_code: "+66",
        customer_phone: "",
        amount_thb: "",
        payment_method: "Card",
        reason_type: "condo",
        condo_name: "",
        condo_unit: "",
        agency_name: "",
        reference_number: "",
        service_name: "",
        invoice_note: "",
      })

      setQrFile(null)
      fetchRequests()
    } catch (err) {
      console.error(err)
      alert("Unexpected error")
    }

    setLoading(false)
  }

  async function sendPaidEmail(request) {
    const response = await fetch("/api/send-paid-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customerEmail: request.customer_email,
        trackingId: request.tracking_id,
        amount: Number(request.amount_thb || 0).toFixed(2),
        receiptUrl: request.receipt_url,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData?.error || "Email send failed")
    }

    return response.json()
  }

  async function updateStatus(request, status) {
    const updatePayload = { status }

    if (status === "processing") {
      updatePayload.processing_at = new Date().toISOString()
    }

    if (status === "paid") {
      if (!request.receipt_url) {
        alert("Upload receipt before marking Paid.")
        return
      }

      updatePayload.paid_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from("payment_requests")
      .update(updatePayload)
      .eq("id", request.id)

    if (error) {
      console.error(error)
      alert("Status update failed")
      return
    }

    if (status === "paid" && !request.email_sent_at) {
      try {
        await sendPaidEmail(request)

        await supabase
          .from("payment_requests")
          .update({
            email_sent_at: new Date().toISOString(),
          })
          .eq("id", request.id)
      } catch (emailError) {
        console.error("Email send failed:", emailError)
        alert("Marked paid, but email did not send. Check Vercel/API settings.")
      }
    }

    fetchRequests()
  }

  async function updateOperatorNote(requestId, note) {
    const { error } = await supabase
      .from("payment_requests")
      .update({
        operator_note: note,
      })
      .eq("id", requestId)

    if (error) {
      console.error(error)
      alert("Operator note failed to save")
      return
    }

    fetchRequests()
  }

  async function uploadReceipt(request, file) {
    if (!file) return
    if (request.receipt_url || request.status === "paid") return

    const fileExt = file.name.split(".").pop()
    const fileName = `receipt-${request.id}-${Date.now()}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from("payment-files")
      .upload(fileName, file)

    if (uploadError) {
      console.error(uploadError)
      alert("Receipt upload failed")
      return
    }

    const { data } = supabase.storage
      .from("payment-files")
      .getPublicUrl(fileName)

    const publicUrl = data.publicUrl

    const { error: updateError } = await supabase
      .from("payment_requests")
      .update({
        receipt_url: publicUrl,
        status: request.status === "pending" ? "processing" : request.status,
        processing_at:
          request.status === "pending"
            ? new Date().toISOString()
            : request.processing_at,
      })
      .eq("id", request.id)

    if (updateError) {
      console.error(updateError)
      alert("Receipt saved, but database update failed")
      return
    }

    fetchRequests()
  }

  async function lookupTracking(e) {
    if (e) e.preventDefault()

    setTrackingResult(null)
    setTrackingMessage("")

    const cleaned = trackingSearch.trim().toUpperCase()

    if (!cleaned) {
      setTrackingMessage("Enter your tracking ID.")
      return
    }

    localStorage.setItem("paythai_tracking", cleaned)

    const { data, error } = await supabase
      .from("payment_requests")
      .select("*")
      .eq("tracking_id", cleaned)
      .maybeSingle()

    if (error) {
      console.error(error)
      setTrackingMessage("Could not check status. Try again.")
      return
    }

    if (!data) {
      setTrackingMessage("No request found for this tracking ID.")
      return
    }

    setTrackingResult(data)
    setCustomerStep(5)
  }

  function loginOperator(e) {
    e.preventDefault()
    setOperatorError("")

    if (operatorPinInput === OPERATOR_PIN) {
      localStorage.setItem("paythai_operator_unlocked", "yes")
      setOperatorUnlocked(true)
      setOperatorPinInput("")
    } else {
      setOperatorError("Wrong operator PIN.")
    }
  }

  function logoutOperator() {
    localStorage.removeItem("paythai_operator_unlocked")
    setOperatorUnlocked(false)
    setView("customer")
  }

  function formatAmountOnBlur() {
    if (!formData.amount_thb) return
    const value = Number(formData.amount_thb)
    if (Number.isNaN(value) || value <= 0) {
      setFormData({ ...formData, amount_thb: "" })
      return
    }
    setFormData({ ...formData, amount_thb: value.toFixed(2) })
  }

  function handlePhoneChange(value) {
    const formatted = formatPhoneNumber(formData.country_code, value)
    setFormData({
      ...formData,
      customer_phone: formatted,
    })
  }

  function handleCountryCodeChange(value) {
    const formatted = formatPhoneNumber(value, formData.customer_phone)

    setFormData({
      ...formData,
      country_code: value,
      customer_phone: formatted,
    })
  }

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      const searchableValue = `
        ${r.customer_name || ""}
        ${r.customer_email || ""}
        ${r.customer_phone || ""}
        ${r.amount_thb || ""}
        ${r.tracking_id || ""}
      `
        .toLowerCase()
        .trim()

      const matchesSearch = searchableValue.includes(search.toLowerCase())
      const matchesFilter =
        activeFilter === "all" ? true : r.status === activeFilter

      return matchesSearch && matchesFilter
    })
  }, [requests, search, activeFilter])

  const counts = {
    all: requests.length,
    pending: requests.filter((r) => r.status === "pending").length,
    processing: requests.filter((r) => r.status === "processing").length,
    paid: requests.filter((r) => r.status === "paid").length,
    failed: requests.filter((r) => r.status === "failed").length,
  }

  const todayMetrics = useMemo(() => {
    const todayRequests = requests.filter((request) => isToday(request.created_at))

    const sumByStatus = (status) =>
      todayRequests
        .filter((request) => request.status === status)
        .reduce((total, request) => total + Number(request.amount_thb || 0), 0)

    const todayVolume = todayRequests.reduce(
      (total, request) => total + Number(request.amount_thb || 0),
      0
    )

    return {
      count: todayRequests.length,
      volume: todayVolume,
      pendingVolume: sumByStatus("pending"),
      processingVolume: sumByStatus("processing"),
      paidVolume: sumByStatus("paid"),
    }
  }, [requests])

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">
              PayThai{" "}
              <span className="text-sm text-gray-400">paythai.online</span>
            </h1>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setView("customer")}
              className={`px-4 py-2 rounded-xl font-semibold ${
                view === "customer"
                  ? "bg-sky-500 text-white"
                  : "bg-gray-100"
              }`}
            >
              Customer
            </button>

            <button
              onClick={() => setView("operator")}
              className={`px-4 py-2 rounded-xl font-semibold ${
                view === "operator"
                  ? "bg-sky-500 text-white"
                  : "bg-gray-100"
              }`}
            >
              Operator
            </button>

            {operatorUnlocked && (
              <button
                onClick={logoutOperator}
                className="px-4 py-2 rounded-xl font-semibold bg-gray-800 text-white"
              >
                Lock
              </button>
            )}
          </div>
        </div>

        {view === "customer" && (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm">
              <div className="bg-sky-500 text-white w-10 h-10 rounded-xl flex items-center justify-center font-bold mb-6">
                QR
              </div>

              <h2 className="text-4xl md:text-5xl font-bold leading-tight mb-6">
                Pay Thai QR bills without a Thai bank account.
              </h2>

              <p className="text-gray-600 mb-6">
                Upload a Thai QR, invoice, condo bill, or payment note. PayThai
                helps coordinate the payment and confirmation.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-gray-100 rounded-2xl p-4 font-semibold">
                  No Thai bank needed
                </div>
                <div className="bg-gray-100 rounded-2xl p-4 font-semibold">
                  QR / invoice upload
                </div>
                <div className="bg-gray-100 rounded-2xl p-4 font-semibold">
                  Receipt tracking
                </div>
              </div>

              <div className="mt-8 bg-slate-50 rounded-3xl p-5">
                <h3 className="text-2xl font-bold mb-2">Track Payment</h3>
                <p className="text-gray-500 mb-4">
                  Enter your tracking ID to check live payment status.
                </p>

                <form
                  onSubmit={lookupTracking}
                  className="flex flex-col sm:flex-row gap-3"
                >
                  <input
                    value={trackingSearch}
                    onChange={(e) => setTrackingSearch(e.target.value)}
                    placeholder="Example: PT-123456"
                    className="flex-1 border rounded-xl p-4 uppercase"
                  />

                  <button className="bg-sky-500 text-white font-bold px-5 py-4 rounded-xl">
                    Check Status
                  </button>
                </form>

                {trackingResult && (
                  <button
                    type="button"
                    onClick={lookupTracking}
                    className="w-full mt-3 bg-gray-900 text-white font-bold px-5 py-4 rounded-xl"
                  >
                    Refresh Tracking
                  </button>
                )}

                {trackingMessage && (
                  <div className="mt-4 bg-yellow-100 text-yellow-800 rounded-xl p-4 font-semibold">
                    {trackingMessage}
                  </div>
                )}

                {trackingResult && (
                  <TrackingCard
                    trackingResult={trackingResult}
                    setPreview={setPreview}
                  />
                )}
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm">
              <h2 className="text-3xl font-bold mb-2">Submit Payment Request</h2>

              <p className="text-gray-500 mb-6">
                Four simple steps. Upload the Thai QR first.
              </p>

              <StepProgress step={customerStep} />

              <form onSubmit={submitRequest} className="space-y-6 mt-6">
                {customerStep === 1 && (
                  <div>
                    <StepTitle
                      number="1"
                      title="Take Photo"
                      description="Take a photo or upload a Thai QR, invoice, or condo bill."
                    />

                    <label className="block bg-sky-500 hover:bg-sky-600 text-white rounded-3xl p-8 text-center font-bold text-2xl cursor-pointer shadow-sm">
                      📷 Take Photo / Upload QR
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        capture="environment"
                        onChange={(e) => {
                          const file = e.target.files[0]
                          if (file) {
                            setQrFile(file)
                            setCustomerStep(2)
                          }
                        }}
                        className="hidden"
                      />
                    </label>

                    {qrFile && (
                      <div className="mt-4 bg-green-100 text-green-700 rounded-xl p-4 font-semibold">
                        Selected: {qrFile.name}
                      </div>
                    )}
                  </div>
                )}

                {customerStep === 2 && (
                  <div>
                    <StepTitle
                      number="2"
                      title="Payment Method"
                      description="Card is the default simple option for now."
                    />

                    <button
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, payment_method: "Card" })
                        setCustomerStep(3)
                      }}
                      className="w-full border-2 border-sky-500 bg-sky-50 rounded-3xl p-6 text-left"
                    >
                      <div className="text-2xl font-bold">💳 Card</div>
                      <p className="text-gray-600 mt-2">
                        PayThai will coordinate your card payment securely.
                      </p>
                    </button>
                  </div>
                )}

                {customerStep === 3 && (
                  <div>
                    <StepTitle
                      number="3"
                      title="Payment Details"
                      description="Enter the payment amount and only the details needed for this request."
                    />

                    <div className="space-y-4">
                      <div>
                        <label className="font-semibold text-sm mb-2 block">
                          Amount in THB
                        </label>
                        <div className="flex items-center border rounded-xl overflow-hidden">
                          <span className="bg-gray-100 px-4 py-4 font-bold">
                            ฿
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={formData.amount_thb}
                            onBlur={formatAmountOnBlur}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                amount_thb: e.target.value,
                              })
                            }
                            className="w-full p-4 outline-none"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="font-semibold text-sm mb-2 block">
                          Reason for payment
                        </label>

                        <div className="grid gap-3">
                          <ReasonButton
                            active={formData.reason_type === "condo"}
                            onClick={() =>
                              setFormData({
                                ...formData,
                                reason_type: "condo",
                              })
                            }
                            title="🏢 Condo / Rent / Utility"
                          />
                          <ReasonButton
                            active={formData.reason_type === "government"}
                            onClick={() =>
                              setFormData({
                                ...formData,
                                reason_type: "government",
                              })
                            }
                            title="🏛 Fine / Ticket / Government"
                          />
                          <ReasonButton
                            active={formData.reason_type === "service"}
                            onClick={() =>
                              setFormData({
                                ...formData,
                                reason_type: "service",
                              })
                            }
                            title="📦 Other QR Payment / Service"
                          />
                        </div>
                      </div>

                      {formData.reason_type === "condo" && (
                        <>
                          <input
                            type="text"
                            placeholder="Condo / Building Name"
                            value={formData.condo_name}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                condo_name: e.target.value,
                              })
                            }
                            className="w-full border rounded-xl p-4"
                            required
                          />

                          <input
                            type="text"
                            placeholder="Room / Unit Number"
                            value={formData.condo_unit}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                condo_unit: e.target.value,
                              })
                            }
                            className="w-full border rounded-xl p-4"
                            required
                          />
                        </>
                      )}

                      {formData.reason_type === "government" && (
                        <>
                          <input
                            type="text"
                            placeholder="Agency / Office Name"
                            value={formData.agency_name}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                agency_name: e.target.value,
                              })
                            }
                            className="w-full border rounded-xl p-4"
                            required
                          />

                          <input
                            type="text"
                            placeholder="Reference Number"
                            value={formData.reference_number}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                reference_number: e.target.value,
                              })
                            }
                            className="w-full border rounded-xl p-4"
                            required
                          />
                        </>
                      )}

                      {formData.reason_type === "service" && (
                        <input
                          type="text"
                          placeholder="Services"
                          value={formData.service_name}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              service_name: e.target.value,
                            })
                          }
                          className="w-full border rounded-xl p-4"
                          required
                        />
                      )}

                      <input
                        type="text"
                        placeholder="Your name"
                        value={formData.customer_name}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            customer_name: e.target.value,
                          })
                        }
                        className="w-full border rounded-xl p-4"
                        required
                      />

                      <input
                        type="email"
                        placeholder="Email"
                        value={formData.customer_email}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            customer_email: e.target.value,
                          })
                        }
                        className="w-full border rounded-xl p-4"
                        required
                      />

                      <div className="grid grid-cols-[140px_1fr] gap-3">
                        <select
                          value={formData.country_code}
                          onChange={(e) =>
                            handleCountryCodeChange(e.target.value)
                          }
                          className="border rounded-xl p-4"
                        >
                          {COUNTRY_CODES.map((country) => (
                            <option
                              key={`${country.name}-${country.code}`}
                              value={country.code}
                            >
                              {country.name} {country.code}
                            </option>
                          ))}
                        </select>

                        <input
                          type="tel"
                          inputMode="numeric"
                          placeholder={
                            formData.country_code === "+66"
                              ? "081 234 5678"
                              : formData.country_code === "+1"
                              ? "(555) 555-5555"
                              : "Phone / WhatsApp"
                          }
                          value={formData.customer_phone}
                          onChange={(e) => handlePhoneChange(e.target.value)}
                          className="w-full border rounded-xl p-4"
                          required
                        />
                      </div>

                      <textarea
                        placeholder="Optional note"
                        value={formData.invoice_note}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            invoice_note: e.target.value,
                          })
                        }
                        className="w-full border rounded-xl p-4 h-24"
                      />

                      <button
                        type="button"
                        onClick={() => setCustomerStep(4)}
                        className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-4 rounded-xl"
                      >
                        Continue
                      </button>
                    </div>
                  </div>
                )}

                {customerStep === 4 && (
                  <div>
                    <StepTitle
                      number="4"
                      title="Review & Send"
                      description="Confirm your request before sending."
                    />

                    <div className="bg-slate-50 rounded-3xl p-5 space-y-3">
                      <p>
                        <strong>QR / Invoice:</strong>{" "}
                        {qrFile ? qrFile.name : "No file selected"}
                      </p>
                      <p>
                        <strong>Method:</strong> {formData.payment_method}
                      </p>
                      <p>
                        <strong>Amount:</strong> ฿
                        {Number(formData.amount_thb || 0).toFixed(2)}
                      </p>
                      <p>
                        <strong>Phone:</strong> {formData.country_code}{" "}
                        {formData.customer_phone}
                      </p>
                      <p>
                        <strong>Email:</strong> {formData.customer_email}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-5">
                      <button
                        type="button"
                        onClick={() => setCustomerStep(3)}
                        className="bg-gray-100 font-bold py-4 rounded-xl"
                      >
                        Back
                      </button>

                      <button
                        type="submit"
                        disabled={loading}
                        className="bg-sky-500 hover:bg-sky-600 text-white font-bold py-4 rounded-xl disabled:opacity-50"
                      >
                        {loading ? "Sending..." : "Send Request"}
                      </button>
                    </div>
                  </div>
                )}

                {customerStep === 5 && (
                  <div>
                    <StepTitle
                      number="✓"
                      title="Request Sent"
                      description="Your live tracking is ready above."
                    />

                    {successMessage && (
                      <div className="bg-green-100 text-green-700 rounded-xl p-4 font-semibold">
                        {successMessage}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        localStorage.removeItem("paythai_tracking")
                        setTrackingSearch("")
                        setTrackingResult(null)
                        setCustomerStep(1)
                        setSuccessMessage("")
                      }}
                      className="w-full mt-3 bg-gray-100 font-bold py-4 rounded-xl"
                    >
                      Submit Another Request
                    </button>
                  </div>
                )}
              </form>
            </div>
          </div>
        )}

        {view === "operator" && !operatorUnlocked && (
          <div className="bg-white rounded-3xl p-8 shadow-sm max-w-md mx-auto">
            <h2 className="text-3xl font-bold mb-2">Operator Login</h2>
            <p className="text-gray-500 mb-6">
              Enter operator PIN to access dashboard.
            </p>

            <form onSubmit={loginOperator} className="space-y-4">
              <input
                type="password"
                value={operatorPinInput}
                onChange={(e) => setOperatorPinInput(e.target.value)}
                placeholder="Operator PIN"
                autoComplete="current-password"
                className="w-full border rounded-xl p-4"
              />

              <button className="w-full bg-sky-500 text-white font-bold py-4 rounded-xl">
                Unlock Operator Dashboard
              </button>

              {operatorError && (
                <div className="bg-red-100 text-red-700 rounded-xl p-4 font-semibold">
                  {operatorError}
                </div>
              )}
            </form>
          </div>
        )}

        {view === "operator" && operatorUnlocked && (
          <div className="bg-white rounded-3xl p-5 md:p-8 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold">
                  Operator Dashboard
                </h2>

                <p className="text-gray-500">
                  Live payment requests from Supabase.
                </p>
              </div>

              <div className="bg-green-500 text-white px-4 py-2 rounded-full font-bold w-fit">
                LIVE
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              {["all", "pending", "processing", "paid", "failed"].map(
                (filter) => (
                  <button
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    className={`rounded-2xl p-3 font-bold capitalize transition ${
                      activeFilter === filter
                        ? "bg-sky-500 text-white"
                        : "bg-gray-100"
                    }`}
                  >
                    {filter}
                  </button>
                )
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <Stat label="All" value={counts.all} />
              <Stat label="Pending" value={counts.pending} />
              <Stat label="Processing" value={counts.processing} />
              <Stat label="Paid" value={counts.paid} />
              <Stat label="Failed" value={counts.failed} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
              <Stat label="Today Requests" value={todayMetrics.count} />
              <Stat label="Today Volume" value={formatTHB(todayMetrics.volume)} />
              <Stat
                label="Pending THB"
                value={formatTHB(todayMetrics.pendingVolume)}
              />
              <Stat
                label="Processing THB"
                value={formatTHB(todayMetrics.processingVolume)}
              />
              <Stat label="Paid THB" value={formatTHB(todayMetrics.paidVolume)} />
            </div>

            <input
              type="text"
              placeholder="Search name, email, phone, amount, or tracking ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border rounded-2xl p-4 mb-6"
            />

            <div className="space-y-6">
              {filteredRequests.map((request) => {
                const isPaid = request.status === "paid"
                const isFailed = request.status === "failed"
                const isLocked = isPaid || isFailed
                const hasReceipt = !!request.receipt_url
                const processingTime = request.processing_at
                  ? new Date(request.processing_at).toLocaleString()
                  : null

                if (isPaid) {
                  return (
                    <div
                      key={request.id}
                      className="border rounded-3xl p-5 md:p-6 bg-slate-50"
                    >
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <p className="text-xl md:text-2xl font-bold">
                            {request.customer_name}
                          </p>

                          <p className="text-gray-600">
                            {request.customer_email}
                          </p>

                          <p className="text-gray-600">
                            {request.customer_phone}
                          </p>

                          <p className="mt-3 text-xl font-bold">
                            {formatTHB(request.amount_thb)} —{" "}
                            {request.payment_method}
                          </p>

                          <TrackingLine
                            trackingId={request.tracking_id}
                            copiedId={copiedId}
                            onCopy={copyTrackingId}
                          />

                          {request.paid_at && (
                            <p className="text-green-600 mt-2 font-semibold">
                              Paid locked ✓{" "}
                              {new Date(request.paid_at).toLocaleString()}
                            </p>
                          )}

                          {request.email_sent_at && (
                            <p className="text-blue-600 mt-1 font-semibold">
                              Final email sent ✓{" "}
                              {new Date(request.email_sent_at).toLocaleString()}
                            </p>
                          )}
                        </div>

                        <StatusBadge status={request.status} />
                      </div>

                      <div className="flex gap-3 mt-5 flex-wrap">
                        {request.qr_image_url && (
                          <button
                            onClick={() =>
                              setPreview({
                                title: "QR / Invoice",
                                url: request.qr_image_url,
                              })
                            }
                            className="bg-sky-500 hover:bg-sky-600 text-white px-5 py-3 rounded-xl font-bold"
                          >
                            View QR / Invoice
                          </button>
                        )}

                        {hasReceipt && (
                          <button
                            onClick={() =>
                              setPreview({
                                title: "Receipt",
                                url: request.receipt_url,
                              })
                            }
                            className="bg-green-500 text-white px-5 py-3 rounded-xl font-bold"
                          >
                            View Receipt
                          </button>
                        )}
                      </div>
                    </div>
                  )
                }

                return (
                  <div
                    key={request.id}
                    className="border rounded-3xl p-5 md:p-6"
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <p className="text-xl md:text-2xl font-bold">
                          {request.customer_name}
                        </p>

                        <p className="text-gray-600">
                          {request.customer_email}
                        </p>

                        <p className="text-gray-600">
                          {request.customer_phone}
                        </p>

                        <p className="mt-3 text-xl font-bold">
                          {formatTHB(request.amount_thb)} —{" "}
                          {request.payment_method}
                        </p>

                        <TrackingLine
                          trackingId={request.tracking_id}
                          copiedId={copiedId}
                          onCopy={copyTrackingId}
                        />

                        <p className="text-gray-500 mt-2 whitespace-pre-line">
                          {request.invoice_note}
                        </p>

                        <p className="text-gray-500 mt-2">
                          Submitted:{" "}
                          {request.created_at
                            ? new Date(request.created_at).toLocaleString()
                            : "No timestamp"}
                        </p>

                        {processingTime && (
                          <p className="text-orange-600">
                            Processing: {processingTime}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <StatusBadge status={request.status} />

                        <p className="text-sm font-semibold text-gray-500">
                          {request.status === "processing"
                            ? `Processing • ${getTimeAgo(
                                request.processing_at || request.created_at
                              )}`
                            : `Pending • ${getTimeAgo(request.created_at)}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3 mt-6 flex-wrap">
                      {request.qr_image_url && (
                        <button
                          onClick={() =>
                            setPreview({
                              title: "QR / Invoice",
                              url: request.qr_image_url,
                            })
                          }
                          className="bg-sky-500 hover:bg-sky-600 text-white px-5 py-3 rounded-xl font-bold"
                        >
                          View QR / Invoice
                        </button>
                      )}

                      {hasReceipt && (
                        <button
                          onClick={() =>
                            setPreview({
                              title: "Receipt",
                              url: request.receipt_url,
                            })
                          }
                          className="bg-green-500 text-white px-5 py-3 rounded-xl font-bold"
                        >
                          Receipt Uploaded
                        </button>
                      )}
                    </div>

                    <div className="mt-6">
                      <p className="font-semibold mb-2">Upload receipt</p>

                      {hasReceipt ? (
                        <div className="bg-gray-100 rounded-xl p-4 text-gray-600 font-semibold">
                          Receipt locked ✓
                        </div>
                      ) : (
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          disabled={isLocked}
                          onChange={(e) =>
                            uploadReceipt(request, e.target.files[0])
                          }
                          className="w-full border rounded-xl p-4 disabled:bg-gray-100 disabled:cursor-not-allowed"
                        />
                      )}
                    </div>

                    <div className="mt-4">
                      <p className="text-sm font-semibold mb-2">
                        Internal operator note
                      </p>

                      <textarea
                        defaultValue={request.operator_note || ""}
                        placeholder="Internal notes (customer contacted, waiting confirmation, etc)"
                        className="w-full border rounded-2xl p-3 text-sm"
                        rows={3}
                        onBlur={(e) =>
                          updateOperatorNote(request.id, e.target.value)
                        }
                      />
                    </div>

                    <div className="flex gap-3 mt-6 flex-wrap">
                      <button
                        disabled={isLocked || request.status === "processing"}
                        onClick={() => updateStatus(request, "processing")}
                        className={`px-5 py-3 rounded-xl font-bold text-white ${
                          isLocked || request.status === "processing"
                            ? "bg-gray-300 cursor-not-allowed"
                            : "bg-sky-500 hover:bg-sky-600"
                        }`}
                      >
                        {request.status === "processing"
                          ? "✓ Processing"
                          : "Processing"}
                      </button>

                      <button
                        disabled={isLocked || !hasReceipt}
                        onClick={() => {
                          const confirmed = window.confirm(
                            "Mark this request as PAID and send the final customer email?"
                          )

                          if (!confirmed) return

                          updateStatus(request, "paid")
                        }}
                        className={`px-5 py-3 rounded-xl font-bold text-white ${
                          isLocked || !hasReceipt
                            ? "bg-gray-300 cursor-not-allowed"
                            : "bg-green-500 hover:bg-green-600"
                        }`}
                      >
                        Paid
                      </button>

                      <button
                        disabled={isLocked}
                        onClick={() => updateStatus(request, "failed")}
                        className={`px-5 py-3 rounded-xl font-bold text-white ${
                          isLocked
                            ? "bg-gray-300 cursor-not-allowed"
                            : "bg-red-500 hover:bg-red-600"
                        }`}
                      >
                        {isFailed ? "✓ Failed" : "Failed"}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {preview && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 md:p-6"
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-white rounded-3xl p-5 max-w-4xl w-full max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">{preview.title}</h2>

              <button
                onClick={() => setPreview(null)}
                className="bg-red-500 text-white px-4 py-2 rounded-xl font-bold"
              >
                Close
              </button>
            </div>

            {preview.url?.toLowerCase().includes(".pdf") ? (
              <iframe
                src={preview.url}
                title={preview.title}
                className="w-full h-[75vh] rounded-2xl border"
              />
            ) : (
              <img
                src={preview.url}
                alt={preview.title}
                className="w-full max-h-[75vh] object-contain rounded-2xl"
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TrackingLine({ trackingId, copiedId, onCopy }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span>
        <span className="font-bold">Tracking ID:</span>{" "}
        {trackingId || "Not assigned"}
      </span>

      {trackingId && (
        <button
          type="button"
          onClick={() => onCopy(trackingId)}
          className="bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-lg text-sm font-bold"
        >
          {copiedId === trackingId ? "Copied ✓" : "Copy ID"}
        </button>
      )}
    </div>
  )
}

function StepProgress({ step }) {
  const steps = ["Photo", "Card", "Info", "Send"]

  return (
    <div className="grid grid-cols-4 gap-2">
      {steps.map((label, index) => {
        const stepNumber = index + 1
        const active = step >= stepNumber

        return (
          <div
            key={label}
            className={`rounded-2xl p-3 text-center font-bold text-sm ${
              active ? "bg-sky-500 text-white" : "bg-gray-100 text-gray-500"
            }`}
          >
            {stepNumber}. {label}
          </div>
        )
      })}
    </div>
  )
}

function StepTitle({ number, title, description }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-sky-500 text-white rounded-full flex items-center justify-center font-bold">
          {number}
        </div>
        <h3 className="text-2xl font-bold">{title}</h3>
      </div>
      <p className="text-gray-500 mt-2">{description}</p>
    </div>
  )
}

function ReasonButton({ active, onClick, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-2xl p-4 font-bold border ${
        active
          ? "bg-sky-50 border-sky-500 text-sky-700"
          : "bg-white border-gray-200"
      }`}
    >
      {title}
    </button>
  )
}

function TrackingCard({ trackingResult, setPreview }) {
  return (
    <div className="mt-4 bg-white rounded-2xl p-5 border">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-lg">
            Tracking ID: {trackingResult.tracking_id}
          </p>
          <p className="text-gray-600">
            Amount: {formatTHB(trackingResult.amount_thb)}
          </p>
          <p className="text-gray-600">
            Method: {trackingResult.payment_method}
          </p>
        </div>

        <StatusBadge status={trackingResult.status} />
      </div>

      {trackingResult.status === "paid" && trackingResult.receipt_url && (
        <button
          onClick={() =>
            setPreview({
              title: "Payment Receipt",
              url: trackingResult.receipt_url,
            })
          }
          className="mt-4 bg-green-500 text-white px-5 py-3 rounded-xl font-bold"
        >
          View Receipt
        </button>
      )}

      {trackingResult.status !== "paid" && (
        <p className="mt-4 text-gray-500">
          Your request is live. Use Refresh Tracking above to check the latest
          status.
        </p>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="bg-gray-100 rounded-2xl p-4 text-center">
      <p className="text-sm">{label}</p>
      <p className="text-2xl md:text-3xl font-bold">{value}</p>
    </div>
  )
}

function StatusBadge({ status }) {
  return (
    <div
      className={`px-4 py-2 rounded-full text-white font-bold capitalize whitespace-nowrap ${
        status === "pending"
          ? "bg-blue-500"
          : status === "processing"
          ? "bg-orange-500"
          : status === "paid"
          ? "bg-green-500"
          : "bg-red-500"
      }`}
    >
      {status}
    </div>
  )
}
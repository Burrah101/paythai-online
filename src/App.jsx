import React, { useEffect, useMemo, useState } from "react"
import { supabase } from "./lib/supabase"

const OPERATOR_PIN = import.meta.env.VITE_OPERATOR_PIN || "2400"

export default function App() {
  const [view, setView] = useState(() => {
    return localStorage.getItem("paythai_view") || "customer"
  })

  const [operatorUnlocked, setOperatorUnlocked] = useState(() => {
    return localStorage.getItem("paythai_operator_unlocked") === "yes"
  })

  const [operatorPinInput, setOperatorPinInput] = useState("")
  const [operatorError, setOperatorError] = useState("")

  const [requests, setRequests] = useState([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState(null)

  const [trackingSearch, setTrackingSearch] = useState("")
  const [trackingResult, setTrackingResult] = useState(null)
  const [trackingMessage, setTrackingMessage] = useState("")

  const [formData, setFormData] = useState({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    amount_thb: "",
    payment_method: "Card",
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

    const { data } = supabase.storage
      .from("payment-files")
      .getPublicUrl(fileName)

    return data.publicUrl
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

      const trackingId =
        "PT-" + Math.floor(100000 + Math.random() * 900000)

      const { error } = await supabase.from("payment_requests").insert([
        {
          ...formData,
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

      setSuccessMessage(
        `✅ Payment request submitted successfully. Tracking ID: ${trackingId}`
      )

      setTrackingSearch(trackingId)

      setFormData({
        customer_name: "",
        customer_email: "",
        customer_phone: "",
        amount_thb: "",
        payment_method: "Card",
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

  async function updateStatus(request, status) {
    const updatePayload = { status }

    if (status === "paid") {
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

    /*
      FINAL EMAIL HOOK:
      Later we connect Supabase Edge Function here.
      When status === "paid", send one final email with receipt link.
      After email succeeds, update email_sent_at.
    */

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
    e.preventDefault()
    setTrackingResult(null)
    setTrackingMessage("")

    const cleaned = trackingSearch.trim().toUpperCase()

    if (!cleaned) {
      setTrackingMessage("Enter your tracking ID.")
      return
    }

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

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      const value = `
        ${r.customer_name || ""}
        ${r.customer_email || ""}
        ${r.customer_phone || ""}
        ${r.amount_thb || ""}
        ${r.tracking_id || ""}
      `
        .toLowerCase()
        .trim()

      return value.includes(search.toLowerCase())
    })
  }, [requests, search])

  const counts = {
    all: requests.length,
    pending: requests.filter((r) => r.status === "pending").length,
    processing: requests.filter((r) => r.status === "processing").length,
    paid: requests.filter((r) => r.status === "paid").length,
    failed: requests.filter((r) => r.status === "failed").length,
  }

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
                  Enter your tracking ID to check payment status and receipt.
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

                {trackingMessage && (
                  <div className="mt-4 bg-yellow-100 text-yellow-800 rounded-xl p-4 font-semibold">
                    {trackingMessage}
                  </div>
                )}

                {trackingResult && (
                  <div className="mt-4 bg-white rounded-2xl p-5 border">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-lg">
                          Tracking ID: {trackingResult.tracking_id}
                        </p>
                        <p className="text-gray-600">
                          Amount: ฿{trackingResult.amount_thb}
                        </p>
                        <p className="text-gray-600">
                          Method: {trackingResult.payment_method}
                        </p>
                      </div>

                      <span
                        className={`px-4 py-2 rounded-full text-white font-bold capitalize ${
                          trackingResult.status === "paid"
                            ? "bg-green-500"
                            : trackingResult.status === "processing"
                            ? "bg-orange-500"
                            : trackingResult.status === "failed"
                            ? "bg-red-500"
                            : "bg-blue-500"
                        }`}
                      >
                        {trackingResult.status}
                      </span>
                    </div>

                    {trackingResult.status === "paid" &&
                      trackingResult.receipt_url && (
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
                        Your request is still being handled. Final confirmation
                        will be sent after payment is completed.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm">
              <h2 className="text-3xl font-bold mb-2">
                Submit Payment Request
              </h2>

              <p className="text-gray-500 mb-6">
                Use this when a Thai QR payment is required.
              </p>

              <form onSubmit={submitRequest} className="space-y-4">
                <input
                  type="text"
                  placeholder="Your name"
                  value={formData.customer_name}
                  onChange={(e) =>
                    setFormData({ ...formData, customer_name: e.target.value })
                  }
                  className="w-full border rounded-xl p-4"
                  required
                />

                <input
                  type="email"
                  placeholder="Email"
                  value={formData.customer_email}
                  onChange={(e) =>
                    setFormData({ ...formData, customer_email: e.target.value })
                  }
                  className="w-full border rounded-xl p-4"
                  required
                />

                <input
                  type="text"
                  placeholder="Phone / WhatsApp"
                  value={formData.customer_phone}
                  onChange={(e) =>
                    setFormData({ ...formData, customer_phone: e.target.value })
                  }
                  className="w-full border rounded-xl p-4"
                  required
                />

                <input
                  type="number"
                  placeholder="Amount in THB"
                  value={formData.amount_thb}
                  onChange={(e) =>
                    setFormData({ ...formData, amount_thb: e.target.value })
                  }
                  className="w-full border rounded-xl p-4"
                  required
                />

                <select
                  value={formData.payment_method}
                  onChange={(e) =>
                    setFormData({ ...formData, payment_method: e.target.value })
                  }
                  className="w-full border rounded-xl p-4"
                >
                  <option>Card</option>
                  <option>Crypto</option>
                </select>

                <textarea
                  placeholder="Condo name, room number, invoice note, or payment details"
                  value={formData.invoice_note}
                  onChange={(e) =>
                    setFormData({ ...formData, invoice_note: e.target.value })
                  }
                  className="w-full border rounded-xl p-4 h-32"
                />

                <div>
                  <p className="font-semibold mb-2 text-sm">
                    Take photo or upload Thai QR / invoice
                  </p>

                  <input
                    type="file"
                    accept="image/*,.pdf"
                    capture="environment"
                    onChange={(e) => setQrFile(e.target.files[0])}
                    className="w-full border rounded-xl p-3"
                  />

                  {qrFile && (
                    <p className="mt-2 text-sm text-green-700 font-semibold">
                      Selected: {qrFile.name}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-4 rounded-xl disabled:opacity-50"
                >
                  {loading ? "Submitting..." : "Submit Payment Request"}
                </button>

                {successMessage && (
                  <div className="bg-green-100 text-green-700 rounded-xl p-4 font-semibold">
                    {successMessage}
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

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <Stat label="All" value={counts.all} />
              <Stat label="Pending" value={counts.pending} />
              <Stat label="Processing" value={counts.processing} />
              <Stat label="Paid" value={counts.paid} />
              <Stat label="Failed" value={counts.failed} />
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
                          ฿{request.amount_thb} — {request.payment_method}
                        </p>

                        <p className="mt-2">
                          <span className="font-bold">Tracking ID:</span>{" "}
                          {request.tracking_id || "Not assigned"}
                        </p>

                        <p className="text-gray-500 mt-2">
                          Submitted:{" "}
                          {request.created_at
                            ? new Date(request.created_at).toLocaleString()
                            : "No timestamp"}
                        </p>

                        {request.paid_at && (
                          <p className="text-green-600 mt-1 font-semibold">
                            Paid: {new Date(request.paid_at).toLocaleString()}
                          </p>
                        )}

                        {request.email_sent_at && (
                          <p className="text-blue-600 mt-1 font-semibold">
                            Email sent:{" "}
                            {new Date(request.email_sent_at).toLocaleString()}
                          </p>
                        )}

                        <p className="mt-4">{request.invoice_note}</p>
                      </div>

                      <StatusBadge status={request.status} />
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
                        onClick={() => updateStatus(request, "paid")}
                        className={`px-5 py-3 rounded-xl font-bold text-white ${
                          isLocked || !hasReceipt
                            ? "bg-gray-300 cursor-not-allowed"
                            : "bg-green-500 hover:bg-green-600"
                        }`}
                      >
                        {isPaid ? "✓ Paid" : "Paid"}
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

function Stat({ label, value }) {
  return (
    <div className="bg-gray-100 rounded-2xl p-4 text-center">
      <p className="text-sm">{label}</p>
      <p className="text-3xl font-bold">{value}</p>
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
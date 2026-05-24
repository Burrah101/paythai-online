import React, { useEffect, useMemo, useState } from "react"
import { supabase } from "./lib/supabase"

const OPERATOR_PIN = import.meta.env.VITE_OPERATOR_PIN || "2400"
const OPERATOR_AUTO_LOCK_MS = 15 * 60 * 1000
const REQUEST_EXPIRY_HOURS = 24
const CARD_SERVICE_FEE_RATE = 0.077

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
  return String(value || "").replace(/\D/g, "")
}

function cleanTrackingId(value) {
  return String(value || "").trim().toUpperCase()
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

function formatTHB(value) {
  return `฿${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function getTimeAgo(dateString) {
  if (!dateString) return ""
  const now = new Date()
  const date = new Date(dateString)
  const diffMin = Math.floor((now - date) / 60000)

  if (diffMin < 1) return "Just now"
  if (diffMin < 60) return `${diffMin} min`

  const hours = Math.floor(diffMin / 60)
  if (hours < 24) return `${hours} hr`

  const days = Math.floor(hours / 24)
  return `${days} day`
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

function formatDateTime(dateString) {
  if (!dateString) return "—"
  return new Date(dateString).toLocaleString()
}

function getEstimatedServiceFee(amount) {
  const value = Number(amount || 0)
  if (!value || Number.isNaN(value)) return 0
  return Number((value * CARD_SERVICE_FEE_RATE).toFixed(2))
}

function getEstimatedTotal(amount) {
  const value = Number(amount || 0)
  if (!value || Number.isNaN(value)) return 0
  return Number((value + getEstimatedServiceFee(value)).toFixed(2))
}

function getRecipientPreview(formData) {
  if (formData.reason_type === "condo") {
    return formData.condo_name?.trim() || "Condo / building pending"
  }

  if (formData.reason_type === "government") {
    return formData.agency_name?.trim() || "Agency pending"
  }

  if (formData.reason_type === "service") {
    return formData.service_name?.trim() || "Recipient pending verification"
  }

  return "Recipient pending verification"
}

function getExpiryAt(dateString) {
  if (!dateString) return null
  const created = new Date(dateString)
  return new Date(created.getTime() + REQUEST_EXPIRY_HOURS * 60 * 60 * 1000)
}

function isRequestExpired(request) {
  if (!request || request.status !== "pending" || !request.created_at) return false
  const expiresAt = getExpiryAt(request.created_at)
  return expiresAt ? new Date() > expiresAt : false
}

function getCustomerStatusLabel(status, expired = false) {
  if (expired) return "Action required"
  if (status === "pending") return "Request submitted"
  if (status === "processing") return "Payment received"
  if (status === "paid") return "Payment completed"
  if (status === "failed") return "Action required"
  return "Request received"
}

function sortRequestsForOps(list) {
  return [...list].sort((a, b) => {
    const statusRank = {
      pending: 1,
      processing: 2,
      failed: 3,
      paid: 4,
    }

    const rankA = statusRank[a.status] || 9
    const rankB = statusRank[b.status] || 9

    if (rankA !== rankB) return rankA - rankB

    return new Date(b.created_at || 0) - new Date(a.created_at || 0)
  })
}

export default function App() {
  const [view, setView] = useState(() => {
    return localStorage.getItem("paythai_view") || "customer"
  })

  const [customerStep, setCustomerStep] = useState(() => {
    return localStorage.getItem("paythai_tracking") ? 5 : 1
  })

  const [operatorUnlocked, setOperatorUnlocked] = useState(false)
  const [operatorPinInput, setOperatorPinInput] = useState("")
  const [operatorError, setOperatorError] = useState("")
  const [operatorFailedAttempts, setOperatorFailedAttempts] = useState(0)
  const [operatorBlockedUntil, setOperatorBlockedUntil] = useState(0)

  const [requests, setRequests] = useState([])
  const [search, setSearch] = useState("")
  const [activeFilter, setActiveFilter] = useState("all")
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState(null)
  const [noteSavedId, setNoteSavedId] = useState(null)
  const [copiedId, setCopiedId] = useState("")
  const [paidActionId, setPaidActionId] = useState(null)
  const [statusActionId, setStatusActionId] = useState(null)
  const [uploadingReceiptId, setUploadingReceiptId] = useState(null)
  const [operatorActionMessage, setOperatorActionMessage] = useState("")

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlTracking =
      params.get("track") || params.get("tracking") || params.get("id")

    if (urlTracking) {
      const cleaned = cleanTrackingId(urlTracking)
      localStorage.setItem("paythai_tracking", cleaned)
      setTrackingSearch(cleaned)
      setCustomerStep(5)
      setView("customer")
    }
  }, [])

  useEffect(() => {
    if (!operatorUnlocked) return

    let lockTimer = null

    function lockOperator() {
      setOperatorUnlocked(false)
      setOperatorPinInput("")
      setOperatorError("Operator auto-locked after inactivity.")
      setView("customer")
    }

    function resetTimer() {
      clearTimeout(lockTimer)
      lockTimer = setTimeout(lockOperator, OPERATOR_AUTO_LOCK_MS)
    }

    const events = ["mousemove", "keydown", "click", "touchstart"]

    events.forEach((eventName) => {
      window.addEventListener(eventName, resetTimer)
    })

    resetTimer()

    return () => {
      clearTimeout(lockTimer)
      events.forEach((eventName) => {
        window.removeEventListener(eventName, resetTimer)
      })
    }
  }, [operatorUnlocked])

  useEffect(() => {
    if (!operatorActionMessage) return

    const timer = setTimeout(() => {
      setOperatorActionMessage("")
    }, 3500)

    return () => clearTimeout(timer)
  }, [operatorActionMessage])

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
    const activeTracking = cleanTrackingId(trackingSearch)
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

  function openCustomerTracking(request) {
    if (!request?.tracking_id) return

    const trackingId = cleanTrackingId(request.tracking_id)

    localStorage.setItem("paythai_tracking", trackingId)
    setTrackingSearch(trackingId)
    setTrackingResult(request)
    setTrackingMessage("")
    setCustomerStep(5)
    setView("customer")

    window.history.pushState(
      {},
      "",
      `${window.location.pathname}?track=${encodeURIComponent(trackingId)}`
    )

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    })
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
      setSuccessMessage(`Request received. Tracking ID: ${trackingId}`)
      setCustomerStep(5)

      window.history.pushState(
        {},
        "",
        `${window.location.pathname}?track=${encodeURIComponent(trackingId)}`
      )

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
    } finally {
      setLoading(false)
    }
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

  async function getFreshRequest(requestId) {
    const { data, error } = await supabase
      .from("payment_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle()

    if (error) {
      console.error(error)
      return null
    }

    return data
  }

  async function updateStatus(request, status) {
    if (!request?.id) return
    if (statusActionId || paidActionId) return

    setOperatorActionMessage("")

    const freshRequest = await getFreshRequest(request.id)

    if (!freshRequest) {
      alert("Could not refresh this request. Try again.")
      return
    }

    if (freshRequest.status === "paid" || freshRequest.status === "failed") {
      setOperatorActionMessage("Request is already locked.")
      fetchRequests()
      return
    }

    if (isRequestExpired(freshRequest)) {
      setOperatorActionMessage("Request expired after 24 hours. Ask customer to submit again.")
      fetchRequests()
      return
    }

    const updatePayload = { status }

    if (status === "processing") {
      if (freshRequest.status === "processing") {
        setOperatorActionMessage("Request is already marked processing.")
        return
      }

      setStatusActionId(request.id)
      updatePayload.processing_at =
        freshRequest.processing_at || new Date().toISOString()
    }

    if (status === "failed") {
      const confirmed = window.confirm(
        "Mark this request as FAILED and lock it from further operator actions?"
      )

      if (!confirmed) return

      setStatusActionId(request.id)
    }

    if (status === "paid") {
      if (!freshRequest.receipt_url) {
        alert("Upload receipt before marking Paid.")
        return
      }

      if (freshRequest.email_sent_at) {
        setOperatorActionMessage(
          "Final email was already sent. Request is already protected."
        )
        fetchRequests()
        return
      }

      const confirmed = window.confirm(
        "Mark this request as PAID and send the final customer email?"
      )

      if (!confirmed) return

      setPaidActionId(request.id)
      updatePayload.paid_at = freshRequest.paid_at || new Date().toISOString()
    }

    try {
      const { error } = await supabase
        .from("payment_requests")
        .update(updatePayload)
        .eq("id", request.id)
        .neq("status", "paid")
        .neq("status", "failed")

      if (error) {
        console.error(error)
        alert("Status update failed")
        return
      }

      if (status === "paid") {
        const emailFreshRequest = await getFreshRequest(request.id)

        if (!emailFreshRequest) {
          alert("Marked paid, but could not refresh email status.")
          return
        }

        if (emailFreshRequest.email_sent_at) {
          setOperatorActionMessage("Email already sent. Duplicate prevented.")
          fetchRequests()
          return
        }

        try {
          await sendPaidEmail(emailFreshRequest)

          const { error: emailStampError } = await supabase
            .from("payment_requests")
            .update({
              email_sent_at: new Date().toISOString(),
            })
            .eq("id", request.id)
            .is("email_sent_at", null)

          if (emailStampError) {
            console.error(emailStampError)
            alert(
              "Email sent, but email timestamp was not saved. Check Supabase."
            )
          } else {
            setOperatorActionMessage("Paid locked and final email sent.")
          }
        } catch (emailError) {
          console.error("Email send failed:", emailError)
          alert("Marked paid, but email did not send. Check Vercel/API settings.")
        }
      } else if (status === "processing") {
        setOperatorActionMessage("Request marked processing.")
      } else if (status === "failed") {
        setOperatorActionMessage("Request marked failed and locked.")
      }

      fetchRequests()
    } finally {
      setStatusActionId(null)
      setPaidActionId(null)
    }
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

    setNoteSavedId(requestId)

    setTimeout(() => {
      setNoteSavedId(null)
    }, 1500)

    fetchRequests()
  }

  async function uploadReceipt(request, file) {
    if (!file) return
    if (!request?.id) return
    if (uploadingReceiptId) return

    setOperatorActionMessage("")

    const freshRequest = await getFreshRequest(request.id)

    if (!freshRequest) {
      alert("Could not refresh this request. Try again.")
      return
    }

    if (freshRequest.receipt_url || freshRequest.status === "paid") {
      setOperatorActionMessage("Receipt is already locked.")
      fetchRequests()
      return
    }

    if (freshRequest.status === "failed") {
      setOperatorActionMessage("Failed request is locked.")
      fetchRequests()
      return
    }

    if (isRequestExpired(freshRequest)) {
      setOperatorActionMessage("Request expired after 24 hours. Ask customer to submit again.")
      fetchRequests()
      return
    }

    setUploadingReceiptId(request.id)

    try {
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

      const now = new Date().toISOString()

      const { error: updateError } = await supabase
        .from("payment_requests")
        .update({
          receipt_url: publicUrl,
          status:
            freshRequest.status === "pending" ? "processing" : freshRequest.status,
          processing_at:
            freshRequest.status === "pending"
              ? now
              : freshRequest.processing_at,
        })
        .eq("id", request.id)
        .is("receipt_url", null)
        .neq("status", "paid")
        .neq("status", "failed")

      if (updateError) {
        console.error(updateError)
        alert("Receipt saved, but database update failed")
        return
      }

      setOperatorActionMessage("Receipt uploaded and locked.")
      fetchRequests()
    } finally {
      setUploadingReceiptId(null)
    }
  }

  async function lookupTracking(e) {
    if (e) e.preventDefault()

    setTrackingResult(null)
    setTrackingMessage("")

    const cleaned = cleanTrackingId(trackingSearch)

    if (!cleaned) {
      setTrackingMessage("Enter your tracking ID.")
      return
    }

    localStorage.setItem("paythai_tracking", cleaned)
    setTrackingSearch(cleaned)

    window.history.pushState(
      {},
      "",
      `${window.location.pathname}?track=${encodeURIComponent(cleaned)}`
    )

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

    const now = Date.now()

    if (operatorBlockedUntil && now < operatorBlockedUntil) {
      const seconds = Math.ceil((operatorBlockedUntil - now) / 1000)
      setOperatorError(`Please wait ${seconds} seconds before trying again.`)
      return
    }

    if (operatorPinInput === OPERATOR_PIN) {
      setOperatorUnlocked(true)
      setOperatorPinInput("")
      setOperatorError("")
      setOperatorFailedAttempts(0)
      setOperatorBlockedUntil(0)
    } else {
      const attempts = operatorFailedAttempts + 1
      const delayMs = Math.min(10000, attempts * 2000)

      setOperatorFailedAttempts(attempts)
      setOperatorBlockedUntil(Date.now() + delayMs)
      setOperatorError(
        `Wrong operator PIN. Wait ${Math.ceil(delayMs / 1000)} seconds.`
      )

      setTimeout(() => {
        setOperatorBlockedUntil(0)
      }, delayMs)
    }
  }

  function logoutOperator() {
    setOperatorUnlocked(false)
    setOperatorPinInput("")
    setOperatorError("")
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
    const filtered = requests.filter((r) => {
      const searchableValue = `
        ${r.customer_name || ""}
        ${r.customer_email || ""}
        ${r.customer_phone || ""}
        ${r.amount_thb || ""}
        ${r.tracking_id || ""}
      `
        .toLowerCase()
        .trim()

      const expired = isRequestExpired(r)
      const matchesSearch = searchableValue.includes(search.toLowerCase())
      const matchesFilter =
        activeFilter === "all"
          ? true
          : activeFilter === "expired"
          ? expired
          : r.status === activeFilter && !expired

      return matchesSearch && matchesFilter
    })

    return sortRequestsForOps(filtered)
  }, [requests, search, activeFilter])

  const counts = {
    all: requests.length,
    pending: requests.filter((r) => r.status === "pending" && !isRequestExpired(r)).length,
    processing: requests.filter((r) => r.status === "processing").length,
    paid: requests.filter((r) => r.status === "paid").length,
    failed: requests.filter((r) => r.status === "failed").length,
    expired: requests.filter((r) => isRequestExpired(r)).length,
  }

  const todayMetrics = useMemo(() => {
    const todayRequests = requests.filter((request) =>
      isToday(request.created_at)
    )

    const sumByStatus = (status) =>
      todayRequests
        .filter((request) => request.status === status)
        .reduce((total, request) => total + Number(request.amount_thb || 0), 0)

    const todayVolume = todayRequests.reduce(
      (total, request) => total + Number(request.amount_thb || 0),
      0
    )

    const avgTicket =
      todayRequests.length > 0 ? todayVolume / todayRequests.length : 0

    return {
      count: todayRequests.length,
      volume: todayVolume,
      pendingVolume: sumByStatus("pending"),
      processingVolume: sumByStatus("processing"),
      paidVolume: sumByStatus("paid"),
      avgTicket,
    }
  }, [requests])

  const operatorLoginDisabled =
    operatorBlockedUntil && Date.now() < operatorBlockedUntil

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
                Pay Thai QR bills with local payment support.
              </h2>

              <p className="text-gray-600 mb-6">
                PayThai helps visitors securely complete Thai QR and local
                invoice payments with tracking and confirmation updates.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-gray-100 rounded-2xl p-4 font-semibold">
                  Tourist-friendly payments
                </div>

                <div className="bg-gray-100 rounded-2xl p-4 font-semibold">
                  Upload QR or invoice
                </div>

                <div className="bg-gray-100 rounded-2xl p-4 font-semibold">
                  Receipt tracking
                </div>
              </div>

              <div className="mt-5 bg-blue-50 border border-blue-100 rounded-3xl p-5">
                <h3 className="font-bold text-lg mb-2">
                  Thai QR payment support
                </h3>

                <div className="text-gray-700 leading-relaxed">
                  Upload your Thai QR or invoice, submit payment details, and
                  receive confirmation updates while PayThai handles the rest.
                </div>

                <div className="text-gray-600 mt-4">
                  Fee notice: PayThai service fees are shown or confirmed before
                  processing. Exact fees may depend on payment method, amount,
                  and service type.
                </div>

                <div className="text-xs text-gray-500 mt-4 leading-relaxed">
                  Secure manual payment coordination with receipt confirmation
                  and tracking.
                </div>
              </div>

              <div className="mt-5 bg-slate-50 rounded-3xl p-5">
                <h3 className="font-bold text-lg mb-2">Support</h3>

                <p className="text-gray-600">
                  For help with a payment request, use your Tracking ID and
                  contact:
                </p>

                <p className="font-bold mt-2">support@paythai.online</p>
              </div>

              <PublicTrackingPanel
                trackingSearch={trackingSearch}
                setTrackingSearch={setTrackingSearch}
                lookupTracking={lookupTracking}
                trackingResult={trackingResult}
                trackingMessage={trackingMessage}
                setPreview={setPreview}
                copiedId={copiedId}
                copyTrackingId={copyTrackingId}
              />
            </div>

            <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm">
              <h2 className="text-3xl font-bold mb-2">
                Submit Payment Request
              </h2>

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
                      description="Take a photo or upload a Thai QR, invoice, or condo bill. Most requests are confirmed within minutes."
                    />

                    <label className="block bg-sky-500 hover:bg-sky-600 text-white rounded-3xl p-8 text-center font-bold text-2xl cursor-pointer transition">
                      📷 Upload QR or Invoice

                      <p className="text-sm text-sky-100 mt-3 text-center">
                        Secure tracking • Receipt confirmation • Email updates
                      </p>

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

                    <PaymentPreviewCard
                      formData={formData}
                      qrFile={qrFile}
                    />

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
                  <SuccessPanel
                    successMessage={successMessage}
                    trackingSearch={trackingSearch}
                    copiedId={copiedId}
                    onCopy={() => copyTrackingId(trackingSearch)}
                    onSubmitAnother={() => {
                      localStorage.removeItem("paythai_tracking")
                      setTrackingSearch("")
                      setTrackingResult(null)
                      setCustomerStep(1)
                      setSuccessMessage("")
                      window.history.pushState({}, "", window.location.pathname)
                    }}
                  />
                )}
              </form>
            </div>
          </div>
        )}

        {view === "operator" && !operatorUnlocked && (
          <div className="bg-white rounded-3xl p-8 shadow-sm max-w-md mx-auto">
            <h2 className="text-3xl font-bold mb-2">Operator Login</h2>

            <p className="text-gray-500 mb-6">
              Enter operator PIN to access dashboard. This session locks on
              refresh, browser close, or inactivity.
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

              <button
                disabled={operatorLoginDisabled}
                className="w-full bg-sky-500 text-white font-bold py-4 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
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
                  Session-only access. Auto-locks after inactivity.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={fetchRequests}
                  className="bg-gray-900 text-white px-4 py-2 rounded-full font-bold"
                >
                  ↻ Refresh
                </button>

                <div className="bg-green-500 text-white px-4 py-2 rounded-full font-bold w-fit">
                  LIVE
                </div>
              </div>
            </div>

            {operatorActionMessage && (
              <div className="mb-5 bg-blue-50 border border-blue-100 text-blue-800 rounded-2xl p-4 font-semibold">
                {operatorActionMessage}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              {["all", "pending", "processing", "paid", "failed", "expired"].map(
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

            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
              <Stat label="All" value={counts.all} />
              <Stat label="Pending" value={counts.pending} />
              <Stat label="Processing" value={counts.processing} />
              <Stat label="Paid" value={counts.paid} />
              <Stat label="Failed" value={counts.failed} />
              <Stat label="Expired" value={counts.expired} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
              <Stat label="Today Requests" value={todayMetrics.count} />
              <Stat label="Today Volume" value={formatTHB(todayMetrics.volume)} />
              <Stat label="Avg Ticket" value={formatTHB(todayMetrics.avgTicket)} />
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
                const isExpired = isRequestExpired(request)
                const isLocked = isPaid || isFailed || isExpired
                const hasReceipt = !!request.receipt_url
                const isReceiptUploading = uploadingReceiptId === request.id
                const isStatusWorking = statusActionId === request.id
                const isPaidWorking = paidActionId === request.id
                const anyOperatorAction =
                  !!statusActionId || !!paidActionId || !!uploadingReceiptId
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

                          <p className="mt-3 text-xl font-bold">
                            {formatTHB(request.amount_thb)} —{" "}
                            {request.payment_method}
                          </p>

                          <TrackingLine
                            trackingId={request.tracking_id}
                            copiedId={copiedId}
                            onCopy={copyTrackingId}
                            onOpen={() => openCustomerTracking(request)}
                          />

                          <OperatorAuditBox request={request} locked />
                        </div>

                        <StatusBadge status={isExpired ? "expired" : request.status} />
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
                          onOpen={() => openCustomerTracking(request)}
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
                        <StatusBadge status={isExpired ? "expired" : request.status} />

                        <p className="text-sm font-semibold text-gray-500">
                          {request.status === "processing"
                            ? `Processing • ${getTimeAgo(
                                request.processing_at || request.created_at
                              )}`
                            : request.status === "failed"
                            ? "Action required"
                            : isExpired
                            ? "Expired • 24 hr"
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
                          disabled={isLocked || isReceiptUploading || anyOperatorAction}
                          onChange={(e) =>
                            uploadReceipt(request, e.target.files[0])
                          }
                          className="w-full border rounded-xl p-4 disabled:bg-gray-100 disabled:cursor-not-allowed"
                        />
                      )}

                      {isReceiptUploading && (
                        <p className="text-sm text-blue-600 font-semibold mt-2">
                          Uploading receipt...
                        </p>
                      )}
                    </div>

                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold">
                          Internal operator note
                        </p>

                        {noteSavedId === request.id && (
                          <p className="text-sm font-bold text-green-600">
                            Saved ✓
                          </p>
                        )}
                      </div>

                      <textarea
                        defaultValue={request.operator_note || ""}
                        placeholder="Internal notes"
                        className="w-full border rounded-2xl p-3 text-sm"
                        rows={3}
                        disabled={isLocked}
                        onBlur={(e) =>
                          updateOperatorNote(request.id, e.target.value)
                        }
                      />
                    </div>

                    <OperatorAuditBox request={request} locked={isLocked} />

                    <div className="flex gap-3 mt-6 flex-wrap">
                      <button
                        disabled={
                          isLocked ||
                          request.status === "processing" ||
                          anyOperatorAction
                        }
                        onClick={() => updateStatus(request, "processing")}
                        className={`px-5 py-3 rounded-xl font-bold text-white ${
                          isLocked ||
                          request.status === "processing" ||
                          anyOperatorAction
                            ? "bg-gray-300 cursor-not-allowed"
                            : "bg-sky-500 hover:bg-sky-600"
                        }`}
                      >
                        {isStatusWorking
                          ? "Working..."
                          : request.status === "processing"
                          ? "✓ Processing"
                          : "Processing"}
                      </button>

                      <button
                        disabled={
                          isLocked ||
                          !hasReceipt ||
                          isPaidWorking ||
                          anyOperatorAction
                        }
                        onClick={() => updateStatus(request, "paid")}
                        className={`px-5 py-3 rounded-xl font-bold text-white ${
                          isLocked ||
                          !hasReceipt ||
                          isPaidWorking ||
                          anyOperatorAction
                            ? "bg-gray-300 cursor-not-allowed"
                            : "bg-green-500 hover:bg-green-600"
                        }`}
                      >
                        {isPaidWorking ? "Sending..." : "Paid"}
                      </button>

                      <button
                        disabled={isLocked || anyOperatorAction}
                        onClick={() => updateStatus(request, "failed")}
                        className={`px-5 py-3 rounded-xl font-bold text-white ${
                          isLocked || anyOperatorAction
                            ? "bg-gray-300 cursor-not-allowed"
                            : "bg-red-500 hover:bg-red-600"
                        }`}
                      >
                        {isStatusWorking && statusActionId === request.id
                          ? "Working..."
                          : isFailed
                          ? "✓ Failed"
                          : "Failed"}
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

function PublicTrackingPanel({
  trackingSearch,
  setTrackingSearch,
  lookupTracking,
  trackingResult,
  trackingMessage,
  setPreview,
  copiedId,
  copyTrackingId,
}) {
  return (
    <div className="mt-8 bg-slate-50 rounded-3xl p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-2xl font-bold">Track Payment</h3>

          <p className="text-gray-500">
            Enter your Tracking ID to view your live request status.
          </p>
        </div>

        {trackingResult?.tracking_id && (
          <button
            type="button"
            onClick={() => copyTrackingId(trackingResult.tracking_id)}
            className="bg-gray-900 text-white px-4 py-3 rounded-xl font-bold"
          >
            {copiedId === trackingResult.tracking_id
              ? "Copied ✓"
              : "Copy Tracking ID"}
          </button>
        )}
      </div>

      <form onSubmit={lookupTracking} className="flex flex-col sm:flex-row gap-3">
        <input
          value={trackingSearch}
          onChange={(e) => setTrackingSearch(e.target.value.toUpperCase())}
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
        <TrackingStatusPage
          trackingResult={trackingResult}
          setPreview={setPreview}
        />
      )}
    </div>
  )
}

function TrackingStatusPage({ trackingResult, setPreview }) {
  const status = trackingResult.status
  const isExpired = isRequestExpired(trackingResult)
  const isPending = status === "pending" && !isExpired
  const isProcessing = status === "processing"
  const isPaid = status === "paid"
  const isFailed = status === "failed" || isExpired

  return (
    <div className="mt-5 bg-white rounded-3xl border p-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500 font-semibold">Tracking ID</p>

          <p className="text-3xl font-bold">{trackingResult.tracking_id}</p>

          <p className="text-gray-600 mt-2">
            Amount: {formatTHB(trackingResult.amount_thb)}
          </p>

          <p className="text-gray-600">
            Method: {trackingResult.payment_method}
          </p>
        </div>

        <CustomerStatusBadge status={status} expired={isExpired} />
      </div>

      <div className="mt-5">
        <StatusTimeline trackingResult={trackingResult} />
      </div>

      <div className="mt-5 grid gap-3">
        {isPending && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
            <p className="font-bold text-blue-700">Request submitted</p>

            <p className="text-sm text-gray-600">
              Your request is in the PayThai queue. We will update this page as soon as processing starts.
            </p>
          </div>
        )}

        {isProcessing && (
          <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4">
            <p className="font-bold text-orange-700">Payment received</p>

            <p className="text-sm text-gray-600">
              Your request is being processed. Receipt confirmation will appear here once available.
            </p>
          </div>
        )}

        {isPaid && (
          <div className="bg-green-50 border border-green-100 rounded-2xl p-4">
            <p className="font-bold text-green-700">Payment completed</p>

            <p className="text-sm text-gray-600">
              Your receipt is ready. A final confirmation email has been sent or
              will arrive shortly.
            </p>
          </div>
        )}

        {isFailed && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
            <p className="font-bold text-red-700">Action required</p>

            <p className="text-sm text-gray-600">
              Please contact support with your Tracking ID so we can help complete or restart this request.
            </p>
          </div>
        )}
      </div>

      {trackingResult.receipt_url && (
        <button
          onClick={() =>
            setPreview({
              title: "Payment Receipt",
              url: trackingResult.receipt_url,
            })
          }
          className="w-full mt-5 bg-green-500 text-white px-5 py-4 rounded-xl font-bold"
        >
          View Receipt
        </button>
      )}

      <div className="mt-5 border-t pt-4">
        <p className="text-sm text-gray-500">
          Need help? Email{" "}
          <span className="font-bold text-gray-700">
            support@paythai.online
          </span>{" "}
          with your Tracking ID.
        </p>
      </div>
    </div>
  )
}

function StatusTimeline({ trackingResult }) {
  const status = trackingResult.status
  const expired = isRequestExpired(trackingResult)

  const steps = [
    {
      key: "submitted",
      label: "Submitted",
      complete: ["pending", "processing", "paid"].includes(status),
      active: status === "pending" && !expired,
      time: trackingResult.created_at,
    },
    {
      key: "received",
      label: "Payment received",
      complete: ["processing", "paid"].includes(status),
      active: status === "processing",
      time: trackingResult.processing_at,
    },
    {
      key: "completed",
      label: "Payment completed",
      complete: status === "paid",
      active: false,
      time: trackingResult.paid_at,
    },
    {
      key: "receipt",
      label: "Receipt ready",
      complete: !!trackingResult.receipt_url,
      active: false,
      time: trackingResult.receipt_url ? trackingResult.paid_at : null,
    },
  ]

  return (
    <div className="space-y-3">
      {steps.map((step) => (
        <div key={step.key} className="flex items-start gap-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
              step.complete
                ? "bg-green-500 text-white"
                : step.active
                ? "bg-sky-500 text-white"
                : "bg-gray-200 text-gray-500"
            }`}
          >
            {step.complete ? "✓" : step.active ? "•" : ""}
          </div>

          <div>
            <p
              className={`font-bold ${
                step.complete || step.active ? "text-gray-900" : "text-gray-400"
              }`}
            >
              {step.label}
            </p>

            {step.time && (
              <p className="text-xs text-gray-500">
                {new Date(step.time).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      ))}

      {expired && (
        <div className="mt-3 bg-red-50 border border-red-100 rounded-2xl p-3 text-sm text-red-700 font-semibold">
          This request expired after 24 hours. Please contact support or submit a fresh request.
        </div>
      )}
    </div>
  )
}

function PaymentPreviewCard({ formData, qrFile }) {
  const amount = Number(formData.amount_thb || 0)
  const estimatedFee = getEstimatedServiceFee(amount)
  const estimatedTotal = getEstimatedTotal(amount)
  const recipientPreview = getRecipientPreview(formData)

  return (
    <div className="bg-slate-50 rounded-3xl p-5 space-y-4 border border-slate-100">
      <div>
        <p className="text-sm text-gray-500 font-semibold">Payment Preview</p>
        <h3 className="text-2xl font-bold mt-1">
          {amount ? formatTHB(amount) : "Amount pending"}
        </h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div className="bg-white rounded-2xl p-4 border">
          <p className="text-gray-500">Recipient status</p>
          <p className="font-bold">{recipientPreview}</p>
          <p className="text-xs text-gray-400 mt-1">Verified before completion</p>
        </div>

        <div className="bg-white rounded-2xl p-4 border">
          <p className="text-gray-500">QR / Invoice</p>
          <p className="font-bold">{qrFile ? qrFile.name : "No file selected"}</p>
        </div>

        <div className="bg-white rounded-2xl p-4 border">
          <p className="text-gray-500">Estimated service fee</p>
          <p className="font-bold">
            {estimatedFee ? formatTHB(estimatedFee) : "Confirmed before processing"}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-4 border">
          <p className="text-gray-500">Estimated total</p>
          <p className="font-bold">
            {estimatedTotal ? formatTHB(estimatedTotal) : "Confirmed before processing"}
          </p>
        </div>
      </div>

      <div className="text-sm text-gray-600">
        <p>
          <strong>Method:</strong> {formData.payment_method}
        </p>
        <p>
          <strong>Phone:</strong> {formData.country_code} {formData.customer_phone}
        </p>
        <p>
          <strong>Email:</strong> {formData.customer_email}
        </p>
        <p className="text-xs text-gray-400 mt-3">
          Final fee and recipient details are verified before processing.
        </p>
      </div>
    </div>
  )
}

function SuccessPanel({
  successMessage,
  trackingSearch,
  copiedId,
  onCopy,
  onSubmitAnother,
}) {
  return (
    <div>
      <div className="bg-green-50 border border-green-200 rounded-3xl p-6 text-center">
        <div className="text-5xl mb-3">✅</div>

        <h3 className="text-3xl font-bold mb-2">Request Received</h3>

        <p className="text-gray-600 mb-5">
          Your PayThai request is now in the operator queue.
        </p>

        <div className="bg-white rounded-2xl p-5 border mb-5">
          <p className="text-sm text-gray-500 font-semibold">Tracking ID</p>

          <p className="text-3xl font-bold tracking-wide">
            {trackingSearch || "Not assigned"}
          </p>
        </div>

        <button
          type="button"
          onClick={onCopy}
          className="w-full bg-gray-900 text-white font-bold py-4 rounded-xl mb-3"
        >
          {copiedId === trackingSearch ? "Copied ✓" : "Copy Tracking ID"}
        </button>

        {successMessage && (
          <p className="text-green-700 font-semibold mb-3">{successMessage}</p>
        )}

        <p className="text-sm text-gray-500">
          You will receive one final confirmation email after payment is
          completed.
        </p>
      </div>

      <button
        type="button"
        onClick={onSubmitAnother}
        className="w-full mt-4 bg-gray-100 font-bold py-4 rounded-xl"
      >
        Submit Another Request
      </button>
    </div>
  )
}

function TrackingLine({ trackingId, copiedId, onCopy, onOpen }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span>
        <span className="font-bold">Tracking ID:</span>{" "}
        {trackingId || "Not assigned"}
      </span>

      {trackingId && (
        <>
          <button
            type="button"
            onClick={() => onCopy(trackingId)}
            className="bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-lg text-sm font-bold"
          >
            {copiedId === trackingId ? "Copied ✓" : "Copy ID"}
          </button>

          <button
            type="button"
            onClick={onOpen}
            className="bg-gray-900 hover:bg-black text-white px-3 py-1 rounded-lg text-sm font-bold"
          >
            Open Tracking
          </button>
        </>
      )}
    </div>
  )
}

function OperatorAuditBox({ request, locked }) {
  return (
    <div className="mt-4 bg-gray-50 rounded-2xl p-4 text-sm text-gray-600">
      <p className="font-bold text-gray-700 mb-2">
        Operator audit {locked ? "• locked" : ""}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <p>Submitted: {formatDateTime(request.created_at)}</p>
        <p>Processing: {formatDateTime(request.processing_at)}</p>
        <p>Paid: {formatDateTime(request.paid_at)}</p>
        <p>Email sent: {formatDateTime(request.email_sent_at)}</p>
        <p>Receipt: {request.receipt_url ? "Locked ✓" : "Not uploaded"}</p>
        <p>Status lock: {locked ? "Locked ✓" : "Open"}</p>
        <p>Expires: {request.status === "pending" ? formatDateTime(getExpiryAt(request.created_at)) : "—"}</p>
        <p>Expired: {isRequestExpired(request) ? "Yes" : "No"}</p>
      </div>
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

function Stat({ label, value }) {
  return (
    <div className="bg-gray-100 rounded-2xl p-4 text-center">
      <p className="text-sm">{label}</p>
      <p className="text-2xl md:text-3xl font-bold">{value}</p>
    </div>
  )
}

function CustomerStatusBadge({ status, expired }) {
  const label = getCustomerStatusLabel(status, expired)

  return (
    <div
      className={`px-4 py-2 rounded-full text-white font-bold whitespace-nowrap ${
        expired || status === "failed"
          ? "bg-red-500"
          : status === "pending"
          ? "bg-blue-500"
          : status === "processing"
          ? "bg-orange-500"
          : "bg-green-500"
      }`}
    >
      {label}
    </div>
  )
}

function StatusBadge({ status }) {
  const label = status === "expired" ? "expired" : status

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
      {label}
    </div>
  )
}

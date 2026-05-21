import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";

export default function App() {
  const [mode, setModeState] = useState(() => {
    return localStorage.getItem("paythai_mode") || "customer";
  });

  const setMode = (nextMode) => {
    localStorage.setItem("paythai_mode", nextMode);
    setModeState(nextMode);
  };

  const [form, setForm] = useState({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    amount_thb: "",
    payment_method: "Card",
    invoice_note: "",
  });

  const [qrFile, setQrFile] = useState(null);
  const [requests, setRequests] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [viewerUrl, setViewerUrl] = useState("");
  const [viewerTitle, setViewerTitle] = useState("");

  const loadRequests = async () => {
    const { data, error } = await supabase
      .from("payment_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error) setRequests(data || []);
  };

  useEffect(() => {
    loadRequests();

    const channel = supabase
      .channel("payment_requests_live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payment_requests" },
        () => loadRequests()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      const matchesStatus =
        statusFilter === "all" || req.status === statusFilter;

      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        String(req.customer_name || "").toLowerCase().includes(q) ||
        String(req.customer_email || "").toLowerCase().includes(q) ||
        String(req.customer_phone || "").toLowerCase().includes(q) ||
        String(req.amount_thb || "").toLowerCase().includes(q);

      return matchesStatus && matchesSearch;
    });
  }, [requests, statusFilter, search]);

  const counts = useMemo(() => {
    return {
      all: requests.length,
      pending: requests.filter((r) => r.status === "pending").length,
      processing: requests.filter((r) => r.status === "processing").length,
      paid: requests.filter((r) => r.status === "paid").length,
      failed: requests.filter((r) => r.status === "failed").length,
    };
  }, [requests]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const uploadFile = async (file, folder) => {
    if (!file) return "";

    const fileExt = file.name.split(".").pop();
    const fileName = `${folder}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${fileExt}`;

    const { error } = await supabase.storage
      .from("payment-files")
      .upload(fileName, file);

    if (error) {
      console.log("UPLOAD ERROR:", error);
      return "";
    }

    const { data } = supabase.storage
      .from("payment-files")
      .getPublicUrl(fileName);

    return data.publicUrl;
  };

  const submitPaymentRequest = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const qrUrl = await uploadFile(qrFile, "qr-uploads");

    const { error } = await supabase.from("payment_requests").insert([
      {
        customer_name: form.customer_name,
        customer_email: form.customer_email,
        customer_phone: form.customer_phone,
        amount_thb: Number(form.amount_thb),
        payment_method: form.payment_method,
        invoice_note: form.invoice_note,
        qr_image_url: qrUrl,
        status: "pending",
      },
    ]);

    if (error) {
      console.log("INSERT ERROR:", error);
      setMessage("❌ Request failed. Please check details and try again.");
    } else {
      setMessage("✅ Payment request submitted. We will confirm shortly.");
      setForm({
        customer_name: "",
        customer_email: "",
        customer_phone: "",
        amount_thb: "",
        payment_method: "Card",
        invoice_note: "",
      });
      setQrFile(null);
      await loadRequests();
    }

    setLoading(false);
  };

  const updateStatus = async (id, status) => {
    const { error } = await supabase
      .from("payment_requests")
      .update({ status })
      .eq("id", id);

    if (!error) await loadRequests();
  };

  const uploadReceipt = async (id, file) => {
    const receiptUrl = await uploadFile(file, "receipts");
    if (!receiptUrl) return;

    const { error } = await supabase
      .from("payment_requests")
      .update({
        receipt_url: receiptUrl,
        status: "processing",
      })
      .eq("id", id);

    if (!error) await loadRequests();
  };

  const openViewer = (url, title) => {
    setViewerUrl(url);
    setViewerTitle(title);
  };

  const closeViewer = () => {
    setViewerUrl("");
    setViewerTitle("");
  };

  const statusColor = (status) => {
    if (status === "paid") return "#16a34a";
    if (status === "processing") return "#f59e0b";
    if (status === "failed") return "#dc2626";
    return "#2563eb";
  };

  const formatTime = (dateString) => {
    if (!dateString) return "No timestamp";
    return new Date(dateString).toLocaleString();
  };

  const StatusButton = ({ req, status, children, danger }) => {
    const locked = req.status === "paid" || req.status === "failed";
    const active = req.status === status;

    return (
      <button
        disabled={locked}
        onClick={() => updateStatus(req.id, status)}
        style={{
          ...smallButton,
          background: danger ? "#ef4444" : active ? "#94a3b8" : "#0ea5e9",
          cursor: locked ? "not-allowed" : "pointer",
          opacity: locked && !active ? 0.45 : active ? 0.7 : 1,
        }}
      >
        {active ? `✓ ${children}` : children}
      </button>
    );
  };

  return (
    <div style={pageStyle}>
      <header style={topBar}>
        <div>
          <strong style={{ fontSize: 22 }}>PayThai</strong>
          <span style={miniText}> paythai.online</span>
        </div>

        <div style={modeSwitch}>
          <button onClick={() => setMode("customer")} style={mode === "customer" ? activeModeButton : modeButton}>
            Customer
          </button>
          <button onClick={() => setMode("operator")} style={mode === "operator" ? activeModeButton : modeButton}>
            Operator
          </button>
        </div>
      </header>

      {mode === "customer" ? (
        <main style={customerWrap}>
          <section style={heroCard}>
            <div style={logoBox}>QR</div>
            <h1 style={heroTitle}>Pay Thai QR bills without a Thai bank account.</h1>
            <p style={heroSubtitle}>
              Upload a Thai QR, invoice, condo bill, or payment note. PayThai helps coordinate the payment and confirmation.
            </p>

            <div style={trustGrid}>
              <div style={trustBox}>No Thai bank needed</div>
              <div style={trustBox}>QR / invoice upload</div>
              <div style={trustBox}>Receipt tracking</div>
            </div>
          </section>

          <section style={formCard}>
            <h2 style={dashboardTitle}>Submit Payment Request</h2>
            <p style={subtitle}>Use this when a Thai QR payment is required.</p>

            <form onSubmit={submitPaymentRequest}>
              <input name="customer_name" placeholder="Your name" value={form.customer_name} onChange={handleChange} required style={inputStyle} />
              <input name="customer_email" type="email" placeholder="Email" value={form.customer_email} onChange={handleChange} required style={inputStyle} />
              <input name="customer_phone" placeholder="Phone / WhatsApp" value={form.customer_phone} onChange={handleChange} style={inputStyle} />
              <input name="amount_thb" type="number" placeholder="Amount in THB" value={form.amount_thb} onChange={handleChange} required style={inputStyle} />

              <select name="payment_method" value={form.payment_method} onChange={handleChange} style={inputStyle}>
                <option value="Card">Card</option>
                <option value="Crypto">Crypto</option>
              </select>

              <textarea
                name="invoice_note"
                placeholder="Condo name, room number, invoice note, or payment details"
                value={form.invoice_note}
                onChange={handleChange}
                rows="4"
                style={{ ...inputStyle, resize: "vertical" }}
              />

              <label style={labelStyle}>Upload Thai QR / invoice screenshot</label>
              <input type="file" accept="image/*,.pdf" onChange={(e) => setQrFile(e.target.files[0])} style={inputStyle} />

              <button type="submit" disabled={loading} style={mainButton}>
                {loading ? "Submitting..." : "Submit Payment Request"}
              </button>
            </form>

            {message && <div style={messageStyle}>{message}</div>}
          </section>
        </main>
      ) : (
        <main style={operatorWrap}>
          <section style={dashboardCard}>
            <div style={rowBetween}>
              <div>
                <h2 style={dashboardTitle}>Operator Dashboard</h2>
                <p style={subtitle}>Live payment requests from Supabase.</p>
              </div>
              <span style={liveBadge}>LIVE</span>
            </div>

            <div style={statsGrid}>
              <button onClick={() => setStatusFilter("all")} style={statBox}>All<br /><b>{counts.all}</b></button>
              <button onClick={() => setStatusFilter("pending")} style={statBox}>Pending<br /><b>{counts.pending}</b></button>
              <button onClick={() => setStatusFilter("processing")} style={statBox}>Processing<br /><b>{counts.processing}</b></button>
              <button onClick={() => setStatusFilter("paid")} style={statBox}>Paid<br /><b>{counts.paid}</b></button>
              <button onClick={() => setStatusFilter("failed")} style={statBox}>Failed<br /><b>{counts.failed}</b></button>
            </div>

            <input
              placeholder="Search name, email, phone, or amount"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={inputStyle}
            />

            {filteredRequests.map((req) => (
              <div key={req.id} style={requestCard}>
                <div style={rowBetween}>
                  <div>
                    <h3 style={requestName}>{req.customer_name || "Unnamed"}</h3>
                    <p style={smallText}>{req.customer_email}</p>
                    <p style={smallText}>{req.customer_phone}</p>
                    <p style={timeText}>Submitted: {formatTime(req.created_at)}</p>
                  </div>

                  <span style={{ ...statusBadge, background: statusColor(req.status) }}>
                    {req.status}
                  </span>
                </div>

                <div style={amountLine}>฿{req.amount_thb} — {req.payment_method}</div>
                <p style={noteText}>{req.invoice_note}</p>

                <div style={fileRow}>
                  {req.qr_image_url ? (
                    <button onClick={() => openViewer(req.qr_image_url, "QR / Invoice")} style={fileButton}>
                      View QR / Invoice
                    </button>
                  ) : (
                    <span style={missingFile}>No QR uploaded</span>
                  )}

                  {req.receipt_url ? (
                    <button onClick={() => openViewer(req.receipt_url, "Receipt")} style={successFileButton}>
                      Receipt Uploaded
                    </button>
                  ) : (
                    <span style={missingFile}>No receipt yet</span>
                  )}
                </div>

                <label style={labelStyle}>Upload receipt</label>
                <input type="file" accept="image/*,.pdf" onChange={(e) => uploadReceipt(req.id, e.target.files[0])} style={inputStyle} />

                <StatusButton req={req} status="processing">Processing</StatusButton>
                <StatusButton req={req} status="paid">Paid</StatusButton>
                <StatusButton req={req} status="failed" danger>Failed</StatusButton>
              </div>
            ))}
          </section>
        </main>
      )}

      {viewerUrl && (
        <div style={modalOverlay} onClick={closeViewer}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={rowBetween}>
              <h2 style={dashboardTitle}>{viewerTitle}</h2>
              <button onClick={closeViewer} style={closeButton}>Close</button>
            </div>

            {viewerUrl.toLowerCase().includes(".pdf") ? (
              <iframe src={viewerUrl} title={viewerTitle} style={iframeStyle} />
            ) : (
              <img src={viewerUrl} alt={viewerTitle} style={imagePreview} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const pageStyle = { minHeight: "100vh", background: "linear-gradient(135deg, #eef8ff, #f8fafc)", fontFamily: "Arial, sans-serif", padding: "24px" };
const topBar = { maxWidth: "1180px", margin: "0 auto 24px", background: "white", borderRadius: "18px", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 12px 35px rgba(15, 23, 42, 0.08)" };
const miniText = { color: "#64748b", fontWeight: 700 };
const modeSwitch = { display: "flex", gap: "8px" };
const modeButton = { padding: "10px 14px", borderRadius: "12px", border: "1px solid #cbd5e1", background: "#f8fafc", cursor: "pointer", fontWeight: 800 };
const activeModeButton = { ...modeButton, background: "#0ea5e9", color: "white", border: "1px solid #0ea5e9" };
const customerWrap = { maxWidth: "1180px", margin: "0 auto", display: "grid", gridTemplateColumns: "1.2fr 420px", gap: "28px" };
const operatorWrap = { maxWidth: "1180px", margin: "0 auto" };
const heroCard = { background: "white", padding: "42px", borderRadius: "28px", boxShadow: "0 18px 50px rgba(15, 23, 42, 0.10)" };
const heroTitle = { fontSize: "52px", lineHeight: "1.02", color: "#0f172a", margin: "18px 0" };
const heroSubtitle = { color: "#475569", fontSize: "18px", lineHeight: "1.6", maxWidth: "720px" };
const trustGrid = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px", marginTop: "28px" };
const trustBox = { background: "#f1f5f9", padding: "18px", borderRadius: "18px", color: "#0f172a", fontWeight: 900 };
const formCard = { background: "white", padding: "32px", borderRadius: "24px", boxShadow: "0 18px 50px rgba(15, 23, 42, 0.12)", height: "fit-content" };
const dashboardCard = { background: "white", padding: "32px", borderRadius: "24px", boxShadow: "0 18px 50px rgba(15, 23, 42, 0.12)" };
const logoBox = { width: "48px", height: "48px", borderRadius: "16px", background: "#0ea5e9", color: "white", fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center" };
const dashboardTitle = { margin: 0, fontSize: "26px", color: "#0f172a" };
const subtitle = { color: "#64748b", marginBottom: "24px" };
const inputStyle = { width: "100%", padding: "14px", marginBottom: "14px", borderRadius: "14px", border: "1px solid #cbd5e1", fontSize: "15px", boxSizing: "border-box" };
const labelStyle = { display: "block", fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "8px" };
const mainButton = { width: "100%", padding: "15px", borderRadius: "14px", border: "none", background: "#0ea5e9", color: "white", fontSize: "16px", fontWeight: "800", cursor: "pointer" };
const messageStyle = { marginTop: "18px", padding: "14px", borderRadius: "14px", background: "#f1f5f9", color: "#0f172a", fontWeight: "700" };
const requestCard = { border: "1px solid #e2e8f0", borderRadius: "18px", padding: "18px", marginTop: "16px", background: "#ffffff" };
const rowBetween = { display: "flex", justifyContent: "space-between", gap: "16px" };
const requestName = { margin: 0, color: "#0f172a" };
const smallText = { margin: "4px 0", color: "#475569" };
const timeText = { margin: "8px 0 0", color: "#94a3b8", fontSize: "13px" };
const amountLine = { marginTop: "12px", fontSize: "18px", fontWeight: "800", color: "#0f172a" };
const noteText = { color: "#334155" };
const statusBadge = { color: "white", padding: "8px 12px", borderRadius: "999px", fontSize: "13px", fontWeight: "800", height: "fit-content", textTransform: "capitalize" };
const smallButton = { marginRight: "8px", marginTop: "8px", padding: "10px 13px", borderRadius: "12px", border: "none", background: "#0ea5e9", color: "white", fontWeight: "800", cursor: "pointer" };
const fileRow = { display: "flex", gap: "10px", flexWrap: "wrap", margin: "14px 0" };
const fileButton = { padding: "10px 13px", borderRadius: "12px", border: "none", background: "#0284c7", color: "white", fontWeight: "800", cursor: "pointer" };
const successFileButton = { ...fileButton, background: "#16a34a" };
const missingFile = { padding: "10px 13px", borderRadius: "12px", background: "#f1f5f9", color: "#64748b", fontWeight: "700" };
const statsGrid = { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px", marginBottom: "18px" };
const statBox = { padding: "12px", borderRadius: "14px", border: "1px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", fontWeight: "700" };
const liveBadge = { height: "fit-content", padding: "8px 12px", borderRadius: "999px", background: "#16a34a", color: "white", fontWeight: "900", fontSize: "12px" };
const modalOverlay = { position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.65)", display: "flex", justifyContent: "center", alignItems: "center", padding: "30px", zIndex: 999 };
const modalCard = { width: "min(850px, 95vw)", maxHeight: "90vh", overflow: "auto", background: "white", borderRadius: "24px", padding: "24px" };
const closeButton = { padding: "10px 14px", borderRadius: "12px", border: "none", background: "#ef4444", color: "white", fontWeight: "800", cursor: "pointer" };
const imagePreview = { width: "100%", maxHeight: "75vh", objectFit: "contain", borderRadius: "16px", marginTop: "18px" };
const iframeStyle = { width: "100%", height: "75vh", border: "none", borderRadius: "16px", marginTop: "18px" };
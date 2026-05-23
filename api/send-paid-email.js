import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const {
      customerEmail,
      trackingId,
      amount,
      receiptUrl,
    } = req.body;

    if (!customerEmail) {
      return res.status(400).json({
        error: "Missing customer email",
      });
    }

    const emailResponse = await resend.emails.send({
      from: process.env.PAYTHAI_FROM_EMAIL,
      to: customerEmail,
      subject: `Payment Confirmed • ${trackingId}`,
      html: `
        <div style="font-family: Arial; max-width: 500px; margin: auto;">
          
          <h2 style="color:#111827;">
            PayThai Payment Complete
          </h2>

          <p>
            Your Thai QR payment has been marked as
            <strong>PAID</strong>.
          </p>

          <div style="
            background:#f3f4f6;
            padding:16px;
            border-radius:12px;
            margin-top:20px;
            margin-bottom:20px;
          ">
            <p><strong>Tracking ID:</strong> ${trackingId}</p>
            <p><strong>Amount:</strong> ฿${amount}</p>
          </div>

          ${
            receiptUrl
              ? `
            <a
              href="${receiptUrl}"
              style="
                display:inline-block;
                background:#22c55e;
                color:white;
                padding:12px 20px;
                border-radius:10px;
                text-decoration:none;
                font-weight:bold;
              "
            >
              View Receipt
            </a>
          `
              : ""
          }

          <p style="margin-top:30px; color:#6b7280;">
            Thank you for using PayThai.
          </p>

        </div>
      `,
    });

    return res.status(200).json({
      success: true,
      emailResponse,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: error.message,
    });
  }
}
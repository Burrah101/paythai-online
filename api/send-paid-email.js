import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const { customerEmail, trackingId, amount, receiptUrl } = req.body;

    if (!customerEmail) {
      return res.status(400).json({
        error: "Missing customer email",
      });
    }

    if (!trackingId) {
      return res.status(400).json({
        error: "Missing tracking ID",
      });
    }

    const fromEmail =
      process.env.PAYTHAI_FROM_EMAIL || "receipts@paythai.online";

    const safeAmount = Number(amount || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const emailResponse = await resend.emails.send({
      from: fromEmail,
      to: customerEmail,
      subject: `PayThai payment confirmed • ${trackingId}`,
      html: `
        <div style="
          font-family: Arial, Helvetica, sans-serif;
          max-width: 560px;
          margin: 0 auto;
          padding: 24px;
          color: #111827;
        ">
          <div style="
            background: #0ea5e9;
            color: white;
            padding: 18px 20px;
            border-radius: 16px;
            margin-bottom: 22px;
          ">
            <h1 style="
              margin: 0;
              font-size: 24px;
              line-height: 1.25;
            ">
              Payment confirmed
            </h1>
            <p style="
              margin: 8px 0 0;
              font-size: 14px;
              opacity: 0.95;
            ">
              Your PayThai request has been completed.
            </p>
          </div>

          <p style="font-size: 16px; line-height: 1.6; margin: 0 0 18px;">
            Your Thai QR or invoice payment request has been marked as
            <strong>paid</strong>. Keep this email for your records.
          </p>

          <div style="
            background: #f3f4f6;
            padding: 18px;
            border-radius: 14px;
            margin: 20px 0;
            border: 1px solid #e5e7eb;
          ">
            <p style="margin: 0 0 10px;">
              <strong>Tracking ID:</strong> ${trackingId}
            </p>
            <p style="margin: 0;">
              <strong>Amount:</strong> ฿${safeAmount}
            </p>
          </div>

          ${
            receiptUrl
              ? `
                <a
                  href="${receiptUrl}"
                  style="
                    display: inline-block;
                    background: #22c55e;
                    color: white;
                    padding: 13px 22px;
                    border-radius: 12px;
                    text-decoration: none;
                    font-weight: bold;
                    margin: 4px 0 22px;
                  "
                >
                  View Receipt
                </a>
              `
              : `
                <p style="color:#6b7280; font-size:14px;">
                  Receipt confirmation is recorded with your PayThai request.
                </p>
              `
          }

          <div style="
            border-top: 1px solid #e5e7eb;
            margin-top: 24px;
            padding-top: 18px;
          ">
            <p style="
              margin: 0 0 8px;
              color: #374151;
              font-size: 14px;
              line-height: 1.5;
            ">
              Need help? Reply to this email or contact
              <strong>support@paythai.online</strong> with your Tracking ID.
            </p>

            <p style="
              margin: 12px 0 0;
              color: #6b7280;
              font-size: 13px;
              line-height: 1.5;
            ">
              Thank you for using PayThai.
            </p>
          </div>
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
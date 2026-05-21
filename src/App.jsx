import React, { useState } from "react";

const Icon = ({ children, className = "" }) => (
  <span className={`inline-flex items-center justify-center ${className}`} aria-hidden="true">
    {children}
  </span>
);

const ArrowRight = ({ className = "" }) => <Icon className={className}>{'>'}</Icon>;
const BadgeCheck = ({ className = "" }) => <Icon className={className}>{'OK'}</Icon>;
const Check = ({ className = "" }) => <Icon className={className}>{'✓'}</Icon>;
const HelpCircle = ({ className = "" }) => <Icon className={className}>{'?'}</Icon>;
const Lock = ({ className = "" }) => <Icon className={className}>{'LOCK'}</Icon>;
const MessageCircle = ({ className = "" }) => <Icon className={className}>{'CHAT'}</Icon>;
const QrCode = ({ className = "" }) => <Icon className={className}>{'QR'}</Icon>;
const ShieldCheck = ({ className = "" }) => <Icon className={className}>{'SAFE'}</Icon>;
const Store = ({ className = "" }) => <Icon className={className}>{'MGMT'}</Icon>;
const Wallet = ({ className = "" }) => <Icon className={className}>{'USDT'}</Icon>;
const Zap = ({ className = "" }) => <Icon className={className}>{'CARD'}</Icon>;

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-lg shadow-sky-500/15">
        <QrCode className="h-6 w-6 text-xs font-black" />
      </div>
      <div>
        <div className="text-xl font-black tracking-tight text-slate-900">PayThai</div>
        <div className="-mt-1 text-xs font-bold tracking-wide text-slate-500">paythai.online</div>
      </div>
    </div>
  );
}

function Pill({ children }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white px-4 py-2 text-sm font-extrabold text-slate-900 shadow-sm">
      <BadgeCheck className="h-4 w-4 text-xs text-sky-600" /> {children}
    </div>
  );
}

function Feature({ icon: IconComponent, title, text }) {
  return (
    <div className="rounded-[2rem] border border-sky-100 bg-white p-6 shadow-sm transition hover:shadow-xl hover:shadow-sky-700/10">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
        <IconComponent className="h-6 w-6 text-[10px] font-black" />
      </div>
      <h3 className="mt-5 text-lg font-black text-slate-900">{title}</h3>
      <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{text}</p>
    </div>
  );
}

function Step({ number, title, text }) {
  return (
    <div className="relative rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-600 text-sm font-black text-white">
        {number}
      </div>
      <h3 className="mt-5 text-lg font-black text-slate-900">{title}</h3>
      <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{text}</p>
    </div>
  );
}

function PriceCard({ icon: IconComponent, title, fee, time, text, highlighted }) {
  return (
    <div className={`rounded-[2rem] border p-6 shadow-sm ${highlighted ? "border-sky-200 bg-sky-600 text-white shadow-xl shadow-sky-600/15" : "border-sky-100 bg-white text-slate-900"}`}>
      <div className="flex items-center justify-between">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${highlighted ? "bg-white/10 text-white" : "bg-sky-50 text-sky-700"}`}>
          <IconComponent className="h-6 w-6 text-[10px] font-black" />
        </div>
        {highlighted && <div className="rounded-full bg-white/20 px-3 py-1 text-xs font-black text-white">Priority</div>}
      </div>
      <h3 className="mt-5 text-xl font-black">{title}</h3>
      <div className="mt-3 text-5xl font-black tracking-tight">{fee}</div>
      <div className={`mt-2 text-sm font-black ${highlighted ? "text-sky-100" : "text-sky-600"}`}>{time}</div>
      <p className={`mt-4 text-sm font-medium leading-6 ${highlighted ? "text-white/75" : "text-slate-600"}`}>{text}</p>
    </div>
  );
}

function PhoneMockup() {
  return (
    <div className="mx-auto w-full max-w-[360px] rounded-[2.2rem] border border-white/70 bg-white/90 p-3 shadow-2xl shadow-sky-500/15 backdrop-blur">
      <div className="overflow-hidden rounded-[1.7rem] border border-slate-100 bg-gradient-to-b from-white to-sky-50 p-5">
        <div className="flex items-center justify-between">
          <Logo />
          <Lock className="h-5 w-5 text-[9px] font-black text-sky-600" />
        </div>
        <div className="mt-8 rounded-[2rem] bg-sky-600 p-5 text-white">
          <div className="text-xs font-black text-sky-100">Thai QR Amount</div>
          <div className="mt-2 text-4xl font-black">฿1,500</div>
          <div className="mt-2 text-sm text-white/65">Condo bill / invoice payment</div>
        </div>
        <div className="mt-4 space-y-3 rounded-[2rem] bg-white p-4 shadow-sm">
          <div className="flex justify-between text-sm font-bold text-slate-600"><span>Payment method</span><span>Crypto/Card</span></div>
          <div className="flex justify-between text-sm font-bold text-slate-600"><span>Receipt</span><span>Stored</span></div>
          <div className="h-px bg-slate-100" />
          <div className="flex justify-between text-base font-black text-slate-900"><span>Status</span><span>Ready</span></div>
        </div>
        <button className="mt-5 flex w-full items-center justify-center gap-2 rounded-3xl bg-sky-500 px-5 py-4 text-sm font-black text-white">
          Example Flow <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [audience, setAudience] = useState("resident");

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#eef6ff,transparent_34%),radial-gradient(circle_at_bottom_right,#f4fbff,transparent_38%)] text-slate-900">
      <header className="sticky top-0 z-40 border-b border-white/60 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <Logo />
          <nav className="hidden items-center gap-7 text-sm font-black text-slate-600 md:flex">
            <a href="#how">How it works</a>
            <a href="#fees">Fees</a>
            <a href="#management">Management</a>
            <a href="#faq">FAQ</a>
          </nav>
          <a href="#request" className="rounded-full bg-sky-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-sky-600/15">
            Request Access
          </a>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 md:grid-cols-2 md:py-24">
          <div>
            <Pill>Built for foreigners in Thailand</Pill>
            <h1 className="mt-6 text-5xl font-black leading-[0.95] tracking-tight text-slate-900 md:text-7xl">
              Pay Thai QR bills without a Thai bank account.
            </h1>
            <p className="mt-6 max-w-xl text-lg font-medium leading-8 text-slate-600">
              PayThai helps foreign residents and visitors coordinate QR-based payments for condo rent, utilities, invoices, and QR-only services in Pattaya.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#request" className="flex items-center justify-center gap-2 rounded-3xl bg-sky-600 px-7 py-4 text-base font-black text-white shadow-xl shadow-sky-600/15">
                Request Access <ArrowRight className="h-5 w-5 text-white" />
              </a>
              <a href="#how" className="flex items-center justify-center gap-2 rounded-3xl border border-sky-100 bg-white px-7 py-4 text-base font-black text-slate-900 shadow-sm">
                See How It Works
              </a>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4 text-center">
              <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="font-black text-slate-900">No Thai Bank</div><div className="mt-1 text-xs font-bold text-slate-500">needed</div></div>
              <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="font-black text-slate-900">Digital Payments</div><div className="mt-1 text-xs font-bold text-slate-500">no cash handling</div></div>
              <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="font-black text-slate-900">Receipts</div><div className="mt-1 text-xs font-bold text-slate-500">tracked proof</div></div>
              <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="font-black text-slate-900">Pattaya</div><div className="mt-1 text-xs font-bold text-slate-500">initial rollout</div></div>
            </div>
          </div>
          <PhoneMockup />
        </section>

        <section id="how" className="bg-white/70 py-16">
          <div className="mx-auto max-w-7xl px-5">
            <div className="text-center">
              <h2 className="text-4xl font-black tracking-tight text-slate-900 md:text-5xl">Simple payment flow</h2>
              <p className="mx-auto mt-4 max-w-2xl text-base font-medium leading-7 text-slate-600">
                Designed for the moment a condo office, landlord, service provider, or QR-only business requires Thai QR payment and the customer cannot use PromptPay.
              </p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              <Step number="1" title="Upload invoice or QR" text="The customer uploads the Thai QR code or invoice screenshot from their phone." />
              <Step number="2" title="Choose payment method" text="The customer reviews the amount and pays by supported crypto or card method." />
              <Step number="3" title="Receive confirmation" text="PayThai stores the request, tracks status, and provides receipt/confirmation proof." />
            </div>
          </div>
        </section>

        <section id="fees" className="py-16">
          <div className="mx-auto max-w-7xl px-5">
            <div className="text-center">
              <h2 className="text-4xl font-black tracking-tight text-slate-900 md:text-5xl">Transparent service fees</h2>
              <p className="mx-auto mt-4 max-w-2xl text-base font-medium leading-7 text-slate-600">
                Pricing reflects processing costs, coordination, receipt tracking, payment support, and operational infrastructure.
              </p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              <PriceCard icon={Wallet} title="Crypto Pay" fee="5%" time="Lower-cost route" text="Designed for USDT and crypto users who need a clean bridge to local Thai QR payments." />
              <PriceCard icon={Zap} title="Card Pay" fee="7.7%" time="Card convenience" text="For customers who need a card-based option when Thai banking, cash, or local transfer access is not available." highlighted />
            </div>
          </div>
        </section>

        <section className="bg-sky-600 py-16 text-white">
          <div className="mx-auto grid max-w-7xl gap-6 px-5 md:grid-cols-4">
            <Feature icon={ShieldCheck} title="Trust first" text="Every payment request should have status visibility, confirmation records, and receipt history." />
            <Feature icon={Lock} title="Secure records" text="Backend records are designed for accountability, management confidence, and customer proof." />
            <Feature icon={MessageCircle} title="Support path" text="A clear support channel helps reduce confusion during payment coordination." />
            <Feature icon={Store} title="Partner friendly" text="Condos and service providers keep their existing QR workflow while reducing payment friction." />
          </div>
        </section>

        <section id="management" className="py-16">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 md:grid-cols-2">
            <div>
              <h2 className="text-4xl font-black tracking-tight text-slate-900 md:text-5xl">For condo management and service providers</h2>
              <p className="mt-4 text-base font-medium leading-7 text-slate-600">
                PayThai reduces QR payment friction without requiring management offices, landlords, or service providers to change their existing payment systems.
              </p>
              <ul className="mt-6 space-y-3 text-sm font-bold text-slate-700">
                <li className="flex gap-2"><Check className="h-5 w-5 text-sky-600" /> Keep existing Thai QR workflows</li>
                <li className="flex gap-2"><Check className="h-5 w-5 text-sky-600" /> Reduce manual assistance requests</li>
                <li className="flex gap-2"><Check className="h-5 w-5 text-sky-600" /> Provide customers a clear payment path</li>
                <li className="flex gap-2"><Check className="h-5 w-5 text-sky-600" /> No cash handling required</li>
              </ul>
            </div>
            <div className="rounded-[2rem] border border-sky-100 bg-white p-6 shadow-xl shadow-sky-700/10">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700"><Store className="h-6 w-6 text-[10px] font-black" /></div>
                <div><div className="text-lg font-black text-slate-900">PayThai Ready</div><div className="text-sm font-bold text-slate-500">For selected Pattaya partners</div></div>
              </div>
              <div className="mt-6 rounded-[2rem] bg-slate-50 p-5">
                <QrCode className="mx-auto h-32 w-32 text-2xl font-black text-slate-900" />
                <div className="mt-4 text-center text-sm font-black text-slate-900">Customers scan here when Thai QR payment is needed</div>
              </div>
            </div>
          </div>
        </section>

        <section id="request" className="bg-white/80 py-16">
          <div className="mx-auto max-w-3xl px-5 text-center">
            <h2 className="text-4xl font-black tracking-tight text-slate-900 md:text-5xl">Available in Pattaya</h2>
            <p className="mx-auto mt-4 max-w-2xl text-base font-medium leading-7 text-slate-600">
              PayThai is focused on payment friction around condo rent, utility bills, invoices, and QR-only payment requests for foreigners without access to Thai scan payments.
            </p>
            <div className="mt-8 rounded-[2rem] border border-sky-100 bg-white p-4 shadow-xl shadow-sky-700/10">
              <div className="grid gap-3 sm:grid-cols-3">
                {["resident", "management", "service provider"].map((item) => (
                  <button
                    key={item}
                    onClick={() => setAudience(item)}
                    className={`rounded-2xl px-4 py-3 text-sm font-black capitalize ${audience === item ? "bg-sky-600 text-white" : "bg-slate-50 text-slate-900"}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                <input className="rounded-2xl border border-slate-200 px-5 py-4 text-sm font-bold outline-none focus:border-sky-500" placeholder="Email or WhatsApp" />
                <button className="rounded-2xl bg-sky-500 px-7 py-4 text-sm font-black text-white">Request Access</button>
              </div>
              <p className="mt-3 text-xs font-bold text-slate-400">For access requests, management partnerships, and platform updates.</p>
            </div>
          </div>
        </section>

        <section id="faq" className="py-16">
          <div className="mx-auto max-w-4xl px-5">
            <h2 className="text-center text-4xl font-black tracking-tight text-slate-900 md:text-5xl">FAQ</h2>
            <div className="mt-10 space-y-4">
              {[
                ["Is PayThai a bank?", "No. PayThai coordinates foreigner-to-Thai QR payments and payment support. Banking, processing, and compliance infrastructure will evolve with licensed partners over time."],
                ["Who is PayThai designed for?", "Foreign residents, visitors, condo management teams, and service providers in Pattaya who deal with QR-based bills, invoices, rent, utilities, and local payment requests."],
                ["Why charge fees?", "The service solves payment friction and includes processing costs, coordination, support, receipt tracking, and operational infrastructure."],
                ["Does management need to change systems?", "No. The goal is to let management keep existing Thai QR workflows while giving foreigners a cleaner payment path."],
              ].map(([q, a]) => (
                <div key={q} className="rounded-[1.5rem] border border-sky-100 bg-white p-5 shadow-sm">
                  <div className="flex items-start gap-3">
                    <HelpCircle className="mt-1 h-5 w-5 shrink-0 text-sky-600" />
                    <div>
                      <h3 className="font-black text-slate-900">{q}</h3>
                      <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{a}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-sky-100 bg-white py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 text-center md:flex-row md:text-left">
          <Logo />
          <div className="text-sm font-bold text-slate-500">© 2026 PayThai.online · Foreigner payment coordination platform based in Pattaya, Thailand</div>
        </div>
      </footer>
    </div>
  );
}

"use client";

import { motion } from "motion/react";
import { BookOpenText, Check, FileText, Inbox, MessageCircle, Package, Send, X } from "lucide-react";
import { Reveal, SectionHeading } from "./reveal";

const tools = [
  { icon: Inbox, title: "Order inbox", text: "Every PO in one list. Accept, reject, partly fill, or forward up your own chain." },
  { icon: BookOpenText, title: "Khata / udhaar", text: "Fulfilled orders post to each customer's balance. Send the statement on WhatsApp." },
  { icon: FileText, title: "GST invoices", text: "A fulfilled PO becomes a tax invoice with GSTIN, HSN and tax breakup." },
  { icon: Package, title: "Packet-level stock", text: "Packets and cases, scan-in, counts and reorders — on the same engine." },
];

const orders = [
  { from: "Spice Route Café", items: "Amul Butter 500g × 10", amount: "₹2,750", status: "new" },
  { from: "The Bread Lab", items: "Maida 25kg × 4", amount: "₹4,320", status: "accepted" },
  { from: "Chai Point Outlet", items: "Milk 1L × 60", amount: "₹3,840", status: "partial" },
];

export function Suppliers() {
  return (
    <section id="suppliers" className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <div className="order-2 lg:order-1">
            <Reveal className="relative rounded-[2rem] border border-line bg-paper p-5 sm:p-7">
              <div className="flex items-center justify-between">
                <p className="font-semibold">Order inbox</p>
                <span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-semibold text-white">3 today</span>
              </div>
              <ul className="mt-5 space-y-3">
                {orders.map((o, i) => (
                  <motion.li
                    key={o.from}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.15 + i * 0.12, duration: 0.5 }}
                    className="rounded-2xl border border-line bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{o.from}</p>
                        <p className="mt-0.5 truncate text-sm text-muted">{o.items}</p>
                      </div>
                      <p className="font-mono text-sm font-semibold">{o.amount}</p>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      {o.status === "new" ? (
                        <>
                          <span className="inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1 text-xs font-medium text-white">
                            <Check className="size-3" /> Accept
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 text-xs font-medium">
                            Partial
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 text-xs font-medium text-muted">
                            <X className="size-3" /> Reject
                          </span>
                        </>
                      ) : (
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${o.status === "accepted" ? "bg-brand-50 text-brand-700" : "bg-saffron-100 text-saffron-600"}`}
                        >
                          {o.status === "accepted" ? "Accepted · invoice ready" : "Partly filled · 48 of 60"}
                        </span>
                      )}
                    </div>
                  </motion.li>
                ))}
              </ul>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.6 }}
                className="mt-4 flex items-center justify-between rounded-2xl bg-ink p-4 text-white"
              >
                <div>
                  <p className="text-xs text-white/60">Khata · Spice Route Café</p>
                  <p className="text-lg font-semibold">₹18,450 due</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#25d366] px-3 py-1.5 text-xs font-semibold">
                  <MessageCircle className="size-3.5" /> Send reminder
                </span>
              </motion.div>
            </Reveal>
          </div>

          <div className="order-1 lg:order-2">
            <SectionHeading
              align="left"
              eyebrow="For suppliers · free"
              title={
                <>
                  Collect orders and payments <span className="font-serif font-normal italic text-brand-700">without the calls</span>
                </>
              }
              description="When a kitchen sends you a PO, you don't need an account — it arrives on WhatsApp with a free invite link. Join, and your customers' orders land straight in your inbox."
            />
            <div className="mt-10 grid gap-5 sm:grid-cols-2">
              {tools.map(({ icon: Icon, title, text }, i) => (
                <Reveal key={title} delay={i * 0.07} className="flex gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-semibold">{title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal delay={0.3} className="mt-8 inline-flex items-center gap-2 rounded-full border border-line bg-paper px-4 py-2 text-sm text-muted">
              <Send className="size-4 text-brand-600" />
              Not on StockSetu yet? POs still reach you on WhatsApp, PDF or SMS.
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

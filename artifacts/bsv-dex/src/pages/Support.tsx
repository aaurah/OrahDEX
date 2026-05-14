import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  MessageCircle, Mail, Send, ChevronDown, ChevronUp,
  Headphones, BookOpen, Zap, Shield, HelpCircle,
  CheckCircle2, AlertCircle, Clock, ExternalLink,
  MessageSquare, Globe, ArrowRight, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { BrandLogo } from "@/components/BrandLogo";
import { useNotificationStore } from "@/store/useNotificationStore";
import { useWalletStore } from "@/store/useWalletStore";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const CATEGORIES = [
  { value: "general",    label: "General Inquiry" },
  { value: "trading",    label: "Trading & Orders" },
  { value: "wallet",     label: "Wallet & Deposits" },
  { value: "withdrawal", label: "Withdrawals" },
  { value: "kyc",        label: "KYC / Verification" },
  { value: "technical",  label: "Technical Issue" },
  { value: "fees",       label: "Fees & Billing" },
  { value: "security",   label: "Security" },
  { value: "other",      label: "Other" },
];

type PublicFaq = {
  id: number;
  question: string;
  answer: string;
  category: string;
};

const DEFAULT_FAQS: PublicFaq[] = [
  {
    id: 1,
    question: "How do I connect my wallet to Orah?",
    answer: "Click the 'Connect Wallet' button in the top-right corner. Orah supports MetaMask, WalletConnect, Coinbase Wallet, and BSV wallets. After connecting, you'll be able to trade immediately.",
    category: "wallet",
  },
  {
    id: 2,
    question: "What fees does Orah charge?",
    answer: "Spot trading fees are 0.30% maker / 0.30% taker for Standard tier. Fees reduce for Guardian (0.25%), Elder (0.20%), and Archon (0.15%) keeper tiers. Futures trading starts at 0.02% maker / 0.04% taker.",
    category: "fees",
  },
  {
    id: 3,
    question: "How does BSV settlement work?",
    answer: "All trades on Orah settle on the Bitcoin SV blockchain. Settlement is typically completed in under 5 seconds at a cost of less than $0.001. You don't need BSV to trade — settlement is handled automatically.",
    category: "trading",
  },
  {
    id: 4,
    question: "How long do withdrawals take?",
    answer: "EVM withdrawals typically take 1–10 minutes depending on network congestion. BSV withdrawals settle in under 5 seconds. P2P trades settle within the agreed timeframe between parties.",
    category: "withdrawal",
  },
  {
    id: 5,
    question: "Is KYC required to trade?",
    answer: "Orah supports trading without KYC under certain thresholds. For larger volumes and fiat on-ramps, KYC verification may be required. Check the Platform Settings or contact support for current thresholds.",
    category: "kyc",
  },
  {
    id: 6,
    question: "What is CopyVault and how does it work?",
    answer: "CopyVault lets you automatically mirror elite traders. Deposit USDT into a vault and your capital proportionally copies the leader's trades. You pay a performance fee only on profits — no upfront cost.",
    category: "trading",
  },
];

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("border border-border rounded-xl overflow-hidden transition-all", open && "border-primary/30")}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left gap-4 hover:bg-white/3 transition-colors"
      >
        <span className={cn("font-medium text-sm", open ? "text-foreground" : "text-muted-foreground")}>{question}</span>
        {open
          ? <ChevronUp className="w-4 h-4 text-primary shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        }
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed border-t border-border/50 pt-3">
          {answer}
        </div>
      )}
    </div>
  );
}

export function SupportPage() {
  const { toast } = useToast();
  const { addNotification } = useNotificationStore();
  const { address } = useWalletStore();
  const [form, setForm] = useState({
    name: "", email: "", subject: "", category: "general", message: "",
  });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [faqSearch, setFaqSearch] = useState("");
  const [faqCategory, setFaqCategory] = useState("all");
  const [faqs, setFaqs] = useState<PublicFaq[]>(DEFAULT_FAQS);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "support"; text: string; ts: number }[]>([
    { role: "support", text: "Hi! Welcome to Orah Support. How can I help you today?", ts: Date.now() },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    const loadPublishedFaqs = async () => {
      try {
        const r = await fetch(`${BASE}/api/support/faqs`);
        if (!r.ok) throw new Error("Failed to fetch FAQs");
        const data = await r.json();
        if (!alive || !Array.isArray(data)) return;
        const normalized = data
          .filter((row): row is PublicFaq => (
            typeof row?.id === "number"
            && Number.isFinite(row.id)
            && typeof row?.question === "string"
            && row.question.trim().length > 0
            && typeof row?.answer === "string"
            && row.answer.trim().length > 0
            && typeof row?.category === "string"
            && row.category.trim().length > 0
          ));
        if (import.meta.env.DEV && normalized.length !== data.length) {
          console.warn(`Filtered ${data.length - normalized.length} malformed FAQ item(s) from /api/support/faqs.`);
        }
        setFaqs(normalized);
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn("Failed to load published FAQs, using defaults.", err);
        }
        if (!alive) return;
        setFaqs(DEFAULT_FAQS);
      }
    };
    loadPublishedFaqs();
    return () => { alive = false; };
  }, []);

  const filteredFaqs = faqs.filter(f => {
    const matchCat = faqCategory === "all" || f.category === faqCategory;
    const q = faqSearch.toLowerCase();
    const matchSearch = !q || f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.subject || !form.message) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const r = await fetch(`${BASE}/api/support/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed to send");
      setSent(true);
      toast({ title: "Message sent!", description: data.message });
      addNotification({
        type:  "support",
        title: "New Support Ticket",
        body:  `${form.name} (${form.email}) · ${form.category} · ${form.subject.slice(0, 60)}${address ? ` · wallet: ${address.slice(0, 8)}…` : ""}`,
      });
    } catch (err: any) {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages(m => [...m, { role: "user", text: userMsg, ts: Date.now() }]);
    addNotification({
      type:  "support",
      title: "Live Chat Message",
      body:  `${address ? address.slice(0, 10) + "…" : "Anonymous"} · ${userMsg.slice(0, 80)}${userMsg.length > 80 ? "…" : ""}`,
    });
    setChatLoading(true);
    try {
      const convRes = await fetch(`${BASE}/api/ai/conversations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Support Chat" }) });
      const conv = await convRes.json();
      const msgRes = await fetch(`${BASE}/api/ai/conversations/${conv.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content: userMsg }),
      });
      const msgData = await msgRes.json();
      const reply = msgData?.reply ?? msgData?.content ?? "Our support team will get back to you shortly.";
      setChatMessages(m => [...m, { role: "support", text: reply, ts: Date.now() }]);
    } catch {
      setChatMessages(m => [...m, { role: "support", text: "We've received your message. A support agent will respond within 24 hours.", ts: Date.now() }]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <BrandLogo textSize="text-sm" />
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/markets" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Markets
            </Link>
            <Link href="/trade/BSV-USDT" className="px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:brightness-110 transition-all">
              Launch App
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-border bg-gradient-to-b from-card to-background">
        <div className="max-w-6xl mx-auto px-4 py-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-6">
            <Headphones className="w-3.5 h-3.5" />
            <span>24/7 SUPPORT</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">How can we help?</h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Get help with trading, wallets, withdrawals, or anything else. Our team is here around the clock.
          </p>

          {/* Quick action cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-10 max-w-3xl mx-auto text-left">
            {[
              {
                icon: MessageCircle,
                title: "Live Chat",
                desc: "Chat with Ora AI or escalate to a human agent",
                action: () => setChatOpen(true),
                cta: "Start Chat",
                color: "text-primary",
                bg: "bg-primary/10",
              },
              {
                icon: Mail,
                title: "Email Support",
                desc: "Submit a ticket and we'll reply within 24 hours",
                href: "#contact-form",
                cta: "Send Message",
                color: "text-blue-400",
                bg: "bg-blue-400/10",
              },
              {
                icon: BookOpen,
                title: "FAQ",
                desc: "Find instant answers to common questions",
                href: "#faq",
                cta: "Browse FAQ",
                color: "text-purple-400",
                bg: "bg-purple-400/10",
              },
            ].map(card => (
              <div
                key={card.title}
                className="bg-card border border-border rounded-2xl p-5 hover:border-primary/30 transition-all group cursor-pointer"
                onClick={() => {
                  if (card.action) { card.action(); return; }
                  if (card.href) { document.querySelector(card.href)?.scrollIntoView({ behavior: "smooth" }); }
                }}
              >
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", card.bg)}>
                  <card.icon className={cn("w-5 h-5", card.color)} />
                </div>
                <h3 className="font-semibold text-sm mb-1">{card.title}</h3>
                <p className="text-xs text-muted-foreground mb-3">{card.desc}</p>
                <span className={cn("text-xs font-semibold flex items-center gap-1 group-hover:gap-2 transition-all", card.color)}>
                  {card.cta} <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Status banner */}
      <div className="bg-green-500/5 border-b border-green-500/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-center gap-3 text-sm">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-green-400 font-medium">All systems operational</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">Average response time: &lt; 2 hours</span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-12 space-y-16">
        {/* Contact channels */}
        <section>
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Contact Channels
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: Mail, label: "General Support", value: "support@orah.org", href: "mailto:support@orah.org", color: "text-primary" },
              { icon: Shield, label: "Security & Legal", value: "legal@orah.org", href: "mailto:legal@orah.org", color: "text-blue-400" },
              { icon: Globe, label: "Press & Media", value: "press@orah.org", href: "mailto:press@orah.org", color: "text-purple-400" },
              { icon: MessageSquare, label: "Community", value: "Telegram Channel", href: "#", color: "text-teal-400" },
            ].map(ch => (
              <a
                key={ch.label}
                href={ch.href}
                className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-all group"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                    <ch.icon className={cn("w-4 h-4", ch.color)} />
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">{ch.label}</span>
                </div>
                <p className={cn("text-sm font-semibold group-hover:underline", ch.color)}>{ch.value}</p>
              </a>
            ))}
          </div>
        </section>

        {/* FAQ section */}
        <section id="faq">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-primary" />
              Frequently Asked Questions
            </h2>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <input
                value={faqSearch}
                onChange={e => setFaqSearch(e.target.value)}
                placeholder="Search FAQ..."
                className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
            <select
              value={faqCategory}
              onChange={e => setFaqCategory(e.target.value)}
              className="bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-muted-foreground focus:outline-none focus:border-primary/50"
            >
              <option value="all">All Categories</option>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          {filteredFaqs.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No FAQs found. <button onClick={() => { setFaqSearch(""); setFaqCategory("all"); }} className="text-primary hover:underline">Clear filters</button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredFaqs.map(faq => (
                <FaqItem key={faq.id} question={faq.question} answer={faq.answer} />
              ))}
            </div>
          )}
        </section>

        {/* Contact form */}
        <section id="contact-form">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div>
                <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                  <Send className="w-5 h-5 text-primary" />
                  Send a Message
                </h2>
                <p className="text-sm text-muted-foreground">
                  Fill out the form and our team will respond as soon as possible.
                </p>
              </div>
              <div className="space-y-4">
                {[
                  { icon: Clock, label: "Response Time", value: "Under 2 hours (usually faster)" },
                  { icon: Shield, label: "Privacy", value: "Your message is encrypted and secure" },
                  { icon: Zap, label: "24/7 Coverage", value: "Our team spans all time zones" },
                ].map(item => (
                  <div key={item.label} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <item.icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-3">
              {sent ? (
                <div className="bg-card border border-green-500/30 rounded-2xl p-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="w-8 h-8 text-green-400" />
                  </div>
                  <h3 className="font-bold text-lg mb-2">Message Received!</h3>
                  <p className="text-muted-foreground text-sm mb-6">
                    We've received your message and will get back to you within 24 hours. Check your email for a confirmation.
                  </p>
                  <button
                    onClick={() => { setSent(false); setForm({ name: "", email: "", subject: "", category: "general", message: "" }); }}
                    className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:brightness-110 transition-all"
                  >
                    Send Another Message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                        Your Name <span className="text-red-400">*</span>
                      </label>
                      <input
                        value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="John Doe"
                        required
                        className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                        Email Address <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                        placeholder="you@example.com"
                        required
                        className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                      Category
                    </label>
                    <select
                      value={form.category}
                      onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                      className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
                    >
                      {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                      Subject <span className="text-red-400">*</span>
                    </label>
                    <input
                      value={form.subject}
                      onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                      placeholder="Briefly describe your issue..."
                      required
                      className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                      Message <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      value={form.message}
                      onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                      rows={5}
                      placeholder="Describe your issue in detail. Include any relevant transaction IDs, wallet addresses, or error messages..."
                      required
                      className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={sending}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sending ? (
                      <><div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" /> Sending...</>
                    ) : (
                      <><Send className="w-4 h-4" /> Send Message</>
                    )}
                  </button>

                  <p className="text-xs text-muted-foreground text-center">
                    By submitting this form you agree to our{" "}
                    <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
                  </p>
                </form>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 mt-12">
        <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <BrandLogo textSize="text-sm" />
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/whitepaper" className="hover:text-foreground transition-colors">Whitepaper</Link>
          </div>
          <p className="text-xs text-muted-foreground">© 2026 Orah. All rights reserved.</p>
        </div>
      </footer>

      {/* Live Chat Widget */}
      {chatOpen && (
        <div className="fixed bottom-24 right-6 w-80 bg-card border border-border rounded-2xl shadow-2xl shadow-black/40 z-50 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-primary/10">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-sm font-semibold">Orah Support</span>
            </div>
            <button onClick={() => setChatOpen(false)} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-72">
            {chatMessages.map((msg, i) => (
              <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[80%] rounded-2xl px-3 py-2 text-xs leading-relaxed",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-secondary text-foreground rounded-bl-sm"
                )}>
                  {msg.text}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-secondary rounded-2xl rounded-bl-sm px-3 py-2 text-xs">
                  <span className="animate-pulse">Typing...</span>
                </div>
              </div>
            )}
          </div>
          <div className="p-3 border-t border-border flex gap-2">
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendChat()}
              placeholder="Type a message..."
              className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary/50"
            />
            <button
              onClick={sendChat}
              disabled={chatLoading || !chatInput.trim()}
              className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Chat toggle button */}
      <button
        onClick={() => setChatOpen(o => !o)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg shadow-primary/30 flex items-center justify-center hover:brightness-110 transition-all z-40"
      >
        {chatOpen
          ? <span className="text-xl font-bold leading-none">×</span>
          : <MessageCircle className="w-6 h-6" />
        }
      </button>
    </div>
  );
}

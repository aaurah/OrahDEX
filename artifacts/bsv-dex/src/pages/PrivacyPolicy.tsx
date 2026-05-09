import { ArrowLeft, Shield, Eye, Database, Globe, Lock, Trash2, Mail, RefreshCw } from "lucide-react";
import { useLocation } from "wouter";
import { OrahDEXInline } from "@/components/BrandLogo";

const EFFECTIVE_DATE = "25 March 2026";
const COMPANY = "Orah";
const DOMAIN = "orah.org";
const CONTACT = "privacy@orah.org";

function Section({ title, icon: Icon, children }: { title: string; icon?: any; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5 pt-2">
        {Icon && <Icon className="w-4 h-4 text-primary shrink-0" />}
        <h2 className="text-base font-bold text-foreground">{title}</h2>
      </div>
      <div className="space-y-2 text-sm text-muted-foreground leading-relaxed pl-6">{children}</div>
    </div>
  );
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 pt-1">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="space-y-1.5 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </div>
  );
}

function TableRow({ label, data, purpose }: { label: string; data: string; purpose: string }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2.5 border-b border-border/50 text-xs last:border-0">
      <span className="font-medium text-foreground">{label}</span>
      <span className="text-muted-foreground">{data}</span>
      <span className="text-muted-foreground">{purpose}</span>
    </div>
  );
}

export function PrivacyPolicy() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => navigate(-1 as any)}
            className="p-2 rounded-xl hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <span className="font-bold text-sm">Privacy Policy</span>
          </div>
          <span className="ml-auto text-xs text-muted-foreground">Effective: {EFFECTIVE_DATE}</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 pb-24 space-y-8">
        {/* Hero */}
        <div className="text-center space-y-3 pb-4 border-b border-border">
          <OrahDEXInline className="text-2xl justify-center" />
          <h1 className="text-2xl font-black">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto leading-relaxed">
            {COMPANY} respects your privacy and is committed to protecting your personal data.
            This Privacy Policy explains how we collect, use, share, and protect your information when you use the {COMPANY} platform at <span className="text-primary font-mono">{DOMAIN}</span>.
          </p>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-400/10 border border-green-400/20 text-green-400 text-xs font-semibold">
            <Lock className="w-3.5 h-3.5" />
            Non-custodial — We never hold your private keys or control your funds.
          </div>
        </div>

        {/* 1. Who We Are */}
        <Section title="1. Data Controller" icon={Shield}>
          <p>
            {COMPANY} operates the decentralised exchange platform accessible at <span className="font-mono text-primary">{DOMAIN}</span>. For the purposes of applicable data protection legislation, {COMPANY} acts as the data controller for personal data collected through this Platform.
          </p>
          <p>
            Contact: <a href={`mailto:${CONTACT}`} className="text-primary hover:underline font-mono">{CONTACT}</a>
          </p>
        </Section>

        {/* 2. What We Collect */}
        <Section title="2. Information We Collect" icon={Database}>
          <p>
            Because {COMPANY} is a non-custodial DEX, we collect significantly less personal data than centralised exchanges. We never have access to your private keys, seed phrases, or custody of your funds.
          </p>

          <Sub title="2.1 Information You Provide">
            <ul className="list-disc list-inside space-y-1 ml-1">
              <li><span className="font-medium text-foreground">Wallet Addresses:</span> Your public blockchain address when you connect a wallet. This is public on-chain data and is not private by nature.</li>
              <li><span className="font-medium text-foreground">Email Address (optional):</span> If you sign up for notifications, newsletters, or support.</li>
              <li><span className="font-medium text-foreground">KYC/AML Documents (if required):</span> Government-issued ID, proof of address, selfie, if KYC is triggered by regulatory requirements or high-value transactions.</li>
              <li><span className="font-medium text-foreground">Support Communications:</span> Messages, emails, or tickets you send to our support team.</li>
            </ul>
          </Sub>

          <Sub title="2.2 Information Collected Automatically">
            <div className="bg-secondary/30 rounded-xl overflow-hidden border border-border">
              <div className="grid grid-cols-3 gap-3 px-3 py-2 border-b border-border bg-secondary/50">
                <span className="text-[10px] font-black uppercase tracking-wider text-foreground">Category</span>
                <span className="text-[10px] font-black uppercase tracking-wider text-foreground">Data</span>
                <span className="text-[10px] font-black uppercase tracking-wider text-foreground">Purpose</span>
              </div>
              <div className="px-3">
                <TableRow label="Device / Browser" data="Browser type, OS, screen size" purpose="Security, compatibility" />
                <TableRow label="IP Address" data="Anonymised after 24h" purpose="Fraud prevention, geo-restriction" />
                <TableRow label="Usage Data" data="Pages visited, clicks, session length" purpose="Analytics, UX improvement" />
                <TableRow label="Cookies" data="Session tokens, theme preference" purpose="Authentication, personalisation" />
                <TableRow label="Transaction Data" data="On-chain tx hashes (public)" purpose="Trade history display" />
              </div>
            </div>
          </Sub>

          <Sub title="2.3 Blockchain Data">
            <p>
              All transactions you execute through {COMPANY} are recorded on public blockchains (Bitcoin SV, Ethereum, and other EVM-compatible chains). This data is public, permanent, and outside {COMPANY}'s control. {COMPANY} does not share your blockchain address with third parties beyond what is inherently required to broadcast a transaction to the blockchain network.
            </p>
          </Sub>
        </Section>

        {/* 3. Legal Basis */}
        <Section title="3. Legal Basis for Processing (GDPR / UK GDPR)" icon={Scale}>
          <p>Where applicable data protection law applies, we process your personal data on the following legal bases:</p>
          <ul className="list-disc list-inside space-y-1.5 ml-1">
            <li><span className="font-medium text-foreground">Contract Performance:</span> Processing necessary to provide you with the trading services you have requested.</li>
            <li><span className="font-medium text-foreground">Legal Obligation:</span> AML/KYC compliance, sanctions screening, and regulatory reporting.</li>
            <li><span className="font-medium text-foreground">Legitimate Interests:</span> Security, fraud prevention, product improvement, and technical operations — where not overridden by your interests or rights.</li>
            <li><span className="font-medium text-foreground">Consent:</span> Marketing communications, optional analytics (where we ask for consent).</li>
          </ul>
        </Section>

        {/* 4. How We Use Data */}
        <Section title="4. How We Use Your Information" icon={Eye}>
          <ul className="list-disc list-inside space-y-1.5 ml-1">
            <li>To operate, maintain, and improve the Platform and its features.</li>
            <li>To verify identity and comply with AML/KYC obligations where required by law.</li>
            <li>To screen against international sanctions lists.</li>
            <li>To detect, prevent, and investigate fraud, market manipulation, or other prohibited conduct.</li>
            <li>To send transactional notifications (trade confirmations, liquidation alerts, security alerts).</li>
            <li>To respond to support queries and legal requests.</li>
            <li>To analyse usage patterns and improve the user experience (using anonymised data where possible).</li>
            <li>To enforce our Terms of Service.</li>
          </ul>
          <p className="pt-1">
            We do not sell, rent, or trade your personal data to third parties for their marketing purposes.
          </p>
        </Section>

        {/* 5. Sharing */}
        <Section title="5. Data Sharing and Third Parties" icon={Globe}>
          <p>We may share your information in the following circumstances:</p>
          <Sub title="5.1 Service Providers">
            <p>We engage trusted third-party service providers to support the Platform's operation, including cloud hosting, analytics, KYC/AML verification, and customer support. These providers are contractually bound to process data only on our instructions and in compliance with applicable law.</p>
          </Sub>
          <Sub title="5.2 Fiat On-Ramp Partners">
            <p>If you use fiat on-ramp features (MoonPay, Transak, Banxa, Simplex, Ramp Network), you will be redirected to those providers' platforms. Your use of those services is subject to their respective privacy policies. {COMPANY} does not receive or store the card details or banking information you provide to these partners.</p>
          </Sub>
          <Sub title="5.3 Legal and Regulatory Disclosure">
            <p>We may disclose your information where required by law, court order, regulatory body, or government authority, including for AML/CTF compliance, law enforcement requests, or to protect the rights, property, or safety of {COMPANY} or its users.</p>
          </Sub>
          <Sub title="5.4 Business Transfers">
            <p>In the event of a merger, acquisition, or sale of all or part of {COMPANY}'s business, your data may be transferred to the acquiring entity, subject to equivalent privacy protections.</p>
          </Sub>
        </Section>

        {/* 6. Cookies */}
        <Section title="6. Cookies and Tracking Technologies">
          <p>
            {COMPANY} uses cookies and similar technologies to operate the Platform. These include:
          </p>
          <ul className="list-disc list-inside space-y-1.5 ml-1">
            <li><span className="font-medium text-foreground">Essential Cookies:</span> Required for authentication, security, and basic functionality. Cannot be disabled without breaking the Platform.</li>
            <li><span className="font-medium text-foreground">Preference Cookies:</span> Store your theme, language, and trading settings locally in your browser.</li>
            <li><span className="font-medium text-foreground">Analytics Cookies:</span> Used (where consent is given) to understand how users interact with the Platform via tools such as Google Analytics.</li>
          </ul>
          <p>You can manage cookies through your browser settings. Disabling certain cookies may affect Platform functionality.</p>
        </Section>

        {/* 7. Data Retention */}
        <Section title="7. Data Retention" icon={Trash2}>
          <p>
            We retain personal data for as long as necessary to fulfil the purposes for which it was collected, including for legal, accounting, and regulatory obligations:
          </p>
          <ul className="list-disc list-inside space-y-1.5 ml-1">
            <li><span className="font-medium text-foreground">Account data:</span> Retained for the duration of your relationship with {COMPANY} plus 5 years for AML record-keeping obligations.</li>
            <li><span className="font-medium text-foreground">KYC/AML records:</span> Retained for a minimum of 5 years as required by applicable AML regulations.</li>
            <li><span className="font-medium text-foreground">Transaction logs:</span> Retained for 7 years for financial record-keeping.</li>
            <li><span className="font-medium text-foreground">Analytics data:</span> Anonymised after 26 months.</li>
            <li><span className="font-medium text-foreground">Support communications:</span> Retained for 3 years after the resolution of the matter.</li>
          </ul>
        </Section>

        {/* 8. Your Rights */}
        <Section title="8. Your Privacy Rights" icon={Lock}>
          <p>Depending on your jurisdiction, you may have the following rights regarding your personal data:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {[
              { right: "Right to Access", desc: "Request a copy of the personal data we hold about you." },
              { right: "Right to Rectification", desc: "Request correction of inaccurate or incomplete data." },
              { right: "Right to Erasure", desc: "Request deletion of your data (subject to legal obligations)." },
              { right: "Right to Restriction", desc: "Request we restrict processing of your data in certain circumstances." },
              { right: "Right to Portability", desc: "Receive your data in a structured, machine-readable format." },
              { right: "Right to Object", desc: "Object to processing based on legitimate interests or for direct marketing." },
              { right: "Withdraw Consent", desc: "Withdraw consent at any time where processing is consent-based." },
              { right: "Lodge a Complaint", desc: "Complain to your local data protection authority." },
            ].map(({ right, desc }) => (
              <div key={right} className="p-3 bg-secondary/40 rounded-xl border border-border">
                <p className="text-xs font-semibold text-foreground mb-0.5">{right}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
          <p className="pt-1">
            To exercise any of these rights, contact us at <a href={`mailto:${CONTACT}`} className="text-primary hover:underline font-mono">{CONTACT}</a>. We will respond within 30 days.
          </p>
        </Section>

        {/* 9. Security */}
        <Section title="9. Security" icon={Shield}>
          <p>
            We implement industry-standard technical and organisational security measures to protect your personal data against unauthorised access, alteration, disclosure, or destruction. These include:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-1">
            <li>TLS/SSL encryption for all data in transit.</li>
            <li>Encryption at rest for sensitive data stored in our databases.</li>
            <li>Two-factor authentication for admin access to systems containing personal data.</li>
            <li>Regular security audits and penetration testing.</li>
            <li>Strict access controls — data is accessible only to personnel who need it.</li>
          </ul>
          <p>
            However, no Internet transmission or electronic storage method is 100% secure. We cannot guarantee absolute security of your data. In the event of a data breach affecting your rights, we will notify you as required by applicable law.
          </p>
        </Section>

        {/* 10. International Transfers */}
        <Section title="10. International Data Transfers" icon={Globe}>
          <p>
            {COMPANY} may transfer your personal data to countries outside your country of residence, including countries that may not provide the same level of data protection as your home jurisdiction. Where we transfer data internationally, we implement appropriate safeguards such as Standard Contractual Clauses (SCCs) approved by the European Commission, or rely on other lawful transfer mechanisms.
          </p>
        </Section>

        {/* 11. Children */}
        <Section title="11. Children's Privacy">
          <p>
            The Platform is not directed to persons under 18 years of age. We do not knowingly collect personal data from children. If you believe we have inadvertently collected data about a minor, please contact us immediately at <a href={`mailto:${CONTACT}`} className="text-primary hover:underline font-mono">{CONTACT}</a> and we will delete it promptly.
          </p>
        </Section>

        {/* 12. Changes */}
        <Section title="12. Changes to This Policy" icon={RefreshCw}>
          <p>
            We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or other factors. We will post the updated policy on this page with a new effective date. For significant changes, we will provide prominent notice on the Platform. Your continued use of the Platform after the effective date constitutes your acceptance of the updated policy.
          </p>
        </Section>

        {/* Contact */}
        <div className="mt-8 p-5 bg-card border border-border rounded-2xl space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <Mail className="w-4 h-4 text-primary" />
            <p className="font-semibold text-sm">Contact & Data Requests</p>
          </div>
          <p className="text-sm text-muted-foreground">
            For all privacy-related queries, data subject requests, or to report a privacy concern, contact our Data Protection Officer at{" "}
            <a href={`mailto:${CONTACT}`} className="text-primary hover:underline font-mono">{CONTACT}</a>.
          </p>
          <p className="text-xs text-muted-foreground/70 pt-1">
            Last updated: {EFFECTIVE_DATE} · Version 1.0 · Compliant with GDPR, UK GDPR, and CCPA where applicable.
          </p>
        </div>
      </div>
    </div>
  );
}

function Scale(props: any) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 3v18M3 9l9-6 9 6M3 15l9 6 9-6"/></svg>;
}

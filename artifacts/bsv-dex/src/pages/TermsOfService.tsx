import { ArrowLeft, FileText, AlertTriangle, Shield, Scale, Globe, Ban, RefreshCw } from "lucide-react";
import { useLocation } from "wouter";
import { OrahInline } from "@/components/BrandLogo";

const EFFECTIVE_DATE = "25 March 2026";
const COMPANY = "OrahDEX";
const DOMAIN = "orahdex.org";
const CONTACT = "legal@orahdex.org";

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

export function TermsOfService() {
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
            <FileText className="w-4 h-4 text-primary" />
            <span className="font-bold text-sm">Terms of Service</span>
          </div>
          <span className="ml-auto text-xs text-muted-foreground">Effective: {EFFECTIVE_DATE}</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 pb-24 space-y-8">
        {/* Hero */}
        <div className="text-center space-y-3 pb-4 border-b border-border">
          <OrahInline className="text-2xl justify-center" />
          <h1 className="text-2xl font-black">Terms of Service</h1>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto leading-relaxed">
            These Terms of Service govern your access to and use of the {COMPANY} decentralised exchange platform at <span className="text-primary font-mono">{DOMAIN}</span>.
            By using {COMPANY}, you agree to be bound by these Terms.
          </p>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-400/10 border border-amber-400/20 text-amber-400 text-xs font-semibold">
            <AlertTriangle className="w-3.5 h-3.5" />
            Please read carefully before using the platform. Trading cryptocurrency involves significant risk.
          </div>
        </div>

        {/* 1. Acceptance */}
        <Section title="1. Acceptance of Terms" icon={Scale}>
          <p>
            By accessing or using {COMPANY} (the "Platform"), you confirm that you are at least 18 years of age (or the age of majority in your jurisdiction), have full legal capacity to enter into these Terms, and have read, understood, and agreed to be bound by them and all applicable laws.
          </p>
          <p>
            If you do not agree to these Terms, you must immediately cease all use of the Platform. {COMPANY} reserves the right to modify these Terms at any time. Continued use of the Platform after any modification constitutes your acceptance of the updated Terms.
          </p>
        </Section>

        {/* 2. Nature of the Platform */}
        <Section title="2. Nature of the Platform" icon={Globe}>
          <p>
            {COMPANY} is a non-custodial, decentralised exchange (DEX) protocol. This means:
          </p>
          <ul className="list-disc list-inside space-y-1.5 ml-1">
            <li>{COMPANY} does not hold, control, or take custody of your digital assets at any time.</li>
            <li>All trades are executed on-chain via smart contracts or Bitcoin SV (BSV) HTLC settlement scripts.</li>
            <li>You retain sole control of your private keys and wallet. {COMPANY} cannot recover lost keys, reverse transactions, or freeze funds.</li>
            <li>The Platform facilitates peer-to-peer trading between users; {COMPANY} is not a counterparty to any trade.</li>
            <li>Cross-chain settlements use Hash Time-Locked Contracts (HTLCs). Once submitted to the blockchain, transactions are irreversible.</li>
          </ul>
        </Section>

        {/* 3. Eligibility */}
        <Section title="3. Eligibility and Prohibited Persons" icon={Ban}>
          <Sub title="3.1 Age and Legal Capacity">
            <p>You must be at least 18 years old and legally capable of entering binding contracts in your jurisdiction.</p>
          </Sub>
          <Sub title="3.2 Prohibited Jurisdictions">
            <p>
              You may not use {COMPANY} if you are located in, a citizen of, or resident of any jurisdiction where cryptocurrency trading, DEX use, or the services offered by {COMPANY} are prohibited, restricted, or require licensing not held by {COMPANY}. This includes, but is not limited to, the United States of America (US persons), Iran, North Korea, Cuba, Syria, and any territory subject to comprehensive sanctions by the UN, EU, UK, or US OFAC.
            </p>
            <p>
              By using the Platform you represent and warrant that you are not a Prohibited Person. {COMPANY} may implement geo-blocking and other technical measures to enforce these restrictions but makes no guarantee of their completeness.
            </p>
          </Sub>
          <Sub title="3.3 Sanctioned Persons">
            <p>You may not use the Platform if you are listed on any government sanctions list, including OFAC SDN, EU Consolidated Financial Sanctions List, or HM Treasury Consolidated List.</p>
          </Sub>
        </Section>

        {/* 4. Cryptocurrency Risk */}
        <Section title="4. Risk Disclosures and Cryptocurrency Warning" icon={AlertTriangle}>
          <p className="font-semibold text-foreground">
            TRADING CRYPTOCURRENCY CARRIES EXTREME RISK. YOU MAY LOSE ALL OF YOUR INVESTED CAPITAL.
          </p>
          <ul className="list-disc list-inside space-y-1.5 ml-1">
            <li><span className="font-medium text-foreground">Market Risk:</span> Cryptocurrency prices are highly volatile and can move sharply in short timeframes due to market conditions, regulatory announcements, technology failures, or speculative activity.</li>
            <li><span className="font-medium text-foreground">Leverage Risk:</span> Futures and margin trading amplify both gains and losses. You may lose more than your initial deposit and be subject to liquidation.</li>
            <li><span className="font-medium text-foreground">Smart Contract Risk:</span> Bugs or exploits in smart contracts may result in loss of funds. {COMPANY}'s contracts have been developed with care but are not guaranteed to be free from vulnerabilities.</li>
            <li><span className="font-medium text-foreground">Liquidity Risk:</span> Thin order books may result in significant slippage. AMM pools are subject to impermanent loss.</li>
            <li><span className="font-medium text-foreground">Regulatory Risk:</span> Cryptocurrency regulation is rapidly evolving. Changes in laws may adversely affect the value of your assets or your ability to use the Platform.</li>
            <li><span className="font-medium text-foreground">Technology Risk:</span> Network outages, protocol upgrades, or 51% attacks on underlying blockchains may disrupt trading.</li>
            <li><span className="font-medium text-foreground">Key Loss Risk:</span> Loss of your private key means permanent, irreversible loss of your funds. {COMPANY} cannot assist in key recovery.</li>
          </ul>
          <p>
            Nothing on the Platform constitutes financial, investment, legal, or tax advice. You should consult qualified professionals before making any investment decisions. Past performance of any cryptocurrency or trading pair is not indicative of future results.
          </p>
        </Section>

        {/* 5. User Obligations */}
        <Section title="5. User Obligations and Prohibited Conduct" icon={Shield}>
          <Sub title="5.1 Lawful Use">
            <p>You agree to use the Platform solely for lawful purposes and in compliance with all applicable laws, including but not limited to anti-money laundering (AML), counter-terrorism financing (CTF), tax, and securities laws in your jurisdiction.</p>
          </Sub>
          <Sub title="5.2 Prohibited Activities">
            <p>You must not:</p>
            <ul className="list-disc list-inside space-y-1 ml-1">
              <li>Use the Platform to launder money, finance terrorism, or engage in any activity prohibited under AML/CTF laws.</li>
              <li>Manipulate markets, including wash trading, spoofing, layering, or front-running.</li>
              <li>Attempt to reverse-engineer, hack, or exploit the Platform, smart contracts, or API.</li>
              <li>Use bots, scrapers, or automated tools without explicit written permission from {COMPANY}.</li>
              <li>Circumvent access restrictions, including geo-blocking, using VPNs or proxies.</li>
              <li>Create multiple accounts to circumvent usage limits or sanctions checks.</li>
              <li>Impersonate {COMPANY} or any other person or entity.</li>
              <li>Use the Platform to trade assets that are securities without appropriate licensing.</li>
            </ul>
          </Sub>
          <Sub title="5.3 Know Your Customer (KYC) / Anti-Money Laundering (AML)">
            <p>
              While {COMPANY} is a non-custodial protocol, {COMPANY} reserves the right to implement KYC/AML procedures at any time for any user or transaction as required by applicable law. Users who do not complete required verification may have access to certain features suspended.
            </p>
          </Sub>
        </Section>

        {/* 6. Fees */}
        <Section title="6. Fees and Charges">
          <p>
            {COMPANY} charges trading fees as displayed in the Platform interface at the time of trading. Fees are deducted automatically from the relevant transaction. {COMPANY} reserves the right to change its fee schedule at any time with reasonable notice posted on the Platform.
          </p>
          <p>
            In addition to Platform fees, you are responsible for all network fees (gas fees, miner fees, BSV transaction fees) required to execute transactions on-chain. These fees are set by the underlying blockchain networks and are not controlled by {COMPANY}.
          </p>
          <p>All fees are non-refundable once a transaction is submitted to the blockchain.</p>
        </Section>

        {/* 7. Intellectual Property */}
        <Section title="7. Intellectual Property">
          <p>
            All intellectual property rights in the Platform, including but not limited to software, design, trademarks, logos, and content, are owned by or licensed to {COMPANY}. You are granted a limited, non-exclusive, non-transferable, revocable licence to access and use the Platform solely for your personal, non-commercial use.
          </p>
          <p>You may not reproduce, distribute, modify, create derivative works of, or exploit any Platform content without express written permission from {COMPANY}.</p>
        </Section>

        {/* 8. Limitation of Liability */}
        <Section title="8. Disclaimers and Limitation of Liability">
          <p className="font-semibold text-foreground">
            THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED.
          </p>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, {COMPANY.toUpperCase()} AND ITS AFFILIATES, DIRECTORS, EMPLOYEES, AND SERVICE PROVIDERS SHALL NOT BE LIABLE FOR ANY:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-1">
            <li>Direct, indirect, incidental, special, consequential, or exemplary damages.</li>
            <li>Loss of cryptocurrency, digital assets, profits, data, or goodwill.</li>
            <li>Losses arising from smart contract bugs, blockchain network failures, or third-party hacks.</li>
            <li>Losses from your reliance on any information, content, or data on the Platform.</li>
          </ul>
          <p>
            Where liability cannot be excluded by law, {COMPANY}'s total liability to you shall not exceed USD $100 or the equivalent in any digital asset.
          </p>
        </Section>

        {/* 9. Indemnification */}
        <Section title="9. Indemnification">
          <p>
            You agree to indemnify, defend, and hold harmless {COMPANY} and its officers, directors, employees, contractors, and agents from and against any claims, damages, obligations, losses, liabilities, costs, or debt arising from: (a) your use of the Platform; (b) your violation of these Terms; (c) your violation of any law or the rights of a third party; or (d) your digital assets or trading activity.
          </p>
        </Section>

        {/* 10. Termination */}
        <Section title="10. Termination and Suspension">
          <p>
            {COMPANY} reserves the right to suspend or terminate your access to the Platform at any time, with or without notice, for any reason including but not limited to violation of these Terms, suspicious activity, regulatory requirement, or technical necessity.
          </p>
          <p>
            Because {COMPANY} is a non-custodial protocol, suspension of your Platform account does not affect your on-chain assets. Smart contracts deployed on public blockchains remain accessible through other interfaces.
          </p>
        </Section>

        {/* 11. Governing Law */}
        <Section title="11. Governing Law and Dispute Resolution" icon={Scale}>
          <p>
            These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which {COMPANY} is incorporated, without regard to conflict of laws principles.
          </p>
          <p>
            Any dispute arising out of or in connection with these Terms shall first be subject to good-faith negotiation for a period of 30 days. If unresolved, disputes shall be submitted to binding arbitration under the rules of an internationally recognised arbitration body as determined by {COMPANY}.
          </p>
          <p>
            You waive any right to a class action lawsuit or class-wide arbitration against {COMPANY}.
          </p>
        </Section>

        {/* 12. General */}
        <Section title="12. General Provisions" icon={RefreshCw}>
          <p><span className="font-medium text-foreground">Entire Agreement:</span> These Terms, together with the Privacy Policy and any additional terms for specific features, constitute the entire agreement between you and {COMPANY} regarding the Platform.</p>
          <p><span className="font-medium text-foreground">Severability:</span> If any provision of these Terms is held invalid or unenforceable, the remaining provisions shall remain in full force and effect.</p>
          <p><span className="font-medium text-foreground">No Waiver:</span> Failure by {COMPANY} to enforce any right or provision of these Terms shall not constitute a waiver of such right or provision.</p>
          <p><span className="font-medium text-foreground">Assignment:</span> You may not assign or transfer your rights under these Terms without {COMPANY}'s written consent. {COMPANY} may freely assign these Terms.</p>
          <p><span className="font-medium text-foreground">Updates:</span> {COMPANY} will post updates to these Terms on the Platform. It is your responsibility to review these Terms periodically. Your continued use of the Platform following any update constitutes acceptance of the updated Terms.</p>
        </Section>

        {/* Contact */}
        <div className="mt-8 p-5 bg-card border border-border rounded-2xl space-y-2">
          <p className="font-semibold text-sm">Contact</p>
          <p className="text-sm text-muted-foreground">
            For questions about these Terms of Service, please contact us at{" "}
            <a href={`mailto:${CONTACT}`} className="text-primary hover:underline font-mono">{CONTACT}</a>
            {" "}or visit <span className="font-mono text-primary">{DOMAIN}</span>.
          </p>
          <p className="text-xs text-muted-foreground/70">
            Last updated: {EFFECTIVE_DATE} · Version 1.0
          </p>
        </div>
      </div>
    </div>
  );
}

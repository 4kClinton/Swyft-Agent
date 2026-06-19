import type { Metadata } from "next"
import { LegalPage, LegalSection } from "@/components/legal-page"

export const metadata: Metadata = {
  title: "Privacy Policy · Swyft",
  description: "How Swyft collects, uses, and protects your personal data.",
}

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="19 June 2026">
      <p className="text-[15px] leading-relaxed text-[#3A4742]">
        This Privacy Policy explains how Swyft (&ldquo;Swyft&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;)
        collects, uses, shares, and protects your personal data when you use our platform and services
        (the &ldquo;Service&rdquo;). We process personal data in accordance with the Kenya Data
        Protection Act, 2019.
      </p>

      <LegalSection heading="1. Data we collect">
        <p>We collect the following categories of data:</p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            <span className="font-medium text-[#0A1F17]">Account data</span> — your name, email, phone
            number, role (landlord or property manager), and company details.
          </li>
          <li>
            <span className="font-medium text-[#0A1F17]">Property &amp; listing data</span> — building
            and unit information, prices, photos, and videos you provide.
          </li>
          <li>
            <span className="font-medium text-[#0A1F17]">Payment notification data</span> — read-only
            payment details (payer name, phone, amount, reference) used to reconcile rent. Swyft does
            not hold or move funds.
          </li>
          <li>
            <span className="font-medium text-[#0A1F17]">Usage &amp; device data</span> — log data,
            device and browser information, and how you interact with the Service.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="2. How we use your data">
        <p>We use personal data to:</p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>Create and manage your account and provide the Service;</li>
          <li>Match payments to tenants, generate receipts, and track arrears;</li>
          <li>Connect verified renters with relevant listings;</li>
          <li>Send service-related notifications and respond to your requests;</li>
          <li>Improve, secure, and troubleshoot the Service;</li>
          <li>Comply with legal and regulatory obligations.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. Legal basis for processing">
        <p>
          We process your data on the basis of your consent, the performance of our contract with you,
          our legitimate interests in operating and improving the Service, and compliance with legal
          obligations.
        </p>
      </LegalSection>

      <LegalSection heading="4. How we share data">
        <p>We do not sell your personal data. We may share it with:</p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            Service providers who help us operate the Service (e.g. hosting, communications, and
            payment-notification infrastructure), under appropriate confidentiality obligations;
          </li>
          <li>
            Banks and mobile money providers, only as needed to read the payment notifications you
            authorise;
          </li>
          <li>
            Authorities or other parties where required by law or to protect our rights and the safety
            of users.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="5. Data retention">
        <p>
          We retain personal data for as long as your account is active and as needed to provide the
          Service, comply with legal obligations, resolve disputes, and enforce our agreements. When
          data is no longer needed, we delete or anonymise it.
        </p>
      </LegalSection>

      <LegalSection heading="6. Data security">
        <p>
          We use reasonable technical and organisational measures to protect personal data against
          unauthorised access, loss, or misuse. No method of transmission or storage is completely
          secure, so we cannot guarantee absolute security.
        </p>
      </LegalSection>

      <LegalSection heading="7. Your rights">
        <p>Subject to applicable law, you have the right to:</p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>Access the personal data we hold about you;</li>
          <li>Request correction of inaccurate or incomplete data;</li>
          <li>Request deletion of your data;</li>
          <li>Object to or restrict certain processing;</li>
          <li>Withdraw consent where processing is based on consent.</li>
        </ul>
        <p>
          To exercise any of these rights, contact us using the details below. You also have the right
          to lodge a complaint with the Office of the Data Protection Commissioner of Kenya.
        </p>
      </LegalSection>

      <LegalSection heading="8. Children's privacy">
        <p>
          The Service is not directed to children under 18, and we do not knowingly collect personal
          data from them.
        </p>
      </LegalSection>

      <LegalSection heading="9. Changes to this policy">
        <p>
          We may update this Privacy Policy from time to time. If we make material changes, we will
          take reasonable steps to notify you. The &ldquo;Last updated&rdquo; date above reflects the
          latest version.
        </p>
      </LegalSection>

      <LegalSection heading="10. Contact us">
        <p>
          For privacy questions or requests, email us at{" "}
          <a href="mailto:support@swyft.africa" className="font-medium text-emerald-700 hover:underline">
            support@swyft.africa
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  )
}

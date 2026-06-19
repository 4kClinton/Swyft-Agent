import type { Metadata } from "next"
import { LegalPage, LegalSection } from "@/components/legal-page"

export const metadata: Metadata = {
  title: "Terms & Conditions · Swyft",
  description: "The terms and conditions governing your use of Swyft.",
}

export default function TermsPage() {
  return (
    <LegalPage title="Terms & Conditions" lastUpdated="19 June 2026">
      <p className="text-[15px] leading-relaxed text-[#3A4742]">
        These Terms &amp; Conditions (&ldquo;Terms&rdquo;) govern your access to and use of the Swyft
        platform, websites, and services (collectively, the &ldquo;Service&rdquo;) operated by Swyft
        (&ldquo;Swyft&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an account or using the
        Service, you agree to be bound by these Terms. If you do not agree, do not use the Service.
      </p>

      <LegalSection heading="1. Who can use Swyft">
        <p>
          You must be at least 18 years old and capable of forming a binding contract under the laws of
          Kenya. If you use the Service on behalf of a company or other entity, you represent that you
          are authorised to bind that entity to these Terms.
        </p>
      </LegalSection>

      <LegalSection heading="2. Your account">
        <p>When you create an account you agree to:</p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>Provide accurate, current, and complete information;</li>
          <li>Keep your login credentials confidential and secure;</li>
          <li>Be responsible for all activity that occurs under your account;</li>
          <li>Notify us promptly of any unauthorised use of your account.</li>
        </ul>
        <p>
          We may suspend or terminate accounts that contain false information or are used in breach of
          these Terms.
        </p>
      </LegalSection>

      <LegalSection heading="3. Listings and content">
        <p>
          Landlords and property managers are solely responsible for the accuracy and legality of the
          listings, photos, videos, prices, and other content they publish. You agree not to post
          content that is fraudulent, misleading, infringing, or that you do not have the right to
          share. You grant Swyft a non-exclusive licence to host and display your content for the
          purpose of operating the Service.
        </p>
      </LegalSection>

      <LegalSection heading="4. Acceptable use">
        <p>You agree not to:</p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>Use the Service for any unlawful, fraudulent, or harmful purpose;</li>
          <li>Misrepresent property, fees, or your identity;</li>
          <li>Harass, defraud, or harm other users;</li>
          <li>Attempt to gain unauthorised access to the Service or interfere with its operation;</li>
          <li>Violate applicable real estate, consumer protection, or data protection laws.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="5. Payments and rent reconciliation">
        <p>
          Swyft does not hold, receive, or move your money. Tenants continue to pay into your existing
          paybill, till, or bank account exactly as before. Where you connect a bank or payment rail,
          Swyft accesses payment notifications on a read-only basis solely to match payments, generate
          receipts, and track arrears on your behalf.
        </p>
        <p>
          Certain features (such as listing boosts or rent management tooling) are paid services. Fees,
          where applicable, are presented before you purchase and are payable in Kenyan Shillings.
          Except where required by law, fees are non-refundable.
        </p>
      </LegalSection>

      <LegalSection heading="6. Third-party services">
        <p>
          The Service relies on third parties such as banks, mobile money providers, and infrastructure
          providers. We are not responsible for the availability, accuracy, or actions of these third
          parties, and your use of them may be subject to their own terms.
        </p>
      </LegalSection>

      <LegalSection heading="7. Disclaimers">
        <p>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties
          of any kind, whether express or implied. We do not warrant that the Service will be
          uninterrupted, error-free, or that any reconciliation or report will be free of inaccuracies.
          Swyft is not a party to any rental agreement between landlords and tenants.
        </p>
      </LegalSection>

      <LegalSection heading="8. Limitation of liability">
        <p>
          To the maximum extent permitted by law, Swyft shall not be liable for any indirect,
          incidental, special, consequential, or punitive damages, or for any loss of profits, revenue,
          data, or goodwill arising from your use of the Service.
        </p>
      </LegalSection>

      <LegalSection heading="9. Termination">
        <p>
          You may stop using the Service at any time. We may suspend or terminate your access if you
          breach these Terms or where we are required to do so by law. Provisions that by their nature
          should survive termination will survive.
        </p>
      </LegalSection>

      <LegalSection heading="10. Changes to these Terms">
        <p>
          We may update these Terms from time to time. If we make material changes, we will take
          reasonable steps to notify you. Your continued use of the Service after changes take effect
          constitutes acceptance of the updated Terms.
        </p>
      </LegalSection>

      <LegalSection heading="11. Governing law">
        <p>
          These Terms are governed by the laws of the Republic of Kenya, and the courts of Kenya shall
          have exclusive jurisdiction over any dispute arising from them.
        </p>
      </LegalSection>

      <LegalSection heading="12. Contact us">
        <p>
          Questions about these Terms? Email us at{" "}
          <a href="mailto:contact@swyft.africa" className="font-medium text-emerald-700 hover:underline">
            contact@swyft.africa
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  )
}

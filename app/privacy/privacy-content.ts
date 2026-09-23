/**
 * Privacy policy content for the public /privacy page.
 *
 * Text is kept as structured data so the page can render it consistently.
 * Replace PRIVACY_CONTACT_EMAIL with the real privacy/contact address.
 */

export const PRIVACY_EFFECTIVE_DATE = `23 September 2026`;
export const PRIVACY_LAST_UPDATED = `23 September 2026`;
export const PRIVACY_CONTACT_EMAIL = `nblphoneography@gmail.com`;
export const PRIVACY_SERVICE_NAME = `KeralaI`;

export type PrivacyBlock =
  | { kind: `p`; text: string }
  | { kind: `list`; items: string[] }
  | { kind: `sub`; title: string; blocks: PrivacyBlock[] };

export interface PrivacySection {
  id: string;
  title: string;
  blocks: PrivacyBlock[];
}

export const PRIVACY_INTRO: string[] = [
  `KeralaI ("KeralaI", "we", "us", or "our") provides AI-powered business communication, receptionist, automation, and integration services, including AI voice receptionists, WhatsApp automation, AI agents, customer communication tools, appointment management, CRM integrations, and related software services.`,
  `This Privacy Policy explains how we collect, use, disclose, store, and protect information when you use our website, applications, AI receptionist services, WhatsApp automation services, APIs, integrations, or other services provided by KeralaI (collectively, the "Services").`,
  `By using the Services, you acknowledge the practices described in this Privacy Policy.`,
];

export const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    id: `information-we-collect`,
    title: `1. Information We Collect`,
    blocks: [
      { kind: `p`, text: `Depending on how the Services are used, we may collect the following categories of information.` },
      {
        kind: `sub`,
        title: `1.1 Account and Business Information`,
        blocks: [
          { kind: `p`, text: `When a business or administrator creates or configures a KeralaI account, we may collect:` },
          {
            kind: `list`,
            items: [
              `Name`,
              `Business or company name`,
              `Email address`,
              `Telephone number`,
              `Business address`,
              `Business website`,
              `Industry and business description`,
              `Account credentials and authentication information`,
              `Service configuration and preferences`,
              `Appointment and business operating information`,
              `CRM and integration configuration`,
              `Other information voluntarily provided by the account administrator`,
            ],
          },
        ],
      },
      {
        kind: `sub`,
        title: `1.2 Customer and Contact Information`,
        blocks: [
          {
            kind: `p`,
            text: `When our customers use KeralaI to communicate with their customers, we may process information provided through those communications, including:`,
          },
          {
            kind: `list`,
            items: [
              `Customer name`,
              `Telephone number`,
              `WhatsApp number`,
              `Email address`,
              `Contact information`,
              `Appointment details`,
              `Customer inquiries`,
              `Messages and conversation content`,
              `Information voluntarily provided by the customer`,
            ],
          },
          {
            kind: `p`,
            text: `The business using KeralaI is generally responsible for determining what customer information is collected and how it is used through its configuration of the Services.`,
          },
        ],
      },
      {
        kind: `sub`,
        title: `1.3 WhatsApp Information`,
        blocks: [
          {
            kind: `p`,
            text: `When a business connects a WhatsApp Business account or WhatsApp Business Platform account to KeralaI, we may process information transmitted through the WhatsApp integration.`,
          },
          { kind: `p`, text: `This may include:` },
          {
            kind: `list`,
            items: [
              `WhatsApp account and business information`,
              `Phone numbers`,
              `WhatsApp user identifiers`,
              `Message content`,
              `Message timestamps`,
              `Message metadata`,
              `Images, documents, audio, video, and other media sent through WhatsApp`,
              `Delivery, read, and message status information`,
              `Customer interactions and conversation history`,
              `Information required to execute automated workflows or AI-agent actions`,
            ],
          },
          {
            kind: `p`,
            text: `WhatsApp communications are transmitted through Meta's WhatsApp services and may also be subject to Meta's applicable terms, policies, and privacy practices.`,
          },
          { kind: `p`, text: `KeralaI does not sell WhatsApp user data.` },
        ],
      },
      {
        kind: `sub`,
        title: `1.4 Voice and AI Receptionist Information`,
        blocks: [
          { kind: `p`, text: `When a person interacts with a KeralaI AI receptionist, we may process:` },
          {
            kind: `list`,
            items: [
              `Telephone number`,
              `Caller identification information`,
              `Voice/audio transmitted during the call`,
              `Speech-to-text transcriptions`,
              `AI-generated responses`,
              `Conversation history`,
              `Appointment information`,
              `Information voluntarily provided during the call`,
              `Call timestamps and technical metadata`,
              `Call duration and call outcome`,
              `Information necessary to provide requested services`,
            ],
          },
          {
            kind: `p`,
            text: `Voice and conversational information may be processed by third-party AI, telecommunications, and infrastructure providers necessary to operate the Service.`,
          },
        ],
      },
      {
        kind: `sub`,
        title: `1.5 Appointment Information`,
        blocks: [
          { kind: `p`, text: `If an appointment is requested through KeralaI, we may process:` },
          {
            kind: `list`,
            items: [
              `Name`,
              `Telephone number`,
              `Appointment date`,
              `Appointment time`,
              `Reason or purpose of the appointment`,
              `Appointment status`,
              `Related conversation information`,
            ],
          },
          {
            kind: `p`,
            text: `This information may be transmitted to the business's database, CRM, calendar, scheduling system, or other configured integration.`,
          },
        ],
      },
      {
        kind: `sub`,
        title: `1.6 Technical and Usage Information`,
        blocks: [
          { kind: `p`, text: `We may automatically collect limited technical information such as:` },
          {
            kind: `list`,
            items: [
              `IP address`,
              `Browser type`,
              `Device information`,
              `Operating system`,
              `Approximate geographic information derived from technical data`,
              `Access times`,
              `Pages or services accessed`,
              `Error logs`,
              `API request information`,
              `Security and authentication logs`,
            ],
          },
          {
            kind: `p`,
            text: `We use this information primarily for security, debugging, reliability, analytics, and service operation.`,
          },
        ],
      },
    ],
  },
  {
    id: `how-we-use-information`,
    title: `2. How We Use Information`,
    blocks: [
      { kind: `p`, text: `We may use information we process to:` },
      {
        kind: `list`,
        items: [
          `Provide and operate the KeralaI Services`,
          `Provide AI receptionist and AI-agent functionality`,
          `Process voice conversations`,
          `Process WhatsApp communications`,
          `Send and receive messages through connected communication platforms`,
          `Respond to customer inquiries`,
          `Execute automated workflows`,
          `Schedule and manage appointments`,
          `Synchronize information with configured CRM systems`,
          `Connect with e-commerce, business, calendar, and other third-party services`,
          `Maintain conversation context where required to provide the requested service`,
          `Perform AI-powered processing and generate responses`,
          `Search business knowledge bases`,
          `Authenticate users and maintain accounts`,
          `Monitor and maintain service reliability`,
          `Detect, prevent, and investigate fraud, abuse, unauthorized access, and security incidents`,
          `Diagnose technical problems`,
          `Improve the reliability and performance of the Services`,
          `Comply with applicable laws and legal obligations`,
          `Protect our rights, users, customers, and systems`,
          `Communicate important service-related information`,
        ],
      },
      { kind: `p`, text: `We do not sell personal information to third parties.` },
    ],
  },
  {
    id: `ai-processing`,
    title: `3. AI Processing`,
    blocks: [
      { kind: `p`, text: `KeralaI provides artificial-intelligence-powered services.` },
      {
        kind: `p`,
        text: `Depending on the configuration of a particular Service, information may be processed by AI systems to:`,
      },
      {
        kind: `list`,
        items: [
          `Understand customer messages`,
          `Transcribe speech`,
          `Generate conversational responses`,
          `Answer questions using a business-provided knowledge base`,
          `Identify the purpose or intent of a conversation`,
          `Assist with appointment scheduling`,
          `Execute automated business workflows`,
          `Retrieve information from connected services`,
          `Assist customer-service representatives`,
          `Perform other actions explicitly configured by the business`,
        ],
      },
      {
        kind: `p`,
        text: `AI-generated responses may not always be accurate. Businesses using KeralaI are responsible for reviewing and configuring automated workflows appropriately for their use case.`,
      },
      {
        kind: `p`,
        text: `KeralaI does not represent that AI-generated information is always accurate, complete, or suitable for every purpose.`,
      },
    ],
  },
  {
    id: `third-party-service-providers`,
    title: `4. Third-Party Service Providers`,
    blocks: [
      {
        kind: `p`,
        text: `To provide the Services, KeralaI may use third-party infrastructure, communication, AI, database, hosting, analytics, security, CRM, and integration providers.`,
      },
      { kind: `p`, text: `Depending on the Service configuration, these providers may include:` },
      {
        kind: `list`,
        items: [
          `Meta and WhatsApp`,
          `Google and Google Gemini services`,
          `Exotel or other telecommunications providers`,
          `Cloud hosting providers`,
          `Database and storage providers`,
          `CRM platforms`,
          `Calendar and scheduling providers`,
          `E-commerce platforms`,
          `Authentication providers`,
          `Analytics and monitoring providers`,
          `Other third-party services selected or configured by a customer`,
        ],
      },
      {
        kind: `p`,
        text: `Information may be transmitted to these providers when necessary to perform a requested function.`,
      },
      {
        kind: `p`,
        text: `Third-party providers may process information according to their own terms and privacy policies.`,
      },
    ],
  },
  {
    id: `whatsapp-business-platform`,
    title: `5. WhatsApp Business Platform`,
    blocks: [
      { kind: `p`, text: `KeralaI may integrate with the WhatsApp Business Platform provided by Meta.` },
      { kind: `p`, text: `Businesses using this integration may use KeralaI to:` },
      {
        kind: `list`,
        items: [
          `Receive WhatsApp messages`,
          `Send permitted WhatsApp messages`,
          `Automate customer conversations`,
          `Deploy AI agents`,
          `Process customer inquiries`,
          `Send appointment confirmations and notifications`,
          `Connect WhatsApp conversations with CRM systems`,
          `Connect WhatsApp with e-commerce systems`,
          `Execute customer-configured workflows`,
        ],
      },
      {
        kind: `p`,
        text: `KeralaI processes WhatsApp information only to provide the requested functionality and services.`,
      },
      {
        kind: `p`,
        text: `Businesses are responsible for obtaining any consent, authorization, or other legal basis required for their use of WhatsApp communications and for complying with applicable WhatsApp, Meta, and local legal requirements.`,
      },
      {
        kind: `p`,
        text: `KeralaI does not use WhatsApp customer conversations to independently sell personal information.`,
      },
    ],
  },
  {
    id: `voice-and-telecommunications-services`,
    title: `6. Voice and Telecommunications Services`,
    blocks: [
      {
        kind: `p`,
        text: `KeralaI may use telecommunications providers and voice infrastructure to provide AI receptionist functionality.`,
      },
      { kind: `p`, text: `When a person calls a KeralaI-powered telephone number:` },
      {
        kind: `list`,
        items: [
          `The telecommunications provider may receive and transmit the call.`,
          `Audio may be streamed to KeralaI's infrastructure.`,
          `Audio may be processed by AI services for speech understanding and response generation.`,
          `The AI-generated response may be transmitted back through the telecommunications provider.`,
          `Depending on the configuration, conversation transcripts, call metadata, appointment information, and call outcomes may be stored.`,
        ],
      },
      {
        kind: `p`,
        text: `Where applicable, callers may be informed that they are interacting with an AI-powered receptionist.`,
      },
    ],
  },
  {
    id: `knowledge-bases-and-business-data`,
    title: `7. Knowledge Bases and Business Data`,
    blocks: [
      { kind: `p`, text: `Businesses may provide information to KeralaI for use in AI knowledge bases.` },
      { kind: `p`, text: `This may include:` },
      {
        kind: `list`,
        items: [
          `Business descriptions`,
          `Services`,
          `Products`,
          `Pricing information`,
          `FAQs`,
          `Policies`,
          `Operating hours`,
          `Locations`,
          `Contact information`,
          `Other business-provided documents or information`,
        ],
      },
      {
        kind: `p`,
        text: `Such information may be processed to retrieve relevant information and generate responses to customers.`,
      },
      {
        kind: `p`,
        text: `Businesses should not provide information to KeralaI that they are not authorized to process.`,
      },
    ],
  },
  {
    id: `crm-and-other-integrations`,
    title: `8. CRM and Other Integrations`,
    blocks: [
      { kind: `p`, text: `KeralaI may allow customers to connect third-party systems such as:` },
      {
        kind: `list`,
        items: [
          `CRM platforms`,
          `Calendar systems`,
          `E-commerce platforms`,
          `Customer databases`,
          `Business management systems`,
          `Communication platforms`,
          `Other APIs and services`,
        ],
      },
      {
        kind: `p`,
        text: `When an integration is enabled, information may be transmitted between KeralaI and that third-party service according to the configuration of the integration.`,
      },
      {
        kind: `p`,
        text: `The privacy practices of the third-party service are governed by that provider's own privacy policy and terms.`,
      },
      {
        kind: `p`,
        text: `Customers are responsible for reviewing and configuring integrations appropriately.`,
      },
    ],
  },
  {
    id: `legal-bases-for-processing`,
    title: `9. Legal Bases for Processing`,
    blocks: [
      {
        kind: `p`,
        text: `Where applicable law requires a legal basis for processing personal information, KeralaI may process information based on one or more of the following:`,
      },
      {
        kind: `list`,
        items: [
          `Performance of a contract or provision of requested services`,
          `Consent`,
          `Legitimate interests`,
          `Compliance with legal obligations`,
          `Protection of rights, safety, and security`,
          `Other lawful bases permitted by applicable law`,
        ],
      },
      {
        kind: `p`,
        text: `The applicable legal basis may depend on the nature of the information and the specific Service being used.`,
      },
    ],
  },
  {
    id: `data-retention`,
    title: `10. Data Retention`,
    blocks: [
      {
        kind: `p`,
        text: `We retain information only for as long as reasonably necessary for the purposes described in this Privacy Policy, including to:`,
      },
      {
        kind: `list`,
        items: [
          `Provide the Services`,
          `Maintain account and business records`,
          `Maintain requested conversation history`,
          `Complete transactions and appointments`,
          `Meet contractual requirements`,
          `Resolve disputes`,
          `Maintain security records`,
          `Comply with legal obligations`,
          `Enforce agreements`,
          `Prevent fraud and abuse`,
        ],
      },
      {
        kind: `p`,
        text: `Retention periods may vary depending on the type of information, the customer's configuration, and applicable legal requirements.`,
      },
      {
        kind: `p`,
        text: `Businesses using KeralaI may request deletion of information subject to applicable legal, security, and operational requirements.`,
      },
    ],
  },
  {
    id: `data-deletion`,
    title: `11. Data Deletion`,
    blocks: [
      {
        kind: `p`,
        text: `You may request deletion of personal information that KeralaI controls by contacting us using the contact information provided below.`,
      },
      {
        kind: `p`,
        text: `If the information is controlled by a business customer using KeralaI, you may also need to contact that business directly.`,
      },
      {
        kind: `p`,
        text: `Deletion requests may be subject to legal obligations, legitimate security requirements, dispute resolution requirements, or other lawful retention requirements.`,
      },
      {
        kind: `p`,
        text: `When information is deleted, it may remain temporarily in encrypted backups or disaster-recovery systems until those systems are securely overwritten or expire according to our retention procedures.`,
      },
    ],
  },
  {
    id: `data-security`,
    title: `12. Data Security`,
    blocks: [
      {
        kind: `p`,
        text: `We use reasonable technical and organizational measures designed to protect information against unauthorized access, alteration, disclosure, or destruction.`,
      },
      { kind: `p`, text: `Depending on the Service, these measures may include:` },
      {
        kind: `list`,
        items: [
          `Encrypted communications`,
          `Access controls`,
          `Authentication mechanisms`,
          `Restricted infrastructure access`,
          `Environment-based secret management`,
          `Database security controls`,
          `Logging and monitoring`,
          `Rate limiting`,
          `Security monitoring`,
          `Backup and recovery mechanisms`,
        ],
      },
      {
        kind: `p`,
        text: `However, no Internet transmission or electronic storage system can be guaranteed to be completely secure.`,
      },
    ],
  },
  {
    id: `international-data-transfers`,
    title: `13. International Data Transfers`,
    blocks: [
      {
        kind: `p`,
        text: `KeralaI may use service providers or infrastructure located outside the country where a customer or end user is located.`,
      },
      {
        kind: `p`,
        text: `As a result, information may be processed in countries other than the country in which it was originally collected.`,
      },
      {
        kind: `p`,
        text: `Where required by applicable law, KeralaI will use appropriate safeguards for international transfers.`,
      },
    ],
  },
  {
    id: `childrens-privacy`,
    title: `14. Children's Privacy`,
    blocks: [
      {
        kind: `p`,
        text: `The Services are intended for businesses and their customers and are not specifically directed toward children.`,
      },
      {
        kind: `p`,
        text: `We do not knowingly request or intentionally collect personal information from children in circumstances where such collection is prohibited by applicable law.`,
      },
      {
        kind: `p`,
        text: `If you believe that a child has provided personal information to us inappropriately, please contact us so that we can investigate and take appropriate action.`,
      },
    ],
  },
  {
    id: `cookies-and-similar-technologies`,
    title: `15. Cookies and Similar Technologies`,
    blocks: [
      { kind: `p`, text: `The KeralaI website may use cookies and similar technologies for purposes such as:` },
      {
        kind: `list`,
        items: [
          `Maintaining sessions`,
          `Authentication`,
          `Security`,
          `Remembering preferences`,
          `Understanding website usage`,
          `Improving website performance`,
        ],
      },
      { kind: `p`, text: `You may be able to control cookies through your browser settings.` },
      { kind: `p`, text: `Disabling certain cookies may affect website functionality.` },
    ],
  },
  {
    id: `data-controller-and-data-processor-roles`,
    title: `16. Data Controller and Data Processor Roles`,
    blocks: [
      {
        kind: `p`,
        text: `Depending on the Service and applicable law, KeralaI may act as a data controller, processor, service provider, or similar role.`,
      },
      {
        kind: `p`,
        text: `For information submitted by a business customer about its own customers, the business customer may determine the purposes and means of processing while KeralaI processes the information on the customer's behalf.`,
      },
      {
        kind: `p`,
        text: `The business customer is responsible for ensuring that its use of KeralaI complies with applicable privacy and data-protection laws and for providing appropriate notices to its customers where required.`,
      },
    ],
  },
  {
    id: `business-customer-responsibilities`,
    title: `17. Business Customer Responsibilities`,
    blocks: [
      { kind: `p`, text: `Businesses using KeralaI are responsible for:` },
      {
        kind: `list`,
        items: [
          `Providing appropriate privacy notices to their customers`,
          `Obtaining required consents or other lawful authorization`,
          `Configuring automated communications appropriately`,
          `Complying with applicable messaging and telecommunications laws`,
          `Complying with WhatsApp and Meta requirements`,
          `Ensuring that customer data submitted to KeralaI may lawfully be processed`,
          `Configuring CRM and third-party integrations appropriately`,
          `Reviewing AI-generated responses and automated workflows where appropriate`,
          `Not using KeralaI for unlawful purposes`,
        ],
      },
      {
        kind: `p`,
        text: `KeralaI provides technology and infrastructure and does not determine the lawful basis for a customer's individual communications with its customers.`,
      },
    ],
  },
  {
    id: `prohibited-or-sensitive-uses`,
    title: `18. Prohibited or Sensitive Uses`,
    blocks: [
      {
        kind: `p`,
        text: `Customers should not use KeralaI to process highly sensitive information unless the relevant Service has expressly been designed and configured for that purpose and the customer has confirmed that such processing is legally permitted.`,
      },
      {
        kind: `p`,
        text: `Customers should not use the Services for unlawful surveillance, fraud, impersonation, harassment, or other unlawful activities.`,
      },
      {
        kind: `p`,
        text: `Where applicable, additional contractual or technical requirements may apply to regulated or highly sensitive information.`,
      },
    ],
  },
  {
    id: `third-party-websites-and-services`,
    title: `19. Third-Party Websites and Services`,
    blocks: [
      { kind: `p`, text: `The Services may contain links to or integrations with third-party websites and services.` },
      { kind: `p`, text: `KeralaI is not responsible for the privacy practices of third parties.` },
      {
        kind: `p`,
        text: `We recommend reviewing the privacy policy of each third-party service before providing personal information to it.`,
      },
    ],
  },
  {
    id: `changes-to-this-privacy-policy`,
    title: `20. Changes to This Privacy Policy`,
    blocks: [
      {
        kind: `p`,
        text: `We may update this Privacy Policy from time to time to reflect changes to our Services, technology, legal requirements, or business practices.`,
      },
      {
        kind: `p`,
        text: `When we make changes, we may update the "Last Updated" date at the top of this Privacy Policy.`,
      },
      {
        kind: `p`,
        text: `Material changes may also be communicated through appropriate channels where required by applicable law.`,
      },
    ],
  },
  {
    id: `contact-us`,
    title: `21. Contact Us`,
    blocks: [
      {
        kind: `p`,
        text: `If you have questions, concerns, or requests regarding this Privacy Policy or the processing of personal information by KeralaI, please contact us through the contact information provided on the KeralaI website.`,
      },
      { kind: `p`, text: `Service: ${PRIVACY_SERVICE_NAME}` },
      { kind: `p`, text: `Website: KeralaI website` },
      { kind: `p`, text: `Privacy Contact: ${PRIVACY_CONTACT_EMAIL}` },
      {
        kind: `p`,
        text: `For requests relating specifically to a business that uses KeralaI, you may also need to contact that business directly.`,
      },
    ],
  },
  {
    id: `your-rights`,
    title: `22. Your Rights`,
    blocks: [
      {
        kind: `p`,
        text: `Depending on your location and applicable law, you may have rights relating to your personal information, including rights to:`,
      },
      {
        kind: `list`,
        items: [
          `Request access to personal information`,
          `Request correction of inaccurate information`,
          `Request deletion of personal information`,
          `Request restriction of certain processing`,
          `Object to certain processing`,
          `Withdraw consent where processing is based on consent`,
          `Request information about processing activities`,
          `Request portability of certain information`,
          `Lodge a complaint with a relevant data-protection authority`,
        ],
      },
      {
        kind: `p`,
        text: `These rights may be subject to applicable legal limitations and exceptions.`,
      },
      {
        kind: `p`,
        text: `To exercise an applicable privacy right, contact us using the contact information provided above.`,
      },
    ],
  },
  {
    id: `effective-date`,
    title: `23. Effective Date`,
    blocks: [
      { kind: `p`, text: `This Privacy Policy is effective from ${PRIVACY_EFFECTIVE_DATE}.` },
      { kind: `p`, text: `Last Updated: ${PRIVACY_LAST_UPDATED}` },
    ],
  },
];

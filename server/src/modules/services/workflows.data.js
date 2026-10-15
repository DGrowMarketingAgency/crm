/**
 * D-Grow OS Service-Line Workflow Definitions
 * Based on D-Grow Complete Master Plan Section 8 & Developer Execution Pack
 */

export const ROLE_DEPARTMENT_MAP = {
  SEOExec: 'SEO',
  PerfMarketingExec: 'PerformanceMarketing',
  ContentExec: 'Content',
  DesignExec: 'Design',
  VideoExec: 'Video',
  DevExec: 'Dev',
  FieldExecutive: 'BD',
  AccountManager: 'Leadership',
  Owner: 'Leadership'
};

export const ROLE_SLUG_MAP = {
  SEOExec: 'seo-exec',
  PerfMarketingExec: 'perf-marketing-exec',
  ContentExec: 'content-exec',
  DesignExec: 'design-exec',
  VideoExec: 'video-exec',
  DevExec: 'dev-exec',
  FieldExecutive: 'field-executive',
  AccountManager: 'account-manager',
  Owner: 'owner'
};

export const SERVICES_CATALOG = {
  SEO: {
    label: 'SEO (Website Ranking) incl. AEO & GEO',
    group: 'Digital Marketing',
    ownerRole: 'SEOExec',
    cycle: 'Monthly',
    repeatFrom: 2,
    stages: [
      {
        name: 'Audit',
        days: 5,
        tasks: [
          { title: 'Competitors Audit: identify direct competitors and ranking keywords', cr: false },
          { title: 'Keyword Mapping: compile target keywords with search volumes & bid data', cr: false },
          { title: 'URL Structure & Content Audit: audit slugs and content gaps', cr: false },
          { title: 'Location Baseline & AEO/GEO Visibility Baseline: track AI engines & GMB position', cr: false }
        ]
      },
      {
        name: 'Strategy & Planning',
        days: 4,
        tasks: [
          { title: 'Target page keyword mapping and priority tagging', cr: false },
          { title: 'Draft meta titles and descriptions per target URL', cr: true },
          { title: 'Schema markup specification & Heading (H1-H4) plan', cr: false }
        ]
      },
      {
        name: 'Execution',
        days: 15,
        tasks: [
          { title: 'Implement on-page meta tags and schema markup', cr: false },
          { title: 'Publish optimized content and location-page updates', cr: true },
          { title: 'Build high-authority backlinks and local citations', cr: false },
          { title: 'Monitor Google AI Overviews and Perplexity/Gemini brand citations', cr: false }
        ]
      },
      {
        name: 'Reporting',
        days: 3,
        tasks: [
          { title: 'Compile monthly SEO, GMB, and AEO/GEO ranking report', cr: true }
        ]
      }
    ]
  },

  GoogleAds: {
    label: 'Google Ads (PPC)',
    group: 'Digital Marketing',
    ownerRole: 'PerfMarketingExec',
    cycle: 'Monthly',
    repeatFrom: 2,
    stages: [
      {
        name: 'Account Setup & Audit',
        days: 3,
        tasks: [
          { title: 'Audit conversion tracking and Google Tag Manager containers', cr: false },
          { title: 'Analyze historical search terms and negative keyword list', cr: false }
        ]
      },
      {
        name: 'Campaign Strategy',
        days: 4,
        tasks: [
          { title: 'Draft ad copy variations (Headlines, Descriptions, Assets)', cr: true },
          { title: 'Set campaign bidding structure and audience demographics', cr: false }
        ]
      },
      {
        name: 'Execution & Optimization',
        days: 15,
        tasks: [
          { title: 'Launch search and Performance Max ad campaigns', cr: false },
          { title: 'Weekly negative keyword mining and bid adjustments', cr: false }
        ]
      },
      {
        name: 'Reporting',
        days: 3,
        tasks: [
          { title: 'Compile monthly ROAS, CPA, and conversion analysis report', cr: true }
        ]
      }
    ]
  },

  SocialMediaMarketing: {
    label: 'Social Media Marketing (Paid Ads)',
    group: 'Digital Marketing',
    ownerRole: 'PerfMarketingExec',
    cycle: 'Monthly',
    repeatFrom: 2,
    stages: [
      {
        name: 'Audience & Creative Research',
        days: 3,
        tasks: [
          { title: 'Define custom audiences, lookalikes, and interest buckets', cr: false },
          { title: 'Review Meta Pixel / CAPI event tracking integration', cr: false }
        ]
      },
      {
        name: 'Creative Campaign Planning',
        days: 4,
        tasks: [
          { title: 'Design paid ad creative visuals and video hooks', cr: true, role: 'DesignExec' },
          { title: 'Draft primary text, headlines, and calls-to-action', cr: true, role: 'ContentExec' }
        ]
      },
      {
        name: 'Ad Execution & Scaling',
        days: 15,
        tasks: [
          { title: 'Deploy Meta campaign ad sets and creative combinations', cr: false },
          { title: 'Dayparting budget management and frequency cap monitoring', cr: false }
        ]
      },
      {
        name: 'Reporting',
        days: 3,
        tasks: [
          { title: 'Compile monthly social ad spend, reach, and lead cost report', cr: true }
        ]
      }
    ]
  },

  SocialMediaManagement: {
    label: 'Social Media Management (Organic)',
    group: 'Digital Marketing',
    ownerRole: 'ContentExec',
    cycle: 'Monthly',
    repeatFrom: 1,
    stages: [
      {
        name: 'Content Planning',
        days: 5,
        tasks: [
          { title: 'Draft 30-day social media calendar and content pillars', cr: true },
          { title: 'Draft post captions and hashtag sets', cr: true }
        ]
      },
      {
        name: 'Creative Production',
        days: 7,
        tasks: [
          { title: 'Produce static graphic posts and carousels', cr: true, role: 'DesignExec' },
          { title: 'Produce vertical video reels and short clips', cr: true, role: 'VideoExec' }
        ]
      },
      {
        name: 'Publishing & Engagement',
        days: 15,
        tasks: [
          { title: 'Schedule and publish approved social media posts', cr: false },
          { title: 'Daily community response and comments engagement', cr: false }
        ]
      },
      {
        name: 'Reporting',
        days: 3,
        tasks: [
          { title: 'Compile monthly follower growth and engagement rate report', cr: true }
        ]
      }
    ]
  },

  EmailMarketing: {
    label: 'Email Marketing (Brevo / Automation)',
    group: 'Digital Marketing',
    ownerRole: 'ContentExec',
    cycle: 'Monthly',
    repeatFrom: 1,
    stages: [
      {
        name: 'Strategy & Segmentation',
        days: 4,
        tasks: [
          { title: 'Segment subscriber lists and clean bounce lists in Brevo', cr: false },
          { title: 'Plan monthly newsletter topics and promotional broadcasts', cr: true }
        ]
      },
      {
        name: 'Template Design & Copy',
        days: 5,
        tasks: [
          { title: 'Design responsive email layouts and banners', cr: true, role: 'DesignExec' },
          { title: 'Draft email copy and subject line A/B variants', cr: true }
        ]
      },
      {
        name: 'Broadcast & Automation',
        days: 12,
        tasks: [
          { title: 'Schedule and deploy email campaigns', cr: false },
          { title: 'Setup automated drip series triggers and welcome flow', cr: false }
        ]
      },
      {
        name: 'Reporting',
        days: 3,
        tasks: [
          { title: 'Compile open rates, click-through rates, and conversion report', cr: true }
        ]
      }
    ]
  },

  GMB: {
    label: 'GMB Listing & Local Ranking',
    group: 'Digital Marketing',
    ownerRole: 'SEOExec',
    cycle: 'Monthly',
    repeatFrom: 2,
    stages: [
      {
        name: 'Local Audit',
        days: 4,
        tasks: [
          { title: 'Audit Google Business Profile details, categories, and attributes', cr: false },
          { title: 'NAP (Name, Address, Phone) citation consistency check', cr: false }
        ]
      },
      {
        name: 'Optimization Plan',
        days: 4,
        tasks: [
          { title: 'Draft localized services description and Q&A entries', cr: true },
          { title: 'Plan weekly geo-tagged image uploads and GMB posts', cr: false }
        ]
      },
      {
        name: 'Execution',
        days: 15,
        tasks: [
          { title: 'Publish weekly GMB updates and geo-tagged media', cr: false },
          { title: 'Generate and distribute review generation QR links', cr: false }
        ]
      },
      {
        name: 'Reporting',
        days: 3,
        tasks: [
          { title: 'Compile monthly map interactions, calls, and directions report', cr: true }
        ]
      }
    ]
  },

  WhatsAppMarketing: {
    label: 'WhatsApp Marketing & Automation',
    group: 'Digital Marketing',
    ownerRole: 'ContentExec',
    cycle: 'Monthly',
    repeatFrom: 1,
    stages: [
      {
        name: 'Template Approval',
        days: 3,
        tasks: [
          { title: 'Draft broadcast templates for WhatsApp Business API approval', cr: true },
          { title: 'Upload and segment opted-in contact numbers', cr: false }
        ]
      },
      {
        name: 'Broadcast Execution',
        days: 10,
        tasks: [
          { title: 'Dispatch approved WhatsApp campaign via official API gateway', cr: false },
          { title: 'Monitor message delivery rates and instant replies', cr: false }
        ]
      },
      {
        name: 'Reporting',
        days: 2,
        tasks: [
          { title: 'Compile delivery, read rate, and inquiry response report', cr: true }
        ]
      }
    ]
  },

  LeadsGeneration: {
    label: 'Leads Generation System',
    group: 'Digital Marketing',
    ownerRole: 'PerfMarketingExec',
    cycle: 'Monthly',
    repeatFrom: 1,
    stages: [
      {
        name: 'Funnel Setup',
        days: 4,
        tasks: [
          { title: 'Design lead capture form and landing page conversion flow', cr: true, role: 'DevExec' },
          { title: 'Integrate CRM webhook / lead instant notification route', cr: false, role: 'DevExec' }
        ]
      },
      {
        name: 'Campaign Running',
        days: 20,
        tasks: [
          { title: 'Run multi-channel lead acquisition campaigns', cr: false },
          { title: 'Daily lead qualification and CRM hygiene verification', cr: false }
        ]
      },
      {
        name: 'Reporting',
        days: 3,
        tasks: [
          { title: 'Compile monthly Cost-Per-Lead and qualified pipeline report', cr: true }
        ]
      }
    ]
  },

  PoliticalAds: {
    label: 'Political Ads & Voter Outreach',
    group: 'Digital Marketing',
    ownerRole: 'PerfMarketingExec',
    cycle: 'Campaign-based',
    repeatFrom: 1,
    stages: [
      {
        name: 'Constituency Research',
        days: 4,
        tasks: [
          { title: 'Map constituency demographics, voter issues, and media habits', cr: false },
          { title: 'Verify election compliance and disclaimer authorizations', cr: false }
        ]
      },
      {
        name: 'Creative & Narrative',
        days: 5,
        tasks: [
          { title: 'Produce localized video testimonials and campaign appeals', cr: true, role: 'VideoExec' },
          { title: 'Design digital voter pamphlets and manifesto graphics', cr: true, role: 'DesignExec' }
        ]
      },
      {
        name: 'Targeted Dissemination',
        days: 20,
        tasks: [
          { title: 'Deploy geo-fenced mobile and social media campaigns', cr: false }
        ]
      },
      {
        name: 'Reporting',
        days: 3,
        tasks: [
          { title: 'Compile voter reach, sentiment, and impression saturation report', cr: true }
        ]
      }
    ]
  },

  ContentWriting: {
    label: 'Content Writing & Marketing',
    group: 'Creative',
    ownerRole: 'ContentExec',
    cycle: 'Monthly',
    repeatFrom: 1,
    stages: [
      {
        name: 'Topic Ideation & Outline',
        days: 4,
        tasks: [
          { title: 'Develop monthly editorial calendar and content briefs', cr: true }
        ]
      },
      {
        name: 'Drafting & Review',
        days: 10,
        tasks: [
          { title: 'Draft high-authority articles, case studies, and web pages', cr: true }
        ]
      },
      {
        name: 'Publishing',
        days: 3,
        tasks: [
          { title: 'Format, publish, and interlink articles on client CMS', cr: false }
        ]
      }
    ]
  },

  GraphicDesigning: {
    label: 'Graphic Designing & Brand Collateral',
    group: 'Creative',
    ownerRole: 'DesignExec',
    cycle: 'Monthly',
    repeatFrom: 1,
    stages: [
      {
        name: 'Design Brief & Concept',
        days: 3,
        tasks: [
          { title: 'Review design briefs, brand guidelines, and moodboard', cr: false }
        ]
      },
      {
        name: 'Design Production',
        days: 8,
        tasks: [
          { title: 'Produce brand graphic deliverables and marketing assets', cr: true }
        ]
      },
      {
        name: 'Export & Delivery',
        days: 2,
        tasks: [
          { title: 'Package production-ready vector and web image formats', cr: true }
        ]
      }
    ]
  },

  VideoShooting: {
    label: 'Video Shooting & Editing',
    group: 'Creative',
    ownerRole: 'VideoExec',
    cycle: 'Per Shoot',
    repeatFrom: 1,
    stages: [
      {
        name: 'Pre-Production & Scripting',
        days: 4,
        tasks: [
          { title: 'Draft video scripts, storyboard, and shoot schedule', cr: true }
        ]
      },
      {
        name: 'Shoot Execution',
        days: 2,
        tasks: [
          { title: 'On-site or studio video recording with audio and lighting', cr: false }
        ]
      },
      {
        name: 'Post-Production',
        days: 6,
        tasks: [
          { title: 'Video rough cut, color grading, audio master, and captions', cr: true }
        ]
      },
      {
        name: 'Final Delivery',
        days: 2,
        tasks: [
          { title: 'Deliver finalized 4K master files and optimized mobile cuts', cr: true }
        ]
      }
    ]
  },

  PersonalBranding: {
    label: 'Personal Branding',
    group: 'Creative',
    ownerRole: 'ContentExec',
    cycle: 'Monthly',
    repeatFrom: 1,
    stages: [
      {
        name: 'Brand Identity Strategy',
        days: 5,
        tasks: [
          { title: 'Define personal positioning, core pillars, and audience tone', cr: true }
        ]
      },
      {
        name: 'Content Production',
        days: 12,
        tasks: [
          { title: 'Draft thought leadership posts, quotes, and interviews', cr: true },
          { title: 'Produce executive headshot edits and branded templates', cr: true, role: 'DesignExec' }
        ]
      },
      {
        name: 'Review & Growth',
        days: 3,
        tasks: [
          { title: 'Compile personal reach and speaking / collaboration inquiries report', cr: true }
        ]
      }
    ]
  },

  LinkedInPersonalBranding: {
    label: 'LinkedIn Personal Branding',
    group: 'Creative',
    ownerRole: 'ContentExec',
    cycle: 'Monthly',
    repeatFrom: 1,
    stages: [
      {
        name: 'Profile Optimization',
        days: 4,
        tasks: [
          { title: 'Revamp LinkedIn banner, headline, about section, and featured assets', cr: true }
        ]
      },
      {
        name: 'Weekly Post Creation',
        days: 15,
        tasks: [
          { title: 'Draft weekly industry insights, carousel posts, and text hooks', cr: true },
          { title: 'Design PDF slide carousels for LinkedIn document posts', cr: true, role: 'DesignExec' }
        ]
      },
      {
        name: 'Monthly Analytics',
        days: 2,
        tasks: [
          { title: 'Compile LinkedIn profile impressions, search appearances, and connection growth', cr: true }
        ]
      }
    ]
  },

  WebsiteDevelopment: {
    label: 'Website Design & Development',
    group: 'Development',
    ownerRole: 'DevExec',
    cycle: 'Milestone-based',
    repeatFrom: 1,
    stages: [
      {
        name: 'Architecture & Wireframes',
        days: 5,
        tasks: [
          { title: 'Create site map, information architecture, and UI wireframes', cr: true }
        ]
      },
      {
        name: 'UI/UX Design',
        days: 8,
        tasks: [
          { title: 'Design high-fidelity desktop and mobile UI mockups', cr: true, role: 'DesignExec' }
        ]
      },
      {
        name: 'Frontend & Backend Coding',
        days: 15,
        tasks: [
          { title: 'Implement responsive web frontend and CMS integrations', cr: false },
          { title: 'Integrate lead capture forms, WhatsApp widget, and analytics tags', cr: false }
        ]
      },
      {
        name: 'QA & Launch',
        days: 4,
        tasks: [
          { title: 'Perform cross-browser testing, mobile audit, and SSL deployment', cr: true }
        ]
      }
    ]
  },

  MarketingAutomation: {
    label: 'Marketing Automation & Zapier Systems',
    group: 'Development',
    ownerRole: 'DevExec',
    cycle: 'Setup + Monthly',
    repeatFrom: 1,
    stages: [
      {
        name: 'Workflow Mapping',
        days: 4,
        tasks: [
          { title: 'Map agency-client data handoffs, notification triggers, and CRM sync points', cr: true }
        ]
      },
      {
        name: 'Integration & Testing',
        days: 6,
        tasks: [
          { title: 'Build automated webhooks, Zapier/Make flows, and error alerting', cr: false }
        ]
      },
      {
        name: 'Handover & Monitoring',
        days: 2,
        tasks: [
          { title: 'Verify live end-to-end webhook delivery and document SOPs', cr: true }
        ]
      }
    ]
  },

  LeadNurturing: {
    label: 'Lead Nurturing System',
    group: 'Development',
    ownerRole: 'ContentExec',
    cycle: 'Setup + Monthly',
    repeatFrom: 1,
    stages: [
      {
        name: 'Nurture Journey Mapping',
        days: 4,
        tasks: [
          { title: 'Design multi-touch lead nurturing sequence (WhatsApp + Email + SMS)', cr: true }
        ]
      },
      {
        name: 'Copy & Asset Production',
        days: 6,
        tasks: [
          { title: 'Write automated follow-up messages and objection-handling copy', cr: true }
        ]
      },
      {
        name: 'Deployment & Optimization',
        days: 10,
        tasks: [
          { title: 'Deploy nurture rules and track lead re-engagement conversion rates', cr: false }
        ]
      }
    ]
  },

  DigitalConsultation: {
    label: 'Digital Marketing Consultation',
    group: 'Digital Marketing',
    ownerRole: 'AccountManager',
    cycle: 'Monthly / Quarterly',
    repeatFrom: 1,
    stages: [
      {
        name: 'Growth Audit & Discovery',
        days: 4,
        tasks: [
          { title: 'Comprehensive agency audit of client digital presence and CAC/LTV metrics', cr: false }
        ]
      },
      {
        name: 'Strategic Roadmap',
        days: 5,
        tasks: [
          { title: 'Deliver quarterly digital growth strategy and budget allocation roadmap', cr: true }
        ]
      }
    ]
  },

  ProductListingAmazonSEO: {
    label: 'Product Listing + Amazon SEO',
    group: 'Digital Marketing',
    ownerRole: 'SEOExec',
    cycle: 'Per Catalog Batch',
    repeatFrom: 1,
    stages: [
      {
        name: 'E-commerce Keyword Research',
        days: 4,
        tasks: [
          { title: 'Extract Amazon high-intent backend search terms and competitor ASINs', cr: false }
        ]
      },
      {
        name: 'Listing Optimization & A+ Content',
        days: 7,
        tasks: [
          { title: 'Draft keyword-rich product titles, bullet points, and descriptions', cr: true, role: 'ContentExec' },
          { title: 'Design Amazon A+ Content / EBC visual infographic banners', cr: true, role: 'DesignExec' }
        ]
      },
      {
        name: 'Publishing & Index Verification',
        days: 3,
        tasks: [
          { title: 'Upload catalog updates to Seller Central and verify search indexing', cr: true }
        ]
      }
    ]
  }
};


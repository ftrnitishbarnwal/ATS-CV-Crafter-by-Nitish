/**
 * Curated skills/keyword dictionary used for JD analysis, skill detection and scoring.
 * Format: "Canonical|alias|alias". Terms listed in CASE_SENSITIVE only match with exact case
 * (to avoid e.g. "Go" matching "go live", or "Excel" matching "excel at").
 */

export type SkillCategory =
  | "Programming Languages"
  | "Frameworks & Libraries"
  | "Databases"
  | "Cloud & DevOps"
  | "Data & AI"
  | "Testing & Quality"
  | "Tools & Platforms"
  | "Design"
  | "Marketing"
  | "Sales & Customer"
  | "Finance & Accounting"
  | "People & HR"
  | "Operations & Supply Chain"
  | "Methodologies"
  | "Engineering Practices"
  | "Soft Skills";

const RAW: Record<SkillCategory, string[]> = {
  "Programming Languages": [
    "Python", "Java", "JavaScript|JS|ECMAScript", "TypeScript|TS", "C++|CPP", "C#|C Sharp|CSharp", "Go|Golang", "Rust", "Ruby",
    "PHP", "Kotlin", "Swift", "Objective-C", "Scala", "R", "MATLAB", "Perl", "Dart", "Elixir", "Haskell", "Clojure",
    "Lua", "Julia", "SQL", "PL/SQL", "T-SQL", "Bash|Shell Scripting|Shell", "PowerShell", "HTML|HTML5", "CSS|CSS3", "Sass|SCSS",
    "Solidity", "VBA", "COBOL", "Fortran", "Assembly", "Groovy", "Verilog", "VHDL", "C programming|C language|ANSI C",
  ],
  "Frameworks & Libraries": [
    "React|React.js|ReactJS", "Next.js|NextJS", "Angular|AngularJS", "Vue.js|Vue|VueJS", "Nuxt.js|Nuxt", "Svelte|SvelteKit",
    "Redux", "jQuery", "Tailwind CSS|Tailwind|TailwindCSS", "Bootstrap", "Material UI|MUI", "Node.js|NodeJS|Node", "Express.js|ExpressJS|Express",
    "NestJS", "Django", "Flask", "FastAPI", "Spring Boot|Spring Framework|Spring", "Hibernate", ".NET|.NET Core|ASP.NET|dotnet", "Ruby on Rails|Rails",
    "Laravel", "Symfony", "React Native", "Flutter", "SwiftUI", "Jetpack Compose", "Electron", "GraphQL", "Apollo", "gRPC",
    "Pandas", "NumPy", "SciPy", "scikit-learn|sklearn|scikit learn", "TensorFlow", "PyTorch", "Keras", "Hugging Face|HuggingFace|Transformers",
    "LangChain", "LlamaIndex", "OpenCV", "Matplotlib", "Seaborn", "Plotly", "D3.js|D3", "Three.js", "Spark|Apache Spark|PySpark",
    "Hadoop", "Kafka|Apache Kafka", "Airflow|Apache Airflow", "dbt", "Celery", "RabbitMQ", "Redux Toolkit", "Webpack", "Vite",
    "Storybook", "Unity", "Unreal Engine", "Qt", "Selenium", "Cypress", "Playwright", "Jest", "Mocha", "JUnit", "PyTest|pytest",
  ],
  Databases: [
    "PostgreSQL|Postgres", "MySQL", "SQLite", "Oracle Database|Oracle DB|Oracle", "SQL Server|MSSQL|Microsoft SQL Server", "MongoDB|Mongo",
    "Redis", "Cassandra", "DynamoDB", "Elasticsearch|Elastic Search|OpenSearch", "Neo4j", "Snowflake", "BigQuery|Google BigQuery",
    "Redshift|Amazon Redshift", "Databricks", "Firebase|Firestore", "Supabase", "MariaDB", "CouchDB", "Pinecone", "ClickHouse",
    "NoSQL", "Relational Databases|RDBMS", "Vector Databases|Vector Database",
  ],
  "Cloud & DevOps": [
    "AWS|Amazon Web Services", "Azure|Microsoft Azure", "GCP|Google Cloud Platform|Google Cloud", "Docker", "Kubernetes|K8s", "Terraform",
    "Ansible", "Jenkins", "GitHub Actions", "GitLab CI|GitLab CI/CD", "CircleCI", "CI/CD|CICD|Continuous Integration|Continuous Delivery|Continuous Deployment",
    "Helm", "Prometheus", "Grafana", "Datadog", "New Relic", "Splunk", "ELK Stack|ELK", "Nginx", "Apache", "Linux|Unix", "Serverless",
    "AWS Lambda|Lambda", "EC2", "S3|Amazon S3", "CloudFormation", "Vercel", "Netlify", "Heroku", "OpenShift", "Infrastructure as Code|IaC",
    "Microservices|Microservice", "DevOps", "SRE|Site Reliability Engineering", "Networking|TCP/IP", "Load Balancing", "Cloud Computing",
    "IAM|Identity and Access Management", "Cybersecurity|Information Security|InfoSec", "OWASP", "Penetration Testing", "SIEM", "Zero Trust",
  ],
  "Data & AI": [
    "Machine Learning|ML", "Deep Learning", "Natural Language Processing|NLP", "Computer Vision", "Large Language Models|LLM|LLMs",
    "Generative AI|GenAI|Gen AI", "Prompt Engineering", "RAG|Retrieval-Augmented Generation|Retrieval Augmented Generation", "MLOps",
    "Data Science", "Data Analysis|Data Analytics", "Data Engineering", "Data Visualization|Data Visualisation", "Data Modeling|Data Modelling",
    "Data Warehousing|Data Warehouse", "ETL|ELT", "Data Pipelines|Data Pipeline", "Big Data", "Statistics|Statistical Analysis",
    "A/B Testing|A/B tests|A/B test|AB Testing|AB tests|Split Testing", "Predictive Modeling|Predictive Modelling", "Time Series", "Recommendation Systems",
    "Feature Engineering", "Business Intelligence|BI", "Power BI|PowerBI", "Tableau", "Looker", "Qlik|QlikView|Qlik Sense", "Excel|MS Excel|Microsoft Excel",
    "Google Sheets", "SPSS", "SAS", "Stata", "Data Governance", "Data Quality", "Reporting", "Dashboards|Dashboard", "KPIs|KPI", "Forecasting",
  ],
  "Testing & Quality": [
    "Unit Testing", "Integration Testing", "Automation Testing|Test Automation", "Manual Testing", "QA|Quality Assurance", "TDD|Test-Driven Development",
    "BDD", "Performance Testing|Load Testing", "JMeter", "Postman", "API Testing", "Regression Testing", "Quality Control|QC",
  ],
  "Tools & Platforms": [
    "Git", "GitHub", "GitLab", "Bitbucket", "Jira", "Confluence", "Trello", "Asana", "Notion", "Slack", "Microsoft Teams|MS Teams",
    "Microsoft Office|MS Office|Office 365|Microsoft 365", "Microsoft Word|MS Word", "PowerPoint|MS PowerPoint", "Outlook", "Google Workspace|G Suite",
    "Salesforce", "HubSpot", "Zendesk", "Freshdesk", "ServiceNow", "SAP", "Oracle ERP|Oracle NetSuite|NetSuite", "Workday", "Tally|Tally ERP|TallyPrime",
    "QuickBooks", "Xero", "Zoho", "Shopify", "WordPress", "Webflow", "Mailchimp", "Google Analytics|GA4", "Google Ads|AdWords", "Meta Ads|Facebook Ads",
    "SEMrush", "Ahrefs", "Hootsuite", "Linux Administration", "VS Code|Visual Studio Code", "IntelliJ", "Xcode", "Android Studio", "Postman API",
    "Zapier", "Airtable", "Monday.com", "Smartsheet", "Miro", "Loom", "Twilio", "Stripe", "Segment", "Mixpanel", "Amplitude", "Hotjar",
    "AutoCAD", "SolidWorks", "Revit", "Visio|Microsoft Visio", "Jupyter|Jupyter Notebook", "Anaconda", "SharePoint", "Power Automate", "UiPath",
  ],
  Design: [
    "Figma", "Sketch", "Adobe XD", "Photoshop|Adobe Photoshop", "Illustrator|Adobe Illustrator", "InDesign|Adobe InDesign", "After Effects",
    "Premiere Pro", "Canva", "Adobe Creative Suite|Adobe Creative Cloud", "UI Design|User Interface Design", "UX Design|User Experience Design",
    "UI/UX|UX/UI", "User Research|UX Research", "Usability Testing", "Wireframing|Wireframes", "Prototyping|Prototypes", "Interaction Design",
    "Visual Design", "Design Systems|Design System", "Information Architecture", "Accessibility|a11y", "WCAG", "Responsive Design",
    "Typography", "Branding|Brand Identity", "Motion Design", "Graphic Design", "Product Design", "Design Thinking", "Journey Mapping|User Journeys",
  ],
  Marketing: [
    "Digital Marketing", "SEO|Search Engine Optimization|Search Engine Optimisation", "SEM|Search Engine Marketing", "PPC|Pay-Per-Click",
    "Content Marketing", "Content Strategy", "Email Marketing", "Social Media Marketing|SMM", "Social Media", "Performance Marketing",
    "Growth Marketing", "Marketing Automation", "Brand Management", "Market Research", "Competitive Analysis", "Copywriting",
    "Campaign Management", "Lead Generation", "Demand Generation", "Product Marketing", "Go-to-Market|GTM|Go to Market", "Affiliate Marketing",
    "Influencer Marketing", "Conversion Rate Optimization|CRO", "Public Relations|PR", "Event Management|Event Planning", "Marketing Analytics",
    "Customer Segmentation", "Community Management", "Video Editing", "Content Creation", "Editing|Proofreading", "Technical Writing",
  ],
  "Sales & Customer": [
    "B2B", "B2C", "SaaS", "Business Development", "Account Management", "Key Account Management", "Sales|Sales Strategy", "Inside Sales",
    "Cold Calling", "Prospecting", "Pipeline Management", "CRM|Customer Relationship Management", "Customer Success", "Customer Service|Customer Support",
    "Client Relationship Management|Client Management", "Upselling|Cross-selling", "Negotiation", "Contract Negotiation", "Solution Selling",
    "Retention", "Churn Reduction", "Onboarding", "Customer Experience|CX", "E-commerce|eCommerce|Ecommerce", "Retail", "Merchandising",
  ],
  "Finance & Accounting": [
    "Financial Analysis", "Financial Modeling|Financial Modelling", "FP&A|Financial Planning and Analysis", "Budgeting", "Variance Analysis",
    "Accounting", "Bookkeeping", "Accounts Payable|AP", "Accounts Receivable|AR", "General Ledger", "Reconciliation|Bank Reconciliation",
    "GAAP|US GAAP", "IFRS", "Ind AS", "Audit|Auditing|Internal Audit", "Taxation", "GST", "TDS", "Payroll", "Valuation", "DCF",
    "Investment Banking", "Equity Research", "Portfolio Management", "Risk Management", "Credit Analysis", "Compliance|Regulatory Compliance",
    "KYC", "AML|Anti-Money Laundering", "Treasury", "Cost Accounting", "MIS Reporting|MIS", "Financial Reporting", "Cash Flow Management",
  ],
  "People & HR": [
    "Recruitment|Recruiting", "Talent Acquisition", "Sourcing", "Employee Onboarding", "Employee Engagement", "Performance Management",
    "Compensation and Benefits|Compensation & Benefits|C&B", "HRIS", "HR Operations", "Employee Relations", "Learning and Development|L&D",
    "Training", "Succession Planning", "Workforce Planning", "Labor Law|Labour Law", "Diversity and Inclusion|DEI|D&I", "Interviewing",
  ],
  "Operations & Supply Chain": [
    "Operations Management", "Supply Chain Management|Supply Chain", "Logistics", "Procurement", "Vendor Management", "Inventory Management",
    "Demand Planning", "Warehouse Management", "Lean", "Six Sigma|Lean Six Sigma", "Process Improvement|Continuous Improvement",
    "Project Management", "Program Management", "Product Management", "Product Strategy", "Roadmapping|Product Roadmap|Roadmap",
    "Requirements Gathering", "Business Analysis", "Process Mapping", "SOPs|Standard Operating Procedures|SOP", "Quality Management",
    "Change Management", "Stakeholder Management", "Resource Planning", "Budget Management", "Facilities Management", "Health and Safety|EHS",
    "Clinical Research", "Patient Care", "EHR|EMR|Electronic Health Records", "HIPAA", "Healthcare", "Pharmaceutical|Pharma", "Manufacturing",
    "Teaching", "Curriculum Development", "Lesson Planning", "Classroom Management", "Research", "Policy Analysis", "Grant Writing",
  ],
  Methodologies: [
    "Agile", "Scrum", "Kanban", "Waterfall", "SAFe", "PMP", "PRINCE2", "ITIL", "OKRs|OKR", "Design Sprints", "Sprint Planning",
    "User Stories", "Product Discovery", "Jobs to be Done|JTBD", "Root Cause Analysis|RCA", "SDLC|Software Development Life Cycle",
  ],
  "Engineering Practices": [
    "REST APIs|REST|RESTful APIs|RESTful|REST API", "API Design|API Development|APIs", "System Design", "Distributed Systems", "Scalability",
    "Performance Optimization|Performance Tuning", "Object-Oriented Programming|OOP|OOPS", "Data Structures", "Algorithms", "Design Patterns",
    "Code Review|Code Reviews", "Version Control", "Web Development", "Frontend Development|Front-end Development|Front End Development|Frontend",
    "Backend Development|Back-end Development|Back End Development|Backend", "Full Stack Development|Full-Stack Development|Full Stack|Full-Stack",
    "Mobile Development", "iOS", "Android", "Embedded Systems", "Firmware", "Event-Driven Architecture", "Caching", "Concurrency",
    "Web Performance", "SSR|Server-Side Rendering", "Authentication|OAuth|OAuth2|JWT", "Security Best Practices", "Monitoring|Observability",
    "Technical Documentation|Documentation", "Mentoring|Mentorship", "Architecture|Software Architecture",
  ],
  "Soft Skills": [
    "Communication|Communication Skills|Written Communication|Verbal Communication", "Leadership|Team Leadership", "Teamwork",
    "Collaboration|Cross-functional Collaboration|Cross-Functional Teams", "Problem Solving|Problem-Solving", "Critical Thinking",
    "Time Management", "Adaptability", "Attention to Detail|Detail-Oriented|Detail Oriented", "Analytical Skills|Analytical Thinking",
    "Decision Making|Decision-Making", "Conflict Resolution", "Presentation Skills|Presentations", "Public Speaking", "Organizational Skills|Organisational Skills",
    "Interpersonal Skills", "Strategic Thinking", "Customer Focus|Customer-Centric|Customer Obsession", "Ownership", "Coaching", "Creativity",
    "Multitasking", "Emotional Intelligence", "Self-Motivated|Self Starter|Self-Starter", "Prioritization|Prioritisation",
  ],
};

/** Terms that must match exactly by case, to avoid common English collisions. */
const CASE_SENSITIVE = new Set([
  "Go", "R", "Swift", "Rust", "Ruby", "Dart", "Lua", "Julia", "Perl", "Elixir", "Groovy", "Assembly", "Excel", "Spark", "Spring",
  "Express", "Node", "Apache", "Lambda", "Lean", "Shell", "Unity", "Segment", "Stripe", "Loom", "Miro", "Slack", "Notion", "Outlook",
  "Oracle", "Sketch", "Canva", "Looker", "Helm", "Mocha", "Jest", "Transformers", "Rails", "Qt", "Vite", "Redux", "Apollo", "Celery",
  "Mongo", "Postgres", "Sass", "Flask", "Keras", "Asana", "Trello", "Zoho", "Tally", "Xero", "Twilio", "Kafka", "Airflow",
  "Docker", "Jenkins", "Terraform", "Selenium", "Cypress", "Playwright", "Tableau", "Pandas", "Snowflake", "Anaconda", "Visio",
  "Revit", "Webflow", "Shopify", "Hotjar", "Amplitude", "Mixpanel", "Airtable", "Hadoop", "Electron", "Bootstrap", "Storybook",
  "Prometheus", "Grafana", "Splunk", "Nginx", "Heroku", "Vercel", "Netlify", "Supabase", "Firebase", "Redis", "Cassandra", "Pinecone",
  "Postman", "Jupyter", "Confluence", "Jira", "Git", "Illustrator", "Photoshop", "InDesign", "Salesforce", "HubSpot", "Workday",
  "Ind AS", "SAFe", "iOS", "Tailwind", "Svelte", "Nuxt", "Vue",
]);

export interface DictEntry {
  canonical: string; // display form
  key: string; // lower-case key
  category: SkillCategory;
  kind: "skill" | "tool" | "soft";
  patterns: RegExp[];
  aliases: string[];
}

const TOOL_CATS = new Set<SkillCategory>(["Tools & Platforms", "Databases", "Cloud & DevOps"]);

function termRegex(term: string, caseSensitive: boolean): RegExp {
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s-]+");
  // Boundaries: not preceded/followed by alphanumerics or +/# (so "C" doesn't match "C++", "Java" doesn't match "JavaScript").
  return new RegExp(`(?<![A-Za-z0-9+#])${esc}(?![A-Za-z0-9+#]|\\.(?:js|JS)\\b)`, caseSensitive ? "g" : "gi");
}

function build(): DictEntry[] {
  const out: DictEntry[] = [];
  const seen = new Set<string>();
  for (const [cat, list] of Object.entries(RAW) as [SkillCategory, string[]][]) {
    for (const line of list) {
      const [canonical, ...aliases] = line.split("|");
      const key = canonical.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const all = [canonical, ...aliases];
      const patterns = all.map((t) => termRegex(t, CASE_SENSITIVE.has(t) || t.length <= 2));
      out.push({
        canonical,
        key,
        category: cat,
        kind: cat === "Soft Skills" ? "soft" : TOOL_CATS.has(cat) ? "tool" : "skill",
        patterns,
        aliases,
      });
    }
  }
  // Longer terms first so "React Native" wins over "React", "Spring Boot" over "Spring".
  return out.sort((a, b) => b.canonical.length - a.canonical.length);
}

export const DICTIONARY: DictEntry[] = build();
const BY_KEY = new Map(DICTIONARY.map((e) => [e.key, e]));
const ALIAS_INDEX = new Map<string, DictEntry>();
for (const e of DICTIONARY) {
  ALIAS_INDEX.set(e.key, e);
  for (const a of e.aliases) if (!ALIAS_INDEX.has(a.toLowerCase())) ALIAS_INDEX.set(a.toLowerCase(), e);
}

export function lookupTerm(term: string): DictEntry | undefined {
  const t = term.trim().toLowerCase().replace(/\s+/g, " ");
  return ALIAS_INDEX.get(t) ?? BY_KEY.get(t);
}

export interface TermHit {
  entry: DictEntry;
  surface: string; // exact text as found
  count: number;
  index: number; // first occurrence
}

/**
 * Find dictionary terms in text. Overlapping matches are resolved longest-first
 * (e.g. "React Native" consumes the span so "React" isn't double-counted there).
 */
const FLAT: { entry: DictEntry; re: RegExp; len: number }[] = DICTIONARY.flatMap((entry) =>
  [entry.canonical, ...entry.aliases].map((t, i) => ({ entry, re: entry.patterns[i], len: t.length })),
).sort((a, b) => b.len - a.len);

export function findTerms(text: string): TermHit[] {
  const taken: [number, number][] = [];
  const hits = new Map<string, TermHit>();
  const overlaps = (a: number, b: number) => taken.some(([x, y]) => a < y && b > x);
  for (const { entry, re } of FLAT) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const start = m.index;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      taken.push([start, end]);
      const h = hits.get(entry.key);
      if (h) {
        h.count++;
        if (start < h.index) h.index = start;
      } else {
        hits.set(entry.key, { entry, surface: m[0], count: 1, index: start });
      }
    }
  }
  return [...hits.values()].sort((a, b) => a.index - b.index);
}

/** Display form for a hit: the text as written, capitalized if it was all lower-case. */
export function displayForm(hit: TermHit): string {
  const s = hit.surface.replace(/\s+/g, " ");
  if (s === s.toLowerCase()) {
    // prefer the dictionary's canonical casing when it is the same words (e.g. "postgresql" -> "PostgreSQL")
    if (hit.entry.canonical.toLowerCase() === s) return hit.entry.canonical;
    const alias = hit.entry.aliases.find((a) => a.toLowerCase() === s);
    if (alias) return alias;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return s;
}

export function textHasTerm(text: string, key: string): boolean {
  const e = BY_KEY.get(key) ?? lookupTerm(key);
  if (!e) {
    const re = new RegExp(`(?<![A-Za-z0-9+#])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s-]+")}(?![A-Za-z0-9+#])`, "i");
    return re.test(text);
  }
  return e.patterns.some((re) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

export function entryByKey(key: string): DictEntry | undefined {
  return BY_KEY.get(key);
}

import { LuShieldCheck, LuListChecks, LuFileText, LuLock } from "react-icons/lu";
import { Logo } from "../components/ui";
import { navigate } from "../lib/router";

function HeroVisual() {
  return (
    <figure className="hero-visual" aria-label="Example: keywords from a job posting matched in a tailored resume">
      <div className="jd-card" aria-hidden="true">
        <div className="jd-card-head">
          <span className="jd-dot" />
          Job posting
        </div>
        <p className="jd-title">Senior Product Analyst</p>
        <ul>
          <li>
            4+ years of <mark>SQL</mark> and <mark>Python</mark> for analysis
          </li>
          <li>
            Design and read <mark>A/B tests</mark>
          </li>
          <li>
            Build <mark>Tableau</mark> dashboards for leadership
          </li>
          <li>
            Partner with <mark>product managers</mark>
          </li>
        </ul>
      </div>
      <div className="sheet" aria-hidden="true">
        <div className="sheet-name">Ananya Rao</div>
        <div className="sheet-role">Product Analyst</div>
        <div className="sheet-contact">ananya.rao@example.com | Pune, India | linkedin.com/in/ananyarao</div>
        <div className="sheet-h">Experience</div>
        <div className="sheet-row">
          <b>Product Analyst</b>
          <span>Mar 2021 – Present</span>
        </div>
        <div className="sheet-sub">Brightcart Retail</div>
        <ul>
          <li>
            Designed 14 <em>A/B tests</em> on checkout, lifting conversion 6.2%
          </li>
          <li>
            Built <em>Tableau</em> dashboards used in weekly leadership reviews
          </li>
          <li>
            Automated cohort reports in <em>SQL</em> and <em>Python</em>, saving 9 hours a week
          </li>
        </ul>
        <div className="sheet-h">Skills</div>
        <p className="sheet-skills">
          <b>Analytics:</b> <em>SQL</em>, <em>Python</em>, <em>Tableau</em>, Excel, <em>A/B testing</em>
        </p>
      </div>
      <div className="score-tag" aria-hidden="true">
        <span className="score-num">91</span>
        <span className="score-lbl">
          optimization
          <br />
          score
        </span>
      </div>
      <figcaption>Example output. Highlighted terms came from the posting and were already in the candidate's own experience.</figcaption>
    </figure>
  );
}

export function Landing() {
  const start = () => navigate("/build");
  return (
    <div className="landing">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-nav">
        <div className="wrap nav-inner">
          <a href="/" className="nav-logo" aria-label="TailorCV home" onClick={(e) => { e.preventDefault(); navigate("/"); }}>
            <Logo />
          </a>
          <nav aria-label="Main">
            <a href="#how">How it works</a>
            <a href="#standards">Our standards</a>
          </nav>
          <button className="btn btn-dark btn-sm" onClick={start}>
            Start
          </button>
        </div>
      </header>

      <main id="main">
        <section className="hero wrap">
          <div className="hero-copy">
            <h1 className="display hero-title">Build a Resume That Gets Noticed.</h1>
            <p className="hero-lede">
              Paste the job you want, then upload your resume or add your details. TailorCV rewrites your experience around that job's requirements, without inventing anything, and gives you an ATS-friendly PDF.
            </p>
            <div className="hero-cta">
              <button className="btn btn-primary btn-lg" onClick={start}>
                Start Your Resume Making Journey →
              </button>
            </div>
            <p className="hero-note">
              <LuLock aria-hidden="true" /> No account needed. Your information is processed in memory and never stored.
            </p>
          </div>
          <HeroVisual />
        </section>

        <section id="how" className="how">
          <div className="wrap">
            <h2 className="display section-title">Three steps from job post to PDF</h2>
            <ol className="steps">
              <li>
                <span className="step-num">1</span>
                <h3>Paste the job description</h3>
                <p>We pick out the title, required and preferred skills, tools, responsibilities and experience level.</p>
              </li>
              <li>
                <span className="step-num">2</span>
                <h3>Add your experience</h3>
                <p>Upload a PDF, DOCX or TXT resume, or fill in a guided form if you're starting from scratch.</p>
              </li>
              <li>
                <span className="step-num">3</span>
                <h3>Review, edit and download</h3>
                <p>See your optimization score, which keywords matched and what's missing. Edit anything, then download a PDF or Word file.</p>
              </li>
            </ol>
          </div>
        </section>

        <section id="standards" className="standards">
          <div className="wrap standards-inner">
            <div className="standards-intro">
              <h2 className="display section-title">Tailored, never invented</h2>
              <p>Recruiters check what you claim. Every line TailorCV writes can be traced back to something you told us.</p>
            </div>
            <ul className="standards-list">
              <li>
                <LuShieldCheck aria-hidden="true" />
                <div>
                  <h3>Your facts stay your facts</h3>
                  <p>Companies, titles, dates, numbers and skills come only from what you provide. A keyword from the job is added only when your own experience already shows it.</p>
                </div>
              </li>
              <li>
                <LuListChecks aria-hidden="true" />
                <div>
                  <h3>A score you can trace</h3>
                  <p>The optimization score adds up eight measurable checks: keyword coverage, skills, title match, experience relevance, impact, sections, contact details and readability. No random numbers, no guarantees.</p>
                </div>
              </li>
              <li>
                <LuFileText aria-hidden="true" />
                <div>
                  <h3>Built for applicant tracking systems</h3>
                  <p>One column, standard headings and real selectable text. No tables, icons, photos or skill bars that confuse parsers.</p>
                </div>
              </li>
              <li>
                <LuLock aria-hidden="true" />
                <div>
                  <h3>Private by design</h3>
                  <p>Uploaded files are read in memory and discarded. Nothing is saved on our servers; your draft lives only in this browser tab until you close it.</p>
                </div>
              </li>
            </ul>
          </div>
        </section>

        <section className="closing">
          <div className="wrap closing-inner">
            <h2 className="display">Your next application deserves a resume written for it.</h2>
            <button className="btn btn-lg closing-btn" onClick={start}>
              Start Your Resume Making Journey →
            </button>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap footer-inner">
          <Logo />
          <p>The optimization score is TailorCV's internal estimate of ATS readiness, not a guarantee of how any specific applicant tracking system will rank you.</p>
        </div>
      </footer>
    </div>
  );
}

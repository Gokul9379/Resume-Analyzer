import { useState, useRef, useEffect, useCallback } from 'react';
import {
  UploadCloud, FileText, X, Mail, Clock3, ScanLine, CheckCircle2,
  AlertCircle, Sparkles, ChevronDown, TrendingUp, Target, ListChecks,
} from 'lucide-react';

const SCAN_MESSAGES = [
  'Reading document structure…',
  'Extracting contact details…',
  'Parsing work history…',
  'Identifying core skills…',
  'Scoring against role…',
];

const SCORE_TONE = {
  high: { fg: '#1F8A5C', bg: '#EAF7EF', ring: '#1F8A5C' },
  mid: { fg: '#B9791F', bg: '#FBF2E3', ring: '#D89B3B' },
  low: { fg: '#B23A32', bg: '#FBEAE8', ring: '#C24A41' },
};

// Priority = how urgently a gap needs fixing, so High priority reads as
// "alert" (red) and Low priority reads as calm (teal), mirroring the score ring's
// color logic in reverse.
const PRIORITY_TONE = {
  High: { fg: '#B23A32', bg: '#FBEAE8', border: '#F0C7C2', dot: '#C24A41' },
  Medium: { fg: '#B9791F', bg: '#FBF2E3', border: '#EAD9B8', dot: '#D89B3B' },
  Low: { fg: '#0C8D89', bg: '#F2FBFA', border: '#CBEEEA', dot: '#0EA5A0' },
};

function toneFor(score) {
  if (score >= 80) return SCORE_TONE.high;
  if (score >= 60) return SCORE_TONE.mid;
  return SCORE_TONE.low;
}

export default function App() {
  const [file, setFile] = useState(null);
  const [jobDescription, setJobDescription] = useState('');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [scanMsgIndex, setScanMsgIndex] = useState(0);
  const [animatedScore, setAnimatedScore] = useState(0);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'improve'
  const [expanded, setExpanded] = useState(() => new Set([0]));
  const fileInputRef = useRef(null);

  // Cycle the scan status messages while a request is in flight
  useEffect(() => {
    if (!loading) return;
    setScanMsgIndex(0);
    const id = setInterval(() => {
      setScanMsgIndex((i) => (i + 1) % SCAN_MESSAGES.length);
    }, 1100);
    return () => clearInterval(id);
  }, [loading]);

  // Animate the score ring in once results land
  useEffect(() => {
    if (!summary || summary.match_score == null) {
      setAnimatedScore(0);
      return;
    }
    setAnimatedScore(0);
    const t = setTimeout(() => setAnimatedScore(summary.match_score), 80);
    return () => clearTimeout(t);
  }, [summary]);

  // Reset the results view whenever a fresh analysis comes back
  useEffect(() => {
    if (summary) {
      setActiveTab('overview');
      setExpanded(new Set([0]));
    }
  }, [summary]);

  const chooseFile = useCallback((f) => {
    if (!f) return;
    if (f.type !== 'application/pdf') {
      setError('Please choose a PDF file.');
      return;
    }
    setError(null);
    setFile(f);
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    chooseFile(e.dataTransfer.files?.[0]);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setSummary(null);

    const formData = new FormData();
    formData.append('file', file);
    if (jobDescription.trim() !== '') {
      formData.append('job_description', jobDescription);
    }

    try {
      // This will use your Render backend URL in production, but keep working locally!
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      
      const res = await fetch(`${API_URL}/upload-resume/`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      const data = await res.json();
      setSummary(data);
    } catch (err) {
      setError('Could not process the resume. Make sure the backend is running, then try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = (idx) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const circumference = 2 * Math.PI * 54;
  const tone = summary?.match_score != null ? toneFor(summary.match_score) : null;
  const dashOffset = tone
    ? circumference - (circumference * Math.min(Math.max(animatedScore, 0), 100)) / 100
    : circumference;

  const improvementAreas = summary?.improvement_areas ?? [];
  const highCount = improvementAreas.filter((a) => a.priority === 'High').length;

  return (
    <div style={styles.page}>
      <style>{`
        @keyframes beamSweep {
          0%   { transform: translateY(-6px); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateY(146px); opacity: 0; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ringDash {
          from { stroke-dashoffset: ${circumference}; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.25; }
        }
        .ra-fade-up { animation: fadeUp 0.5s cubic-bezier(.16,.84,.44,1) both; }
        .ra-drop:hover { border-color: #0EA5A0 !important; background: #F2FBFA !important; }
        .ra-btn:not(:disabled):hover { background: #0C8D89 !important; transform: translateY(-1px); }
        .ra-btn:not(:disabled):active { transform: translateY(0); }
        .ra-remove:hover { background: #F1EEE6 !important; }
        .ra-input:focus-visible, .ra-drop:focus-visible, .ra-btn:focus-visible {
          outline: 2px solid #0EA5A0; outline-offset: 2px;
        }
        .ra-tab:focus-visible, .ra-accordion-head:focus-visible {
          outline: 2px solid #0EA5A0; outline-offset: -2px;
        }
        textarea.ra-input { transition: border-color 0.15s ease; }
        textarea.ra-input:focus { border-color: #0EA5A0 !important; }
        .ra-tab { transition: color 0.15s ease, background 0.15s ease; }
        .ra-tab:hover { color: #0C8D89 !important; }
        .ra-accordion-head { transition: background 0.15s ease; }
        .ra-accordion-head:hover { background: #F7F5EE !important; }
        .ra-chevron { transition: transform 0.2s ease; }
        .ra-accordion-body { transition: grid-template-rows 0.25s ease; display: grid; }
        .ra-skill-chip:hover { transform: translateY(-1px); box-shadow: 0 2px 6px rgba(14,165,160,0.18); }
        .ra-skill-chip { transition: transform 0.15s ease, box-shadow 0.15s ease; }
        @media (prefers-reduced-motion: reduce) {
          .ra-fade-up, [data-beam], [data-ring] { animation: none !important; transition: none !important; }
        }
      `}</style>

      <div style={styles.card}>
        <div style={styles.eyebrow}>
          <ScanLine size={14} strokeWidth={2.5} />
          <span>AUTOMATED RESUME SCAN</span>
        </div>
        <h1 style={styles.h1}>Resume Analyzer</h1>
        <p style={styles.sub}>
          Drop in a PDF resume. Add a job description if you want a match score and tailored improvement tips.
        </p>

        <form onSubmit={handleUpload} style={styles.form}>
          {/* Drop zone */}
          {!file ? (
            <div
              className="ra-drop"
              tabIndex={0}
              role="button"
              aria-label="Upload resume PDF"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              style={{
                ...styles.dropzone,
                borderColor: dragActive ? '#0EA5A0' : '#D8D3C6',
                background: dragActive ? '#F2FBFA' : '#FBFAF6',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={(e) => chooseFile(e.target.files?.[0])}
                style={{ display: 'none' }}
              />
              <div style={styles.dropIconWrap}>
                <UploadCloud size={22} color="#0EA5A0" />
              </div>
              <p style={styles.dropTitle}>Drop your resume here</p>
              <p style={styles.dropSub}>or click to browse — PDF only</p>
            </div>
          ) : (
            <div style={styles.fileRow}>
              <div style={styles.fileRowLeft}>
                <div style={styles.fileIconWrap}>
                  <FileText size={18} color="#0EA5A0" />
                </div>
                <div>
                  <p style={styles.fileName}>{file.name}</p>
                  <p style={styles.fileMeta}>{(file.size / 1024).toFixed(0)} KB · ready to scan</p>
                </div>
              </div>
              <button
                type="button"
                className="ra-remove"
                onClick={() => { setFile(null); setSummary(null); }}
                aria-label="Remove file"
                style={styles.removeBtn}
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* Job description */}
          <div>
            <div style={styles.labelRow}>
              <label htmlFor="jd" style={styles.label}>Job description</label>
              <span style={styles.optionalTag}>optional</span>
            </div>
            <textarea
              id="jd"
              className="ra-input"
              rows={4}
              maxLength={4000}
              placeholder="Paste the role's requirements to generate a match score…"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              style={styles.textarea}
            />
            <p style={styles.charCount}>{jobDescription.length}/4000</p>
          </div>

          {error && (
            <div style={styles.errorBanner} className="ra-fade-up">
              <AlertCircle size={16} color="#B23A32" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            className="ra-btn"
            disabled={loading || !file}
            style={{
              ...styles.submitBtn,
              background: loading || !file ? '#B9C0BE' : '#0EA5A0',
              cursor: loading || !file ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? (
              <>
                <ScanLine size={17} />
                Scanning…
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Analyze resume
              </>
            )}
          </button>
        </form>

        {/* Scanning state */}
        {loading && (
          <div style={styles.scanPanel} className="ra-fade-up">
            <div style={styles.scanDoc} data-beam>
              <div style={styles.scanLineTop} />
              {[...Array(6)].map((_, i) => (
                <div key={i} style={{ ...styles.scanTextLine, width: i % 2 ? '70%' : '92%' }} />
              ))}
              <div style={{ ...styles.beam }} data-beam />
            </div>
            <p style={styles.scanStatus}>
              <span style={{ animation: 'blink 1.2s ease-in-out infinite' }}>●</span>
              {' '}{SCAN_MESSAGES[scanMsgIndex]}
            </p>
          </div>
        )}

        {/* Results */}
        {summary && !loading && (
          <div style={styles.results}>
            <div style={styles.resultHeader} className="ra-fade-up">
              <div>
                <h2 style={styles.name}>{summary.name}</h2>
                <p style={styles.metaLine}><Mail size={13} /> {summary.email}</p>
                <p style={styles.metaLine}><Clock3 size={13} /> {summary.years_of_experience} years of experience</p>
              </div>

              {tone && (
                <div style={styles.ringWrap}>
                  <svg width="120" height="120" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="54" fill="none" stroke="#EDEAE0" strokeWidth="10" />
                    <circle
                      data-ring
                      cx="60" cy="60" r="54" fill="none"
                      stroke={tone.ring}
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={dashOffset}
                      transform="rotate(-90 60 60)"
                      style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.16,.84,.44,1)' }}
                    />
                    <text x="60" y="56" textAnchor="middle" fontSize="24" fontWeight="800" fill={tone.fg} fontFamily="'IBM Plex Mono', monospace">
                      {summary.match_score}
                    </text>
                    <text x="60" y="74" textAnchor="middle" fontSize="10" fill="#8A8578" letterSpacing="1">
                      MATCH %
                    </text>
                  </svg>
                </div>
              )}
            </div>

            {/* Tab switcher */}
            <div style={styles.tabRow} role="tablist" aria-label="Result sections">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'overview'}
                className="ra-tab"
                onClick={() => setActiveTab('overview')}
                style={{
                  ...styles.tabBtn,
                  color: activeTab === 'overview' ? '#0C8D89' : '#8A8578',
                  borderBottomColor: activeTab === 'overview' ? '#0EA5A0' : 'transparent',
                }}
              >
                <ListChecks size={14} />
                Overview
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'improve'}
                className="ra-tab"
                onClick={() => setActiveTab('improve')}
                style={{
                  ...styles.tabBtn,
                  color: activeTab === 'improve' ? '#0C8D89' : '#8A8578',
                  borderBottomColor: activeTab === 'improve' ? '#0EA5A0' : 'transparent',
                }}
              >
                <TrendingUp size={14} />
                Areas to improve
                {improvementAreas.length > 0 && (
                  <span style={styles.tabCount}>{improvementAreas.length}</span>
                )}
              </button>
            </div>

            {activeTab === 'overview' && (
              <div className="ra-fade-up">
                <div style={styles.section}>
                  <p style={styles.sectionLabel}>SUMMARY</p>
                  <p style={styles.summaryText}>{summary.professional_summary}</p>
                </div>

                <div style={styles.section}>
                  <p style={styles.sectionLabel}>SKILLS DETECTED</p>
                  <div style={styles.chipRow}>
                    {summary.top_skills.map((skill, idx) => (
                      <span
                        key={idx}
                        className="ra-fade-up ra-skill-chip"
                        style={{ ...styles.chip, animationDelay: `${60 + idx * 55}ms` }}
                      >
                        <CheckCircle2 size={13} color="#0EA5A0" />
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'improve' && (
              <div className="ra-fade-up">
                {improvementAreas.length === 0 ? (
                  <p style={styles.summaryText}>No specific gaps were flagged — nice and tight resume.</p>
                ) : (
                  <>
                    <div style={styles.improveIntro}>
                      <Target size={15} color="#0C8D89" style={{ flexShrink: 0, marginTop: 2 }} />
                      <p style={styles.improveIntroText}>
                        {highCount > 0
                          ? `${highCount} high-priority gap${highCount > 1 ? 's' : ''} to fix first — tap a card for the specific action.`
                          : 'Tap a card for the specific action to take before your next interview.'}
                      </p>
                    </div>

                    <div style={styles.accordionList}>
                      {improvementAreas.map((item, idx) => {
                        const pt = PRIORITY_TONE[item.priority] ?? PRIORITY_TONE.Medium;
                        const isOpen = expanded.has(idx);
                        return (
                          <div
                            key={idx}
                            className="ra-fade-up"
                            style={{ ...styles.accordionItem, animationDelay: `${idx * 60}ms` }}
                          >
                            <button
                              type="button"
                              className="ra-accordion-head"
                              onClick={() => toggleExpanded(idx)}
                              aria-expanded={isOpen}
                              style={styles.accordionHead}
                            >
                              <span style={{ ...styles.priorityDot, background: pt.dot }} />
                              <span style={styles.accordionTitle}>{item.area}</span>
                              <span style={{ ...styles.priorityTag, color: pt.fg, background: pt.bg, border: `1px solid ${pt.border}` }}>
                                {item.priority}
                              </span>
                              <ChevronDown
                                size={16}
                                className="ra-chevron"
                                color="#8A8578"
                                style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}
                              />
                            </button>
                            <div
                              className="ra-accordion-body"
                              style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
                            >
                              <div style={{ overflow: 'hidden' }}>
                                <div style={styles.accordionBodyInner}>
                                  <p style={styles.improveWhy}>{item.why_it_matters}</p>
                                  <div style={styles.fixRow}>
                                    <span style={styles.fixLabel}>FIX</span>
                                    <p style={styles.fixText}>{item.fix}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#F1EEE6',
    backgroundImage:
      'linear-gradient(#E4E0D3 1px, transparent 1px), linear-gradient(90deg, #E4E0D3 1px, transparent 1px)',
    backgroundSize: '28px 28px',
    padding: '48px 20px',
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  card: {
    maxWidth: 720,
    margin: '0 auto',
    background: '#FFFFFF',
    borderRadius: 16,
    border: '1px solid #E4E0D3',
    boxShadow: '0 1px 2px rgba(28,36,48,0.04), 0 12px 32px rgba(28,36,48,0.06)',
    padding: '36px 36px 40px',
  },
  eyebrow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    color: '#0EA5A0',
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '1.5px',
    marginBottom: 10,
  },
  h1: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 30,
    fontWeight: 700,
    color: '#1C2430',
    margin: '0 0 8px 0',
    letterSpacing: '-0.5px',
  },
  sub: {
    color: '#6B6A5F',
    fontSize: 15,
    lineHeight: 1.55,
    margin: '0 0 28px 0',
    maxWidth: 480,
  },
  form: { display: 'flex', flexDirection: 'column', gap: 20 },
  dropzone: {
    border: '2px dashed #D8D3C6',
    borderRadius: 12,
    padding: '34px 20px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'border-color 0.15s ease, background 0.15s ease',
  },
  dropIconWrap: {
    width: 44, height: 44, borderRadius: 10, background: '#E4F5F3',
    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
  },
  dropTitle: { margin: 0, fontWeight: 600, color: '#1C2430', fontSize: 15 },
  dropSub: { margin: '4px 0 0 0', color: '#8A8578', fontSize: 13 },
  fileRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    border: '1px solid #E4E0D3', borderRadius: 12, padding: '14px 16px', background: '#FBFAF6',
  },
  fileRowLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  fileIconWrap: {
    width: 36, height: 36, borderRadius: 8, background: '#E4F5F3',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  fileName: { margin: 0, fontWeight: 600, fontSize: 14, color: '#1C2430' },
  fileMeta: { margin: '2px 0 0 0', fontSize: 12.5, color: '#8A8578' },
  removeBtn: {
    border: 'none', background: 'transparent', borderRadius: 8, padding: 8,
    cursor: 'pointer', color: '#6B6A5F', display: 'flex',
  },
  labelRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  label: { fontWeight: 600, fontSize: 13.5, color: '#374151' },
  optionalTag: {
    fontSize: 10.5, color: '#8A8578', background: '#F1EEE6', padding: '2px 7px',
    borderRadius: 999, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.5px',
  },
 textarea: {
  width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #D8D3C6',
  resize: 'vertical', fontFamily: 'inherit', fontSize: 14, color: '#FFFFFF',
  background: '#1C2430',           // add this
  boxSizing: 'border-box', outline: 'none',
},
  charCount: { margin: '4px 2px 0 0', fontSize: 11.5, color: '#B0AB9C', textAlign: 'right' },
  errorBanner: {
    display: 'flex', alignItems: 'center', gap: 8, background: '#FBEAE8',
    border: '1px solid #F0C7C2', color: '#B23A32', fontSize: 13.5,
    padding: '10px 14px', borderRadius: 10,
  },
  submitBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    color: 'white', padding: '14px', borderRadius: 10, border: 'none',
    fontWeight: 700, fontSize: 15, transition: 'background-color 0.15s ease, transform 0.1s ease',
  },
  scanPanel: {
    marginTop: 28, borderTop: '1px solid #EEEBE1', paddingTop: 26,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
  },
  scanDoc: {
    position: 'relative', width: 200, height: 150, background: '#FBFAF6',
    border: '1px solid #E4E0D3', borderRadius: 8, padding: '16px 18px',
    overflow: 'hidden', boxShadow: '0 1px 2px rgba(28,36,48,0.05)',
  },
  scanLineTop: { display: 'none' },
  scanTextLine: { height: 6, background: '#E4E0D3', borderRadius: 3, marginBottom: 10 },
  beam: {
    position: 'absolute', left: 0, right: 0, height: 3,
    background: 'linear-gradient(90deg, transparent, #0EA5A0, transparent)',
    boxShadow: '0 0 10px 1px #0EA5A0',
    animation: 'beamSweep 1.8s ease-in-out infinite',
  },
  scanStatus: {
    display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12.5, color: '#5B6472', letterSpacing: '0.2px',
  },
  results: { marginTop: 30, borderTop: '1px solid #EEEBE1', paddingTop: 28 },
  resultHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    flexWrap: 'wrap', gap: 20, marginBottom: 22,
  },
  name: { margin: '0 0 6px 0', fontSize: 22, fontWeight: 700, color: '#1C2430' },
  metaLine: { display: 'flex', alignItems: 'center', gap: 6, margin: '4px 0 0 0', color: '#5B6472', fontSize: 13.5 },
  ringWrap: { flexShrink: 0 },
  tabRow: {
    display: 'flex', gap: 4, borderBottom: '1px solid #EEEBE1', marginBottom: 22,
  },
  tabBtn: {
    display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none',
    borderBottom: '2px solid transparent', padding: '0 4px 12px 4px', marginRight: 20,
    fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  },
  tabCount: {
    fontSize: 10.5, fontWeight: 700, background: '#0EA5A0', color: 'white',
    borderRadius: 999, padding: '1px 6px', fontFamily: "'IBM Plex Mono', monospace",
  },
  section: { marginBottom: 22 },
  sectionLabel: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 600,
    letterSpacing: '1.2px', color: '#0EA5A0', margin: '0 0 8px 0',
  },
  summaryText: { margin: 0, color: '#3F4650', lineHeight: 1.65, fontSize: 14.5 },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: {
    display: 'flex', alignItems: 'center', gap: 6, background: '#F2FBFA',
    color: '#0C8D89', border: '1px solid #CBEEEA', padding: '6px 12px 6px 10px',
    borderRadius: 999, fontSize: 13, fontWeight: 600,
  },
  improveIntro: {
    display: 'flex', gap: 8, background: '#F2FBFA', border: '1px solid #CBEEEA',
    borderRadius: 10, padding: '10px 14px', marginBottom: 16,
  },
  improveIntroText: { margin: 0, fontSize: 13.5, color: '#0C6E6B', lineHeight: 1.5 },
  accordionList: { display: 'flex', flexDirection: 'column', gap: 10 },
  accordionItem: {
    border: '1px solid #E4E0D3', borderRadius: 12, overflow: 'hidden', background: '#FBFAF6',
  },
  accordionHead: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px',
    background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
  },
  priorityDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  accordionTitle: { flex: 1, fontSize: 14, fontWeight: 600, color: '#1C2430' },
  priorityTag: {
    fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
    fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.3px', flexShrink: 0,
  },
  accordionBodyInner: { padding: '0 14px 16px 32px' },
  improveWhy: { margin: '0 0 12px 0', fontSize: 13.5, color: '#5B6472', lineHeight: 1.6 },
  fixRow: {
    display: 'flex', gap: 10, background: '#FFFFFF', border: '1px solid #E4E0D3',
    borderRadius: 8, padding: '10px 12px', alignItems: 'flex-start',
  },
  fixLabel: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700,
    color: '#0EA5A0', letterSpacing: '0.5px', paddingTop: 2, flexShrink: 0,
  },
  fixText: { margin: 0, fontSize: 13.5, color: '#1C2430', lineHeight: 1.55, fontWeight: 500 },
};
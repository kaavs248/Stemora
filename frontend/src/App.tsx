
import { useEffect, useState } from 'react';
import AuthScreen from './AuthScreen';
import {
  apiGet,
  apiPatch,
  getMe,
  getToken,
  logout,
  type AuthUser,
} from './lib/api';
import './App.css';

const features = [
  {
    number: '01',
    title: 'Biological traceability',
    description:
      'Follow sample lifecycle events through a structured, auditable record.',
    icon: '↗',
  },
  {
    number: '02',
    title: 'Consent by design',
    description:
      'Keep donor permissions central to decisions about research access.',
    icon: '◇',
  },
  {
    number: '03',
    title: 'Governed research',
    description:
      'Support controlled access requests with explicit review workflows.',
    icon: '⇄',
  },
  {
    number: '04',
    title: 'Blockchain integrity',
    description:
      'Anchor supported events on-chain while keeping sensitive records off-chain.',
    icon: '⌘',
  },
];

const navigation = [
  'Overview',
  'Sample Inventory',
  'Donors',
  'Consent Management',
  'Access Requests',
  'Lifecycle Tracking',
  'Audit Trail',
];

const navIcons = ['◈', '▤', '♙', '◇', '⇄', '⌁', '◎'];

interface SampleRecord {
  id?: string;
  sampleCode?: string;
  sampleType?: string;
  currentStatus?: string;
  storageLocation?: string;
}

interface AccessRequestRecord {
  id?: string;
  status?: string;
  purpose?: string;
  sample?: {
    sampleCode?: string;
    sampleType?: string;
  };
  researcher?: {
    user?: {
      email?: string;
    };
    organization?: {
      name?: string;
    };
  };
  decisionReason?: string | null;
  reviewedAt?: string | null;
}

function App() {
  const [view, setView] = useState<'home' | 'auth' | 'workspace'>('home');
  const [activePage, setActivePage] = useState('Overview');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  const [samples, setSamples] = useState<SampleRecord[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequestRecord[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState('');
  const [reviewNotice, setReviewNotice] = useState('');

  // Restore an existing authenticated session on page refresh.
  useEffect(() => {
    let active = true;

    async function restoreSession() {
      if (!getToken()) {
        if (active) setAuthChecking(false);
        return;
      }

      try {
        const currentUser = await getMe();

        if (active) {
          setUser(currentUser);
          setView('workspace');
        }
      } catch {
        logout();

        if (active) {
          setUser(null);
          setView('home');
        }
      } finally {
        if (active) setAuthChecking(false);
      }
    }

    void restoreSession();

    return () => {
      active = false;
    };
  }, []);

  // Load live sample and access-request data using the existing API.
  useEffect(() => {
    if (view !== 'workspace' || !user) return;

    let active = true;

    async function loadDashboard() {
      setDashboardLoading(true);
      setDashboardError('');

      try {
        const samplePromise = apiGet<SampleRecord[]>('/samples');

        const accessPromise =
          user?.role === 'DONOR'
            ? Promise.resolve(null)
            : apiGet<AccessRequestRecord[]>('/access-requests');

        const [sampleResult, accessResult] = await Promise.all([
          samplePromise,
          accessPromise,
        ]);

        if (!active) return;

        if (!Array.isArray(sampleResult)) {
          throw new Error('The sample API returned an unexpected response.');
        }

        setSamples(sampleResult);

        if (accessResult === null) {
          setAccessRequests([]);
        } else if (Array.isArray(accessResult)) {
          setAccessRequests(accessResult);
        } else {
          throw new Error(
            'The access-request API returned an unexpected response.',
          );
        }
      } catch (error) {
        if (active) {
          setDashboardError(
            error instanceof Error
              ? error.message
              : 'Unable to load dashboard data.',
          );
        }
      } finally {
        if (active) setDashboardLoading(false);
      }
    }

    void loadDashboard();

    return () => {
      active = false;
    };
  }, [view, user, refreshKey]);

  const handleReview = async (
    request: AccessRequestRecord,
    decision: 'approve' | 'reject',
  ) => {
    if (!request.id || user?.role !== 'ADMIN' || request.status !== 'PENDING') {
      return;
    }

    const actionLabel = decision === 'approve' ? 'approve' : 'reject';
    const confirmed = window.confirm(
      `Are you sure you want to ${actionLabel} this access request?`,
    );

    if (!confirmed) return;

    setReviewingRequestId(request.id);
    setReviewError('');
    setReviewNotice('');

    try {
      const decisionReason = (reviewReasons[request.id] ?? '').trim();

      const result = await apiPatch<{
        message?: string;
        accessRequest?: AccessRequestRecord;
      }>(`/access-requests/${request.id}/${decision}`, { decisionReason });

      setReviewNotice(
        result.message ??
          `Access request ${decision === 'approve' ? 'approved' : 'rejected'} successfully.`,
      );
      setReviewReasons((current) => {
        const next = { ...current };
        delete next[request.id!];
        return next;
      });
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setReviewError(
        error instanceof Error
          ? error.message
          : 'Unable to review this access request.',
      );
    } finally {
      setReviewingRequestId(null);
    }
  };

  const enterWorkspace = () => {
    setView(user ? 'workspace' : 'auth');
  };

  const handleAuthenticated = (authenticatedUser: AuthUser) => {
    setUser(authenticatedUser);
    setActivePage('Overview');
    setDashboardError('');
    setView('workspace');
  };

  const handleLogout = () => {
    logout();
    setUser(null);
    setSamples([]);
    setAccessRequests([]);
    setActivePage('Overview');
    setDashboardError('');
    setReviewError('');
    setReviewNotice('');
    setView('home');
  };

  const pendingAccessCount = accessRequests.filter(
    (request) => request.status === 'PENDING',
  ).length;

  if (authChecking) {
    return (
      <div className="auth-loading">
        <span className="brand-symbol">S</span>
        <p>Preparing your STEMORA workspace…</p>
      </div>
    );
  }

  if (view === 'auth') {
    return (
      <AuthScreen
        onAuthenticated={handleAuthenticated}
        onBack={() => setView('home')}
      />
    );
  }

  if (view === 'workspace') {
    return (
      <div className="workspace-shell">
        <aside className="workspace-sidebar">
          <button
            className="brand brand-button"
            onClick={() => setView('home')}
            type="button"
          >
            <span className="brand-symbol">S</span>
            <span>
              <strong>STEMORA</strong>
              <small>STEM CELL BANK</small>
            </span>
          </button>

          <div className="sidebar-label">WORKSPACE</div>

          {navigation.map((item, index) => (
            <button
              key={item}
              type="button"
              className={`workspace-nav ${
                activePage === item ? 'selected' : ''
              }`}
              onClick={() => setActivePage(item)}
            >
              <span>{navIcons[index]}</span>
              {item}
            </button>
          ))}

          <div className="sidebar-bottom">
            <span className="online-dot" />
            <span className="sidebar-user">
              <strong>{user?.role ?? 'USER'}</strong>
              <small>{user?.email ?? 'Signed-in user'}</small>
              <button
                className="text-link"
                onClick={handleLogout}
                type="button"
              >
                Sign out
              </button>
            </span>
          </div>
        </aside>

        <main className="workspace-main">
          <header className="workspace-topbar">
            <span>
              Workspace <i>/</i> {activePage}
            </span>
            <button
              className="text-link"
              onClick={() => setView('home')}
              type="button"
            >
              ← Back to website
            </button>
          </header>

          <section className="workspace-content">
            <div className="section-kicker">
              STEM CELL BANK MANAGEMENT
            </div>

            <h1>
              {activePage === 'Overview'
                ? 'Your research, in perspective.'
                : activePage}
            </h1>

            <p className="workspace-intro">
              A centralized view of biological samples, donor consent and
              research access.
            </p>

            {dashboardError && (
              <div className="workspace-error" role="alert">
                <p>{dashboardError}</p>
                <button
                  className="text-link"
                  onClick={() => setRefreshKey((current) => current + 1)}
                  type="button"
                >
                  Retry loading
                </button>
              </div>
            )}

            {activePage === 'Overview' ? (
              <>
                <div className="workspace-metrics">
                  {[
                    [
                      'SAMPLES',
                      dashboardLoading && samples.length === 0
                        ? '…'
                        : dashboardError && samples.length === 0
                          ? '—'
                          : String(samples.length),
                      'Registered inventory',
                    ],
                    [
                      'CONSENT',
                      '—',
                      'Summary endpoint not available',
                    ],
                    [
                      'PENDING ACCESS',
                      dashboardLoading && accessRequests.length === 0
                        ? '…'
                        : user?.role === 'DONOR'
                          ? 'N/A'
                          : String(pendingAccessCount),
                      user?.role === 'RESEARCHER'
                        ? 'Your access requests'
                        : 'Requests awaiting review',
                    ],
                    [
                      'ACCOUNT',
                      user?.role ?? '—',
                      'Authenticated account',
                    ],
                  ].map(([label, value, caption]) => (
                    <article className="workspace-metric" key={label}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                      <small>{caption}</small>
                    </article>
                  ))}
                </div>

                <div className="workspace-panels">
                  <article className="workspace-panel">
                    <span className="section-kicker">
                      BIOLOGICAL ASSETS
                    </span>
                    <h2>Sample inventory</h2>
                    <p>
                      View registered samples and their current lifecycle
                      status from the STEMORA database.
                    </p>
                    <button
                      className="dark-button"
                      onClick={() => setActivePage('Sample Inventory')}
                      type="button"
                    >
                      Explore inventory →
                    </button>
                  </article>

                  <article className="workspace-panel">
                    <span className="section-kicker">
                      TRUST & GOVERNANCE
                    </span>
                    <h2>Research with accountability.</h2>
                    <p>
                      Review access requests and their current approval
                      status.
                    </p>
                    <button
                      className="dark-button"
                      onClick={() => setActivePage('Access Requests')}
                      type="button"
                    >
                      Explore access →
                    </button>
                  </article>
                </div>

                <p className="preview-disclaimer">
                  Sample and access counts come from the authenticated API.
                  Consent summary is not connected.
                </p>
              </>
            ) : activePage === 'Sample Inventory' ? (
              <section className="workspace-panel section-view">
                <span className="section-kicker">BIOLOGICAL ASSETS</span>
                <h2>Registered samples</h2>

                {dashboardLoading ? (
                  <p>Loading sample inventory…</p>
                ) : samples.length === 0 ? (
                  <p>
                    No samples are available to display, or the API returned
                    an empty inventory.
                  </p>
                ) : (
                  <div className="data-table-wrap">
                    <table className="workspace-data-table">
                      <thead>
                        <tr>
                          <th>Sample code</th>
                          <th>Sample type</th>
                          <th>Status</th>
                          <th>Storage location</th>
                        </tr>
                      </thead>
                      <tbody>
                        {samples.map((sample, index) => (
                          <tr key={sample.id ?? sample.sampleCode ?? index}>
                            <td>{sample.sampleCode ?? '—'}</td>
                            <td>{sample.sampleType ?? '—'}</td>
                            <td>{sample.currentStatus ?? '—'}</td>
                            <td>{sample.storageLocation ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <button
                  className="dark-button"
                  onClick={() => setActivePage('Overview')}
                  type="button"
                >
                  ← Return to overview
                </button>
              </section>
            ) : activePage === 'Access Requests' ? (
              <section className="workspace-panel section-view">
                <span className="section-kicker">RESEARCH GOVERNANCE</span>
                <h2>Access requests</h2>

                {reviewError && (
                  <div className="workspace-error review-feedback" role="alert">
                    <p>{reviewError}</p>
                    <button
                      className="text-link"
                      type="button"
                      onClick={() => setReviewError('')}
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {reviewNotice && (
                  <div className="review-success" role="status">
                    <p>{reviewNotice}</p>
                    <button
                      className="text-link"
                      type="button"
                      onClick={() => setReviewNotice('')}
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {user?.role === 'DONOR' ? (
                  <p>
                    Access-request listing is not available for donor
                    accounts through the current API.
                  </p>
                ) : dashboardLoading ? (
                  <p>Loading access requests…</p>
                ) : accessRequests.length === 0 ? (
                  <p>No access requests are available to display.</p>
                ) : (
                  <div className="data-table-wrap">
                    <table className="workspace-data-table">
                      <thead>
                        <tr>
                          <th>Sample</th>
                          <th>Researcher</th>
                          <th>Purpose</th>
                          <th>Status</th>
                          <th>Decision details</th>
                          {user?.role === 'ADMIN' && <th>Review</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {accessRequests.map((request, index) => (
                          <tr key={request.id ?? index}>
                            <td>
                              {request.sample?.sampleCode ??
                                request.sample?.sampleType ??
                                '—'}
                            </td>
                            <td>
                              {request.researcher?.user?.email ??
                                request.researcher?.organization?.name ??
                                '—'}
                            </td>
                            <td className="request-purpose">
                              {request.purpose ?? '—'}
                            </td>
                            <td>
                              <span
                                className={`request-status status-${(
                                  request.status ?? 'unknown'
                                ).toLowerCase()}`}
                              >
                                {request.status ?? 'UNKNOWN'}
                              </span>
                            </td>
                            <td>
                              {request.decisionReason ??
                                (request.reviewedAt
                                  ? `Reviewed ${new Date(
                                      request.reviewedAt,
                                    ).toLocaleDateString()}`
                                  : 'Awaiting review')}
                            </td>
                            {user?.role === 'ADMIN' && (
                              <td className="request-review-cell">
                                {request.status === 'PENDING' && request.id ? (
                                  <div className="request-review-controls">
                                    <textarea
                                      className="review-reason-input"
                                      rows={2}
                                      maxLength={1000}
                                      placeholder="Optional decision reason"
                                      aria-label={`Decision reason for request ${request.id}`}
                                      value={reviewReasons[request.id] ?? ''}
                                      disabled={reviewingRequestId === request.id}
                                      onChange={(event) =>
                                        setReviewReasons((current) => ({
                                          ...current,
                                          [request.id!]: event.target.value,
                                        }))
                                      }
                                    />
                                    <div className="review-action-row">
                                      <button
                                        className="review-approve-button"
                                        type="button"
                                        disabled={reviewingRequestId !== null}
                                        onClick={() =>
                                          void handleReview(request, 'approve')
                                        }
                                      >
                                        {reviewingRequestId === request.id
                                          ? 'Processing…'
                                          : 'Approve'}
                                      </button>
                                      <button
                                        className="review-reject-button"
                                        type="button"
                                        disabled={reviewingRequestId !== null}
                                        onClick={() =>
                                          void handleReview(request, 'reject')
                                        }
                                      >
                                        {reviewingRequestId === request.id
                                          ? 'Processing…'
                                          : 'Reject'}
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="review-complete">
                                    No action available
                                  </span>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <button
                  className="dark-button"
                  onClick={() => setActivePage('Overview')}
                  type="button"
                >
                  ← Return to overview
                </button>
              </section>
            ) : (
              <article className="workspace-panel section-view">
                <span className="brand-symbol">S</span>
                <h2>{activePage}</h2>
                <p>
                  This section is not yet connected to a dedicated live
                  data view. The existing backend routes will be integrated
                  next.
                </p>
                <button
                  className="dark-button"
                  onClick={() => setActivePage('Overview')}
                  type="button"
                >
                  Return to overview
                </button>
              </article>
            )}
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <button
          className="brand brand-button"
          onClick={() =>
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }
          type="button"
          aria-label="STEMORA home"
        >
          <span className="brand-symbol">S</span>
          <span>
            <strong>STEMORA</strong>
            <small>STEM CELL BANK</small>
          </span>
        </button>

        <nav className="site-nav">
          <a href="#approach">Our approach</a>
          <a href="#platform">Platform</a>
          <a href="#trust">Trust & integrity</a>
        </nav>

        <button
          className="header-cta"
          onClick={enterWorkspace}
          type="button"
        >
          {user ? 'Open workspace' : 'Sign in'} <span>↗</span>
        </button>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <div className="hero-eyebrow">
              <span /> BIOLOGY, RESPONSIBLY CONNECTED
            </div>

            <h1>
              Protecting
              <br />
              <span>potential.</span>
              <br />
              Enabling discovery.
            </h1>

            <p className="hero-description">
              A connected approach to stem cell banking, where sample
              traceability, donor consent and accountable research work
              together.
            </p>

            <div className="hero-actions">
              <button
                className="primary-cta"
                onClick={enterWorkspace}
                type="button"
              >
                {user ? 'Open STEMORA' : 'Explore STEMORA'} <span>↗</span>
              </button>

              <a className="secondary-cta" href="#approach">
                Discover our approach <span>↓</span>
              </a>
            </div>

            <div className="hero-footnote">
              <span className="footnote-line" />
              TRACEABILITY <span>·</span> CONSENT <span>·</span> INTEGRITY
            </div>
          </div>

          <div
            className="science-visual"
            aria-label="Abstract scientific illustration representing interconnected biological systems"
          >
            <div className="visual-label visual-label-top">
              <span /> SYSTEMS IN HARMONY
            </div>
            <div className="science-glow" />
            <div className="science-ring ring-a" />
            <div className="science-ring ring-b" />
            <div className="science-ring ring-c" />

            <div className="science-core">
              <span className="core-letter">S</span>
              <span className="core-caption">STEMORA</span>
            </div>

            {Array.from({ length: 12 }, (_, i) => (
              <span
                key={i}
                className="orbit-point"
                style={{ '--i': i } as React.CSSProperties}
              />
            ))}

            <div className="visual-note note-left">
              <span className="note-glyph">◇</span>
              <span>
                <strong>Consent first</strong>
                <small>Purpose-aware access</small>
              </span>
            </div>

            <div className="visual-note note-right">
              <span className="note-glyph">⌘</span>
              <span>
                <strong>Verifiable events</strong>
                <small>Blockchain-backed records</small>
              </span>
            </div>

            <div className="visual-label visual-label-bottom">
              DESIGNED AROUND TRUST <span>✳</span>
            </div>
          </div>

          <div className="hero-vertical-text">
            A MORE ACCOUNTABLE BIOBANKING ECOSYSTEM
          </div>
        </section>

        <section className="principles-strip" id="approach">
          <div>
            <span className="principle-number">01</span>
            <span>
              <strong>Trace every transition</strong>
              <small>Structured lifecycle records</small>
            </span>
          </div>
          <div>
            <span className="principle-number">02</span>
            <span>
              <strong>Respect every consent</strong>
              <small>Permission-aware workflows</small>
            </span>
          </div>
          <div>
            <span className="principle-number">03</span>
            <span>
              <strong>Record what matters</strong>
              <small>Auditable system events</small>
            </span>
          </div>
        </section>

        <section className="platform-section" id="platform">
          <div className="section-intro">
            <div>
              <div className="section-kicker">THE STEMORA APPROACH</div>
              <h2>
                More than storage.
                <br />
                <span>A system built on trust.</span>
              </h2>
            </div>
            <p>
              Responsible stem cell banking needs more than inventory.
              STEMORA brings together traceability, consent-aware access
              and an auditable record of important events.
            </p>
          </div>

          <div className="feature-grid">
            {features.map((feature) => (
              <article className="feature-card" key={feature.number}>
                <div className="feature-card-top">
                  <span>{feature.number}</span>
                  <span className="feature-card-icon">{feature.icon}</span>
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
                <span className="feature-rule" />
              </article>
            ))}
          </div>
        </section>

        <section className="trust-section" id="trust">
          <div className="trust-ornament">
            <span>S</span>
            <i />
            <i />
            <i />
          </div>

          <div className="trust-copy">
            <div className="section-kicker">BUILT FOR ACCOUNTABILITY</div>
            <h2>
              Keep sensitive data
              <br />
              private. Make events
              <br />
              <span>verifiable.</span>
            </h2>
            <p>
              STEMORA's architecture is designed to keep sensitive
              information off-chain while using blockchain for supported
              integrity and audit operations.
            </p>
            <button
              className="light-cta"
              onClick={enterWorkspace}
              type="button"
            >
              Explore the workspace <span>↗</span>
            </button>
          </div>

          <div className="trust-details">
            <div>
              <span>01</span>
              <p>
                <strong>Off-chain records</strong>
                <small>
                  Application and database records hold operational
                  information.
                </small>
              </p>
            </div>
            <div>
              <span>02</span>
              <p>
                <strong>Consent-aware decisions</strong>
                <small>
                  Access workflows consider permissions and policy checks.
                </small>
              </p>
            </div>
            <div>
              <span>03</span>
              <p>
                <strong>Blockchain audit support</strong>
                <small>
                  Selected events can be recorded and verified on-chain.
                </small>
              </p>
            </div>
          </div>
        </section>

        <section className="closing-section">
          <div className="section-kicker">
            THE NEXT CHAPTER IN RESPONSIBLE BIOBANKING
          </div>
          <h2>Make every sample count.</h2>
          <p>
            Explore the STEMORA platform and its connected workflows.
          </p>
          <button
            className="primary-cta"
            onClick={enterWorkspace}
            type="button"
          >
            Enter STEMORA <span>↗</span>
          </button>
        </section>
      </main>

      <footer className="site-footer">
        <button
          className="brand brand-button"
          onClick={() =>
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }
          type="button"
        >
          <span className="brand-symbol">S</span>
          <span>
            <strong>STEMORA</strong>
            <small>STEM CELL BANK</small>
          </span>
        </button>

        <p>Traceability. Consent. Integrity.</p>
        <span>© STEMORA · Prototype</span>
      </footer>
    </div>
  );
}

export default App;

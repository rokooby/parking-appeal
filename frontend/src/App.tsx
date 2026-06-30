import { useEffect, useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { formatEther, parseEther } from "viem";
import {
  Ticket,
  Gavel,
  Scales,
  Coins,
  Wallet,
  PaperPlaneRight,
  FileArrowUp,
  SealCheck,
  ArrowClockwise,
  ArrowUUpLeft,
  WarningCircle,
  CaretRight,
  Receipt,
} from "@phosphor-icons/react";
import {
  fileAppeal,
  issuerRespond,
  adjudicate,
  settle,
  requestRehearing,
  withdrawAppeal,
  getAppeal,
  getCounts,
  getPoolBalance,
  listAll,
  VIOLATIONS,
  AppealView,
  AppealRow,
} from "./contractService";
import { Aurora } from "./Aurora";

type Hex = `0x${string}`;

const STATUS_LABEL = ["FILED", "ANSWERED", "RULED", "SETTLED"];

function shortAddr(a: string): string {
  return a && a.length > 12 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a || "anonymous";
}

function gen(wei: string): string {
  try {
    const v = formatEther(BigInt(wei || "0"));
    return v.includes(".") ? v.replace(/0+$/, "").replace(/\.$/, "") : v;
  } catch {
    return "0";
  }
}

function vioLabel(v: string): string {
  return (v || "").replace(/_/g, " ").toLowerCase();
}

// Bespoke Ticketless mark: a geometric ticket stub with perforation and a stamped check.
function TicketMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="tk-grad" x1="6" y1="8" x2="34" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#cba6f7" />
          <stop offset="1" stopColor="#b48af0" />
        </linearGradient>
        <mask id="tk-notch">
          <rect x="5" y="9" width="30" height="22" rx="5" fill="#fff" />
          <circle cx="24" cy="9" r="2.6" fill="#000" />
          <circle cx="24" cy="31" r="2.6" fill="#000" />
        </mask>
      </defs>
      <rect x="5" y="9" width="30" height="22" rx="5" fill="url(#tk-grad)" mask="url(#tk-notch)" />
      <g stroke="#1e1e2e" strokeWidth="1.2" strokeLinecap="round" opacity="0.85">
        <line x1="24" y1="13.4" x2="24" y2="15.2" />
        <line x1="24" y1="17.6" x2="24" y2="19.4" />
        <line x1="24" y1="21.8" x2="24" y2="23.6" />
        <line x1="24" y1="25.6" x2="24" y2="27.4" />
      </g>
      <path d="M11.5 20.4 l3 3 L20 16.6" stroke="#1e1e2e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function ResBadge({ resolution }: { resolution: string }) {
  const r = resolution || "PENDING";
  return <span className={`badge res-${(resolution || "pending").toLowerCase()}`}>{r}</span>;
}

function TicketCard({
  row,
  selected,
  onPick,
}: {
  row: AppealRow;
  selected: boolean;
  onPick: (id: number) => void;
}) {
  const res = (row.resolution || "pending").toLowerCase();
  const dueWei = row.status >= 2 ? row.payableFineWei : row.fineWei;
  return (
    <article
      className={`ticket res-${res} ${selected ? "is-sel" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`Appeal ${row.citationRef}, status ${STATUS_LABEL[row.status]}, ${row.resolution || "pending"}`}
      onClick={() => onPick(row.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick(row.id);
        }
      }}
    >
      <div className="ticket__main">
        <div className="ticket__top">
          <span className="ticket__tag">
            <Receipt size={14} weight="fill" /> {vioLabel(row.violationType) || "violation notice"}
          </span>
          <ResBadge resolution={row.resolution} />
        </div>
        <div className="ticket__cite">{row.citationRef || `Appeal #${row.id}`}</div>
        <div className="ticket__grid">
          <div className="ticket__cell">
            <span>FINE</span>
            <b>{gen(row.fineWei !== "0" ? row.fineWei : row.payableFineWei)} GEN</b>
          </div>
          <div className="ticket__cell">
            <span>{row.status >= 2 ? "PAYABLE" : "STAKE"}</span>
            <b className="hot">{gen(dueWei)} GEN</b>
          </div>
        </div>
        <div className="ticket__foot">
          <span className={`chip status-${row.status}`}>{STATUS_LABEL[row.status]}</span>
          <span className="ticket__addr">appellant {shortAddr(row.appellant)}</span>
          {row.reheard && <span className="chip demo-chip">REHEARD</span>}
        </div>
      </div>
      <div className="ticket__stub" aria-hidden="true">
        <span className="stub__no">NO.</span>
        <span className="stub__id">{String(row.id).padStart(4, "0")}</span>
        <span className="stub__bars" />
        <span className="stub__esc">MERIT {row.meritScore || 0}</span>
      </div>
    </article>
  );
}

export function App() {
  const { address, isConnected } = useAccount();
  const acct = address as Hex | undefined;

  const [showForm, setShowForm] = useState(false);
  const [violationType, setViolationType] = useState<string>(VIOLATIONS[0]);
  const [citationRef, setCitationRef] = useState("");
  const [citationText, setCitationText] = useState("");
  const [appellantEvidence, setAppellantEvidence] = useState("");
  const [fine, setFine] = useState("");
  const [stake, setStake] = useState("");

  const [issuerEvidence, setIssuerEvidence] = useState("");
  const [supplementary, setSupplementary] = useState("");

  const [rows, setRows] = useState<AppealRow[]>([]);
  const [counts, setCounts] = useState({ nextAppealId: 0, ruled: 0, dismissed: 0, reduced: 0, upheld: 0, poolBalance: "0" });
  const [pool, setPool] = useState("0");
  const [selId, setSelId] = useState<number | null>(null);
  const [sel, setSel] = useState<AppealView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [netErr, setNetErr] = useState(false);
  const [loading, setLoading] = useState(true);

  async function refreshAll() {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const [c, p, l] = await Promise.all([getCounts(), getPoolBalance(), listAll(80)]);
      setCounts(c);
      setPool(p);
      setRows(l);
      if (selId != null) {
        try {
          setSel(await getAppeal(selId));
        } catch {
          /* keep previous */
        }
      }
      setNetErr(false);
    } catch {
      setNetErr(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
    const t = setInterval(refreshAll, 12000);
    const onVis = () => {
      if (!document.hidden) refreshAll();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pick(id: number) {
    setShowForm(false);
    setSelId(id);
    try {
      setSel(await getAppeal(id));
    } catch {
      setSel(null);
    }
  }

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(label);
    setNote("");
    try {
      return await fn();
    } catch (e) {
      setNote(String((e as Error).message || e).slice(0, 220));
      return undefined;
    } finally {
      setBusy(null);
      refreshAll();
    }
  }

  function validAmount(v: string): boolean {
    try {
      return parseEther(v.trim()) > 0n;
    } catch {
      return false;
    }
  }

  async function onSubmit() {
    if (!acct) return setNote("Connect a wallet to file an appeal.");
    if (!validAmount(fine)) return setNote("Enter the fine amount in GEN, for example 1.5.");
    if (!validAmount(stake)) return setNote("Stake escrow must be greater than 0 GEN.");
    if (citationText.trim().length < 20) return setNote("Citation text must be at least 20 characters.");
    if (appellantEvidence.trim().length < 20) return setNote("Your evidence must be at least 20 characters.");
    const id = await run("Filing appeal", () =>
      fileAppeal(acct, {
        violationType,
        citationRef,
        citationText,
        appellantEvidence,
        fineWei: parseEther(fine.trim()),
        stakeWei: parseEther(stake.trim()),
      }),
    );
    if (id != null) {
      setCitationRef("");
      setCitationText("");
      setAppellantEvidence("");
      setFine("");
      setStake("");
      setShowForm(false);
      setSelId(id);
      try {
        setSel(await getAppeal(id));
      } catch {
        /* will refresh */
      }
    }
  }

  async function onIssuerRespond() {
    if (!acct || selId == null) return;
    if (issuerEvidence.trim().length < 20) return setNote("Issuer evidence must be at least 20 characters.");
    await run("Filing issuer response", () => issuerRespond(acct, selId, issuerEvidence));
    setIssuerEvidence("");
  }
  async function onAdjudicate() {
    if (!acct || selId == null) return;
    await run("The tribunal is adjudicating", () => adjudicate(acct, selId));
  }
  async function onSettle() {
    if (!acct || selId == null) return;
    await run("Settling the appeal", () => settle(acct, selId));
  }
  async function onRehearing() {
    if (!acct || selId == null) return;
    if (supplementary.trim().length < 20) return setNote("Supplementary statement must be at least 20 characters.");
    await run("Requesting a rehearing", () => requestRehearing(acct, selId, supplementary));
    setSupplementary("");
  }
  async function onWithdraw() {
    if (!acct || selId == null) return;
    await run("Withdrawing the appeal", () => withdrawAppeal(acct, selId));
  }

  const stats = useMemo(
    () => [
      { icon: <Ticket size={18} weight="duotone" />, cap: "Appeals filed", val: String(counts.nextAppealId) },
      { icon: <Gavel size={18} weight="duotone" />, cap: "Ruled", val: String(counts.ruled) },
      { icon: <Scales size={18} weight="duotone" />, cap: "Dismissed", val: String(counts.dismissed) },
      { icon: <Wallet size={18} weight="duotone" />, cap: "Procedure pool", val: `${gen(pool)} GEN` },
    ],
    [counts, pool],
  );

  const isAppellant = !!sel && !!acct && sel.appellant.toLowerCase() === acct.toLowerCase();

  return (
    <div className="page">
      <header className="nav">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <TicketMark size={28} />
          </span>
          <span className="brand__name">Ticketless</span>
          <span className="brand__sep">/</span>
          <span className="brand__sub">the appeal tribunal</span>
        </div>
        <div className="nav__right">
          <span className={`pulse ${netErr ? "off" : ""}`}>
            <i /> {netErr ? "reconnecting" : "studionet live"}
          </span>
          <ConnectButton showBalance={false} chainStatus="none" accountStatus="address" />
        </div>
      </header>

      <section className="hero">
        <div className="hero__bg">
          <Aurora className="hero__canvas" />
        </div>
        <div className="hero__inner">
          <span className="kicker">
            <SealCheck size={15} weight="fill" /> GenLayer parking appeal tribunal
          </span>
          <h1 className="hero__title">
            Contest the citation.
            <br />
            Let <span className="grad">the tribunal</span> rule.
          </h1>
          <p className="hero__lead">
            File an appeal against a parking fine and stake escrow above it. The issuer may answer with their
            own evidence, then GenLayer validators adjudicate against on-chain precedent: upheld, reduced, or
            dismissed. Settle to release the payout and refund.
          </p>
          <div className="hero__cta">
            <button
              className="btn btn--primary"
              onClick={() => {
                setShowForm(true);
                setSelId(null);
                setSel(null);
                const el = document.getElementById("desk");
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              <FileArrowUp size={18} weight="bold" /> File an appeal
            </button>
            <a className="btn btn--ghost" href="#desk">
              Browse the docket <CaretRight size={16} weight="bold" />
            </a>
          </div>
          <div className="stats">
            {stats.map((s) => (
              <div className="stat" key={s.cap}>
                <span className="stat__icon">{s.icon}</span>
                <span className="stat__val">{s.val}</span>
                <span className="stat__cap">{s.cap}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <main id="desk" className="desk">
        <div className="desk__head">
          <div>
            <h2 className="desk__title">The docket</h2>
            <p className="desk__sub">
              {rows.length === 0
                ? "No appeals on file yet. Connect a wallet and file the first appeal."
                : "Live appeals pulled from the contract. Select an appeal to read the file and act on it."}
            </p>
          </div>
          <button
            className="btn btn--primary"
            onClick={() => {
              setShowForm((v) => !v);
              setSelId(null);
              setSel(null);
            }}
          >
            {showForm ? "Close" : (<><FileArrowUp size={18} weight="bold" /> New appeal</>)}
          </button>
        </div>

        {netErr && (
          <div className="banner">
            <WarningCircle size={18} weight="fill" /> Network trouble reaching studionet. Retrying...
          </div>
        )}

        <div className="layout">
          <section className="tickets" aria-label="Appeals">
            {loading && rows.length === 0 ? (
              <p className="muted">Loading the docket...</p>
            ) : rows.length === 0 ? (
              <div className="panel placeholder">
                <span className="placeholder__icon">
                  <Ticket size={40} weight="duotone" />
                </span>
                <h3>No appeals yet</h3>
                <p>File the first parking appeal to populate the docket.</p>
              </div>
            ) : (
              rows.map((r) => <TicketCard key={r.id} row={r} selected={selId === r.id} onPick={pick} />)
            )}
          </section>

          <aside className="rail">
            {showForm ? (
              <div className="panel form">
                <div className="panel__head">
                  <span className="panel__kick">
                    <FileArrowUp size={16} weight="bold" /> File an appeal
                  </span>
                </div>
                <label className="field">
                  <span>Violation type</span>
                  <select value={violationType} onChange={(e) => setViolationType(e.target.value)}>
                    {VIOLATIONS.map((v) => (
                      <option key={v} value={v}>
                        {vioLabel(v)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Citation reference</span>
                  <input
                    value={citationRef}
                    onChange={(e) => setCitationRef(e.target.value)}
                    placeholder="agency, ticket number, date, location"
                  />
                </label>
                <label className="field">
                  <span>Citation text (20 characters or more)</span>
                  <textarea
                    value={citationText}
                    onChange={(e) => setCitationText(e.target.value)}
                    placeholder="What the citation says: the alleged violation, time, place, and the issuing authority."
                  />
                </label>
                <label className="field">
                  <span>Your evidence (20 characters or more)</span>
                  <textarea
                    value={appellantEvidence}
                    onChange={(e) => setAppellantEvidence(e.target.value)}
                    placeholder="Photos, receipts, signage context, timestamped facts that support your appeal."
                  />
                </label>
                <div className="field-row">
                  <label className="field">
                    <span>Fine amount (GEN)</span>
                    <input value={fine} inputMode="decimal" onChange={(e) => setFine(e.target.value)} placeholder="e.g. 1.5" />
                  </label>
                  <label className="field">
                    <span>Stake escrow (GEN)</span>
                    <input value={stake} inputMode="decimal" onChange={(e) => setStake(e.target.value)} placeholder="e.g. 0.5" />
                  </label>
                </div>
                <p className="hint">
                  Escrow sent equals the fine plus your stake, and must exceed the fine. The stake covers the
                  procedure fee; the rest is refunded according to the ruling.
                </p>
                <button className="btn btn--primary full" disabled={!isConnected || !!busy} onClick={onSubmit}>
                  <PaperPlaneRight size={18} weight="bold" /> Submit appeal
                </button>
                {!isConnected && <p className="muted">Connect a wallet to submit.</p>}
              </div>
            ) : sel && selId != null ? (
              <div className={`panel detail res-${(sel.resolution || "pending").toLowerCase()}`}>
                <div className="panel__head">
                  <span className="panel__kick">
                    <Receipt size={16} weight="fill" /> Appeal #{String(selId).padStart(4, "0")}
                  </span>
                  <ResBadge resolution={sel.resolution} />
                </div>
                <h3 className="detail__cite">{sel.citationRef || vioLabel(sel.violationType)}</h3>
                <div className="detail__grid">
                  <div><span>Violation</span><b>{vioLabel(sel.violationType)}</b></div>
                  <div><span>Status</span><b>{STATUS_LABEL[sel.status]}</b></div>
                  <div><span>Fine</span><b>{gen(sel.status >= 3 ? sel.payableFineWei : sel.fineWei)} GEN</b></div>
                  <div><span>{sel.status >= 3 ? "Refund" : "Stake"}</span><b>{gen(sel.status >= 3 ? sel.refundWei : sel.stakeWei)} GEN</b></div>
                  {sel.status >= 2 && (
                    <>
                      <div><span>Reduction</span><b>{sel.reductionPct}%</b></div>
                      <div><span>Merit</span><b>{sel.meritScore}/100</b></div>
                    </>
                  )}
                  {sel.status >= 3 && (
                    <>
                      <div><span>Payable fine</span><b className="hot">{gen(sel.payableFineWei)} GEN</b></div>
                      <div><span>Procedure fee</span><b>{gen(sel.procedureFeeWei)} GEN</b></div>
                    </>
                  )}
                </div>
                <div className="detail__stage">
                  <span className={`chip status-${sel.status}`}>{STATUS_LABEL[sel.status]}</span>
                  <span className="muted">appellant {shortAddr(sel.appellant)}</span>
                  {sel.reheard && <span className="chip demo-chip">REHEARD</span>}
                </div>

                {sel.citationText && (
                  <div className="block">
                    <span className="block__cap">Citation</span>
                    <p>{sel.citationText}</p>
                  </div>
                )}
                {sel.appellantEvidence && (
                  <div className="block">
                    <span className="block__cap">Appellant evidence</span>
                    <p>{sel.appellantEvidence}</p>
                  </div>
                )}
                {sel.issuerEvidence && (
                  <div className="block">
                    <span className="block__cap">Issuer evidence</span>
                    <p>{sel.issuerEvidence}</p>
                  </div>
                )}
                {sel.rationale && (
                  <div className="block block--rationale">
                    <span className="block__cap">Tribunal rationale</span>
                    <p>{sel.rationale}</p>
                  </div>
                )}
                {sel.rehearingText && (
                  <div className="block">
                    <span className="block__cap">Supplementary statement</span>
                    <p>{sel.rehearingText}</p>
                  </div>
                )}

                {/* FILED or ANSWERED: issuer can respond, anyone can adjudicate, appellant can withdraw */}
                {(sel.status === 0 || sel.status === 1) && (
                  <>
                    {!isAppellant && (
                      <div className="block">
                        <label className="field">
                          <span>Issuer response (20 characters or more)</span>
                          <textarea
                            value={issuerEvidence}
                            onChange={(e) => setIssuerEvidence(e.target.value)}
                            placeholder="The issuing authority's evidence: officer notes, photos, signage records."
                          />
                        </label>
                        <button className="btn btn--ghost full" disabled={!isConnected || !!busy} onClick={onIssuerRespond}>
                          <PaperPlaneRight size={18} weight="bold" /> File issuer response
                        </button>
                      </div>
                    )}
                    <button className="btn btn--primary full" disabled={!isConnected || !!busy} onClick={onAdjudicate}>
                      <Gavel size={18} weight="bold" /> Send to the tribunal
                    </button>
                    {isAppellant && (
                      <button className="btn btn--ghost full" disabled={!isConnected || !!busy} onClick={onWithdraw}>
                        <ArrowUUpLeft size={18} weight="bold" /> Withdraw appeal
                      </button>
                    )}
                  </>
                )}

                {/* RULED: settle, or request a rehearing once */}
                {sel.status === 2 && (
                  <>
                    <button className="btn btn--primary full" disabled={!isConnected || !!busy} onClick={onSettle}>
                      <Coins size={18} weight="bold" /> Settle the appeal
                    </button>
                    {!sel.reheard && (
                      <div className="block">
                        <label className="field">
                          <span>Request a rehearing (20 characters or more)</span>
                          <textarea
                            value={supplementary}
                            onChange={(e) => setSupplementary(e.target.value)}
                            placeholder="New facts or arguments that warrant a second look before settlement."
                          />
                        </label>
                        <button className="btn btn--ghost full" disabled={!isConnected || !!busy} onClick={onRehearing}>
                          <ArrowClockwise size={18} weight="bold" /> Request rehearing
                        </button>
                      </div>
                    )}
                  </>
                )}

                {sel.status === 3 && (
                  <p className="muted">
                    <SealCheck size={16} weight="fill" /> Settled. Payable {gen(sel.payableFineWei)} GEN, refund{" "}
                    {gen(sel.refundWei)} GEN.
                  </p>
                )}
              </div>
            ) : (
              <div className="panel placeholder">
                <span className="placeholder__icon">
                  <Scales size={40} weight="duotone" />
                </span>
                <h3>Select an appeal</h3>
                <p>Pick an appeal from the docket to read the citation, the evidence, and the ruling.</p>
                <button className="btn btn--ghost" onClick={() => setShowForm(true)}>
                  <FileArrowUp size={16} weight="bold" /> Or file a new appeal
                </button>
              </div>
            )}
          </aside>
        </div>
      </main>

      <footer className="foot">
        <span className="brand__name small">Ticketless</span>
        <span className="muted">A parking fine appeal tribunal on GenLayer. Citation, escrow, evidence, ruling, settlement.</span>
      </footer>

      {(busy || note) && (
        <div className={`toast ${note ? "toast--err" : ""}`} role="status">
          {busy ? (
            <>
              <ArrowClockwise size={16} weight="bold" className="spin" /> {busy}
            </>
          ) : (
            <>
              <WarningCircle size={16} weight="fill" /> {note}
            </>
          )}
        </div>
      )}
    </div>
  );
}

import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { CONTRACT_ADDRESS } from "./chain";

type Hex = `0x${string}`;
const TIMEOUT_MS = 240_000;

// AP_FILED=0, AP_ANSWERED=1, AP_RULED=2, AP_SETTLED=3
export const STATUS = { FILED: 0, ANSWERED: 1, RULED: 2, SETTLED: 3 } as const;

export type Resolution = "UPHELD" | "REDUCED" | "DISMISSED" | "";

// Mirrors the on-chain `Appeal` dataclass field order.
export interface AppealView {
  appellant: string;
  issuer: string;
  violationType: string;
  citationRef: string;
  citationText: string;
  appellantEvidence: string;
  issuerEvidence: string;
  fineWei: string;
  stakeWei: string;
  status: number;
  resolution: Resolution;
  reductionPct: number;
  meritScore: number;
  payableFineWei: string;
  procedureFeeWei: string;
  refundWei: string;
  rationale: string;
  rehearingText: string;
  reheard: boolean;
}
export interface AppealRow extends AppealView {
  id: number;
}

// Mirrors the on-chain `Precedent` dataclass field order.
export interface PrecedentView {
  violationType: string;
  total: number;
  upheld: number;
  reduced: number;
  dismissed: number;
  avgReductionPct: number;
}

export interface ResolutionView {
  resolution: Resolution;
  reductionPct: number;
  meritScore: number;
  payableFineWei: string;
  refundWei: string;
  reheard: boolean;
}

export interface Counts {
  nextAppealId: number;
  ruled: number;
  dismissed: number;
  reduced: number;
  upheld: number;
  poolBalance: string;
}

export const VIOLATIONS = [
  "PARKING_METER",
  "NO_PARKING_ZONE",
  "PERMIT_ONLY",
  "OVERSTAY",
  "DISABLED_BAY",
  "LOADING_ZONE",
  "STREET_CLEANING",
  "FIRE_LANE",
  "OTHER",
] as const;

function readClient() {
  return createClient({ chain: studionet, account: createAccount() });
}
function writeClient(account: Hex) {
  return createClient({ chain: studionet, account });
}

async function waitAccepted(client: any, hash: Hex) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Transaction timed out")), TIMEOUT_MS);
  });
  try {
    await Promise.race([
      client.waitForTransactionReceipt({ hash: hash as never, status: TransactionStatus.ACCEPTED, interval: 5000, retries: 64 }),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function pick(obj: any, key: string, idx: number): any {
  if (obj == null) return undefined;
  if (Array.isArray(obj)) return obj[idx];
  if (typeof obj === "object" && key in obj) return obj[key];
  return undefined;
}

function bigStr(v: any): string {
  if (v == null) return "0";
  try {
    return BigInt(v).toString();
  } catch {
    return String(v);
  }
}

// ---- writes ----

// file_appeal is payable: the escrow (msg.value) must exceed fine_wei so the
// surplus becomes the procedure stake. We send value = fineWei + stakeWei.
export async function fileAppeal(
  account: Hex,
  f: {
    violationType: string;
    citationRef: string;
    citationText: string;
    appellantEvidence: string;
    fineWei: bigint;
    stakeWei: bigint;
  },
): Promise<number> {
  if (f.fineWei <= 0n) throw new Error("Fine must be greater than 0");
  if (f.stakeWei <= 0n) throw new Error("Escrow must exceed the fine (stake > 0)");
  const value = f.fineWei + f.stakeWei;
  const wc = writeClient(account);
  const h = (await wc.writeContract({
    address: CONTRACT_ADDRESS as Hex,
    functionName: "file_appeal",
    args: [
      f.violationType,
      f.citationRef.trim(),
      f.citationText.trim(),
      f.appellantEvidence.trim(),
      f.fineWei,
    ],
    value,
  })) as Hex;
  await waitAccepted(wc, h);
  const c = await getCounts();
  return c.nextAppealId - 1;
}

export async function issuerRespond(account: Hex, appealId: number, issuerEvidence: string): Promise<void> {
  const wc = writeClient(account);
  const h = (await wc.writeContract({
    address: CONTRACT_ADDRESS as Hex,
    functionName: "issuer_respond",
    args: [appealId, issuerEvidence.trim()],
    value: 0n,
  })) as Hex;
  await waitAccepted(wc, h);
}

export async function adjudicate(account: Hex, appealId: number): Promise<void> {
  const wc = writeClient(account);
  const h = (await wc.writeContract({
    address: CONTRACT_ADDRESS as Hex,
    functionName: "adjudicate",
    args: [appealId],
    value: 0n,
  })) as Hex;
  await waitAccepted(wc, h);
}

export async function settle(account: Hex, appealId: number): Promise<void> {
  const wc = writeClient(account);
  const h = (await wc.writeContract({
    address: CONTRACT_ADDRESS as Hex,
    functionName: "settle",
    args: [appealId],
    value: 0n,
  })) as Hex;
  await waitAccepted(wc, h);
}

export async function requestRehearing(account: Hex, appealId: number, supplementary: string): Promise<void> {
  const wc = writeClient(account);
  const h = (await wc.writeContract({
    address: CONTRACT_ADDRESS as Hex,
    functionName: "request_rehearing",
    args: [appealId, supplementary.trim()],
    value: 0n,
  })) as Hex;
  await waitAccepted(wc, h);
}

export async function withdrawAppeal(account: Hex, appealId: number): Promise<void> {
  const wc = writeClient(account);
  const h = (await wc.writeContract({
    address: CONTRACT_ADDRESS as Hex,
    functionName: "withdraw_appeal",
    args: [appealId],
    value: 0n,
  })) as Hex;
  await waitAccepted(wc, h);
}

// ---- reads ----

export async function getAppeal(appealId: number): Promise<AppealView> {
  const r: any = await readClient().readContract({
    address: CONTRACT_ADDRESS as Hex,
    functionName: "get_appeal",
    args: [appealId],
  });
  return {
    appellant: String(pick(r, "appellant", 0) ?? ""),
    issuer: String(pick(r, "issuer", 1) ?? ""),
    violationType: String(pick(r, "violation_type", 2) ?? ""),
    citationRef: String(pick(r, "citation_ref", 3) ?? ""),
    citationText: String(pick(r, "citation_text", 4) ?? ""),
    appellantEvidence: String(pick(r, "appellant_evidence", 5) ?? ""),
    issuerEvidence: String(pick(r, "issuer_evidence", 6) ?? ""),
    fineWei: bigStr(pick(r, "fine_wei", 7)),
    stakeWei: bigStr(pick(r, "stake_wei", 8)),
    status: Number(pick(r, "status", 9) ?? 0),
    resolution: String(pick(r, "resolution", 10) ?? "") as Resolution,
    reductionPct: Number(pick(r, "reduction_pct", 11) ?? 0),
    meritScore: Number(pick(r, "merit_score", 12) ?? 0),
    payableFineWei: bigStr(pick(r, "payable_fine_wei", 13)),
    procedureFeeWei: bigStr(pick(r, "procedure_fee_wei", 14)),
    refundWei: bigStr(pick(r, "refund_wei", 15)),
    rationale: String(pick(r, "rationale", 16) ?? ""),
    rehearingText: String(pick(r, "rehearing_text", 17) ?? ""),
    reheard: Boolean(pick(r, "reheard", 18) ?? false),
  };
}

export async function getPrecedent(violationType: string): Promise<PrecedentView> {
  const r: any = await readClient().readContract({
    address: CONTRACT_ADDRESS as Hex,
    functionName: "get_precedent",
    args: [violationType],
  });
  return {
    violationType: String(pick(r, "violation_type", 0) ?? violationType),
    total: Number(pick(r, "total", 1) ?? 0),
    upheld: Number(pick(r, "upheld", 2) ?? 0),
    reduced: Number(pick(r, "reduced", 3) ?? 0),
    dismissed: Number(pick(r, "dismissed", 4) ?? 0),
    avgReductionPct: Number(pick(r, "avg_reduction_pct", 5) ?? 0),
  };
}

// get_resolution returns "resolution||reduction_pct||merit_score||payable_fine_wei||refund_wei||REHEARD|FINAL"
export async function getResolution(appealId: number): Promise<ResolutionView> {
  const r: any = await readClient().readContract({
    address: CONTRACT_ADDRESS as Hex,
    functionName: "get_resolution",
    args: [appealId],
  });
  const parts = String(r ?? "").split("||");
  return {
    resolution: (parts[0] || "") as Resolution,
    reductionPct: Number(parts[1] || 0),
    meritScore: Number(parts[2] || 0),
    payableFineWei: parts[3] || "0",
    refundWei: parts[4] || "0",
    reheard: (parts[5] || "FINAL") === "REHEARD",
  };
}

// get_counts returns "next||ruled||dismissed||reduced||upheld||pool_balance"
export async function getCounts(): Promise<Counts> {
  const r: any = await readClient().readContract({
    address: CONTRACT_ADDRESS as Hex,
    functionName: "get_counts",
    args: [],
  });
  const parts = String(r ?? "").split("||");
  return {
    nextAppealId: Number(parts[0] || 0),
    ruled: Number(parts[1] || 0),
    dismissed: Number(parts[2] || 0),
    reduced: Number(parts[3] || 0),
    upheld: Number(parts[4] || 0),
    poolBalance: parts[5] || "0",
  };
}

export async function getPoolBalance(): Promise<string> {
  const r: any = await readClient().readContract({
    address: CONTRACT_ADDRESS as Hex,
    functionName: "get_pool_balance",
    args: [],
  });
  return bigStr(r);
}

export async function listAll(maxRows = 50): Promise<AppealRow[]> {
  const { nextAppealId } = await getCounts();
  if (nextAppealId === 0) return [];
  const ids: number[] = [];
  for (let i = nextAppealId - 1; i >= 0 && i >= nextAppealId - maxRows; i--) ids.push(i);
  const rows = await Promise.all(
    ids.map(async (id) => {
      try {
        const a = await getAppeal(id);
        return { id, ...a };
      } catch {
        return null;
      }
    }),
  );
  return rows.filter((r): r is AppealRow => r !== null);
}

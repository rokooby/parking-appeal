# Ticketless

Two-sided parking-citation tribunal on GenLayer. An appellant files an appeal and escrows the fine plus a procedure stake. The issuing authority can answer with its own evidence. A panel of GenLayer validators rules UPHELD, REDUCED or DISMISSED by partial field matching, reading the citation, both sides and the on-chain precedent for that violation type so rulings stay consistent over time. A reduction pass sets the cut on a REDUCED verdict. Each ruling updates the precedent ledger keyed by violation type, settlement splits the escrow accordingly with a procedure fee on the loser side, and either party can stake a rehearing with a supplementary statement.

## Contract

- Network: GenLayer Studionet (chain id 61999)
- Address: `0x3980BacA4d0BF112B862D8f9B9BfF77600D02a02`

## Methods

file_appeal (payable, with fine_wei), issuer_respond, adjudicate, request_rehearing, withdraw_appeal, settle, plus get_appeal, get_precedent, get_resolution, get_counts.

## Run

```bash
npm install
npm run dev
npm run build
```

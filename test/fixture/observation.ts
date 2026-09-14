/**
 * Stand-in observations for unit tests that stub `page.evaluate`: the shared
 * capture (src/execution/snapshot.ts observePage) evaluates the structured
 * page function and renders lines from its nodes, so a stub that means "the
 * page shows these lines" has to answer with nodes that render to them.
 */
import type { DocumentObservation, ObservedNode } from '../../src/execution/snapshot.js';

const LINE = /^-?\s*(\S+)(?:\s+"((?:[^"\\]|\\.)*)")?((?:\s+\[[^\]]*\])*)(?::\s?(.*))?$/;

/** One snapshot line (either dialect) as the node that renders to it; legacy, so dialect 1 renders it too. */
export function nodeOf(line: string): ObservedNode {
  const m = LINE.exec(line.trim());
  if (!m) throw new Error(`not a snapshot line: ${line}`);
  const [, role, rawName = '', states = '', value] = m;
  const name = JSON.parse(`"${rawName}"`) as string;
  const node: ObservedNode = { role, name, legacyName: name, context: { frame: [], shadow: [] }, legacy: true };
  if (/\[checked\]/.test(states)) node.checked = true;
  if (/\[disabled\]/.test(states)) node.disabled = true;
  if (value !== undefined && node.checked === undefined) node.value = value;
  return node;
}

/** What observeDocumentInPage answers for a page showing exactly these lines and alerts; `coverage` overrides a complete look. */
export function documentOf(lines: string[], alerts: string[] = [], coverage: Partial<DocumentObservation['coverage']> = {}): DocumentObservation {
  return {
    nodes: lines.map(nodeOf),
    alerts: alerts.map((text) => ({ text, legacy: true })),
    coverage: {
      nodesWalked: lines.length,
      nodeCap: 4_000,
      nodesTruncated: false,
      linesTruncated: false,
      alertsTruncated: false,
      shadowRootsWalked: 0,
      collections: { partial: false, evidence: [] },
      ...coverage,
    },
  };
}

/** Whether a page.evaluate argument is the observation's options — how a stub tells the capture from any other evaluate. */
export function isObserveArg(arg: unknown): boolean {
  return Boolean(arg && typeof arg === 'object' && 'maxNodes' in arg && 'legacy' in arg);
}

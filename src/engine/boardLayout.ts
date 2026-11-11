import { BoardCircuit, BoardPlan, RcdGroup } from './board';

/** Width of one DIN module in millimetres. */
export const MODULE_MM = 18;

export type RailItem =
  | { kind: 'main'; start: number; modules: number }
  | { kind: 'surge'; start: number; modules: number }
  | { kind: 'rcd'; start: number; modules: number; group: RcdGroup }
  | { kind: 'breaker'; start: number; modules: number; group: RcdGroup; item: BoardCircuit }
  /** An open module left free so the wires from a device's bottom can reach the top. */
  | { kind: 'pass'; start: number; modules: number; owner: 'main' | RcdGroup };

export interface BoardLayout {
  perRow: number;
  rows: RailItem[][];
}

type Unplaced = RailItem extends infer T ? (T extends RailItem ? Omit<T, 'start'> : never) : never;

/** Places devices on DIN rails, left to right, keeping each device with its wire passage. */
export function layoutBoardRails(plan: BoardPlan): BoardLayout {
  const perRow = plan.modules.enclosure % 18 === 0 && plan.modules.enclosure % 12 !== 0 ? 18 : 12;
  const blocks: Unplaced[][] = [
    [
      { kind: 'main', modules: plan.mainSwitch.poles },
      { kind: 'pass', modules: 1, owner: 'main' },
    ],
    [{ kind: 'surge', modules: plan.surgeProtector.poles }],
  ];
  for (const group of plan.groups) {
    const breakers: Unplaced[] = group.circuits.map((item) => ({
      kind: 'breaker',
      modules: item.circuit.phaseType === '3P' ? 3 : 1,
      group,
      item,
    }));
    // The RCD feeds its breakers from the top of its own row, so the first one stays beside it.
    blocks.push([
      { kind: 'rcd', modules: group.poles, group },
      { kind: 'pass', modules: 1, owner: group },
      ...breakers.slice(0, 1),
    ]);
    for (const breaker of breakers.slice(1)) blocks.push([breaker]);
  }

  const rows: RailItem[][] = [[]];
  let used = 0;
  for (const block of blocks) {
    const size = block.reduce((sum, part) => sum + part.modules, 0);
    if (used + size > perRow) {
      rows.push([]);
      used = 0;
    }
    for (const part of block) {
      rows[rows.length - 1].push({ ...part, start: used } as RailItem);
      used += part.modules;
    }
  }
  return { perRow, rows };
}

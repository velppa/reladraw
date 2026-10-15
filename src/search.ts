/**
 * Finding a line's way through the open space between boxes.
 *
 * Every box is a wall. A line may turn only where two tracks cross, and the
 * tracks are few: a line a little way out from each side of each wall, one
 * down the middle of each gap between walls, and the lines through the two
 * ends. That is the whole of the open space a right-angled line ever needs,
 * reduced to a grid of a few hundred points for a diagram of ordinary size.
 *
 * The line leaves its start heading straight out and arrives at its end heading
 * straight in, with a straight stretch at each end at least `stub` long, so an
 * arrowhead always lands on a straight piece. Between those two stretches it
 * takes the cheapest way through the grid, where cost is length plus a charge
 * for every turn and for every line already placed that it crosses. On a
 * right-angled grid many ways tie on length — a staircase is exactly as long as
 * one bend — and the turn charge breaks those ties toward the fewest bends,
 * which is the line a person would draw. What still ties after that goes over
 * the top rather than under, and round the right rather than the left.
 *
 * A way through a box is not a losing option here. It is not a way at all.
 */

export interface SearchPoint {
  x: number;
  y: number;
}

/** A box the line may not enter, as its extent. Touching its border is allowed. */
export interface SearchWall {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** One end of the line: a point on a box's side, and the unit direction out of it. */
export interface SearchEnd {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

export interface SearchOptions {
  /** How far the line runs straight out of each end before it may turn. */
  stub: number;
  /** How far outside a wall a track runs beside it, where there is room. */
  clear: number;
  /** What a turn costs, in the same units as length. */
  turn: number;
  /**
   * Walls the stretches at the two ends may pass through: the line's own boxes,
   * which it has to cross the margin of to leave, and any box holding an end.
   */
  ownStart: SearchWall[];
  ownEnd: SearchWall[];
  /**
   * Lines already placed. A line may cross one but not run along it within
   * `lane` of it; tracks are added a lane either side of each, so a later line
   * sharing a stretch takes the next lane out.
   */
  taken: SearchPoint[][];
  lane: number;
  /**
   * For each line in `taken`, for each of its stretches, half the depth across
   * it of a text riding there, and 0 where none does. A line running beside a
   * stretch carrying a text keeps clear of the text, not just of the line.
   */
  takenHalves?: number[][];
  /**
   * A gap the line must pass through: somewhere it crosses the line at `at`
   * on the `run` axis, travelling along `run`, at a level between `lo` and `hi`.
   */
  gate?: SearchGate;
  /**
   * Half the depth of this line's own text, which rides in the gate: inside it,
   * the line keeps that much further from the lines beside it.
   */
  ownHalf?: number;
  /**
   * How far the line may go at all: the diagram with room round it. A wall
   * reaching past this — a clause's fence, which runs to the edge of the page —
   * cannot be gone round at its far end.
   */
  bounds?: SearchWall;
  /**
   * A cost the line is no use at unless it comes in under: the cheapest way
   * already found between another pair of sides. The search gives up as soon
   * as it cannot.
   */
  limit?: number;
}

/** A gap a line must pass through. See `SearchOptions.gate`. */
export interface SearchGate {
  run: 'x' | 'y';
  at: number;
  lo: number;
  hi: number;
}

export interface SearchResult {
  points: SearchPoint[];
  cost: number;
}

/**
 * The cheapest right-angled line from `start` to `end` that enters no wall, or
 * undefined when there is none.
 */
export function searchRoute(
  start: SearchEnd,
  end: SearchEnd,
  walls: SearchWall[],
  options: SearchOptions,
): SearchResult | undefined {
  const { clear, turn } = options;
  // The stretches at the ends are fixed. Each crosses its own box's margin and
  // runs `stub` further, or, where another box is closer than that, stops in
  // the middle of the gap between the two margins: a node placed a `tight` gap
  // away still leaves room to get out.
  const others = (own: SearchWall[]): SearchWall[] => walls.filter((wall) => !own.includes(wall));
  const reach = (from: SearchEnd, own: SearchWall[]): SearchPoint | undefined => {
    const exit = Math.max(0, ...own.map((wall) => depth(from, wall)));
    const wanted = Math.max(options.stub, exit + 1);
    const hit = Math.min(Infinity, ...others(own).map((wall) => distanceTo(from, wall, wanted)));
    const length = hit >= wanted ? wanted : (exit + hit) / 2;
    if (length <= exit) return undefined;
    return { x: snap(from.x + from.dx * length), y: snap(from.y + from.dy * length) };
  };
  const out = reach(start, options.ownStart);
  const back = reach(end, options.ownEnd);
  if (!out || !back) return undefined;
  if (inside(out, walls) || inside(back, walls)) return undefined;
  // No way between the two is shorter than straight across and straight down.
  const limit = options.limit ?? Infinity;
  if (Math.abs(back.x - out.x) + Math.abs(back.y - out.y) - 1e-6 >= limit) return undefined;

  const bounds = options.bounds;
  const gate = options.gate;
  // How far a stretch keeps from a placed one beside it: a lane, or clear of
  // the text either of them carries there.
  const halves = options.takenHalves ?? [];
  const ownHalf = options.ownHalf ?? 0;
  const inGate = (ax: number, ay: number, bx: number, by: number): boolean => {
    if (!gate) return false;
    const along = gate.run === 'x' ? Math.abs(ay - by) < 0.5 : Math.abs(ax - bx) < 0.5;
    const level = gate.run === 'x' ? ay : ax;
    return along && level > gate.lo && level < gate.hi;
  };
  const spacing = (line: number, stretch: number, own: number): number =>
    Math.max(options.lane, (halves[line]?.[stretch] ?? 0) + own);
  const gateTracks = (axis: 'x' | 'y'): number[] =>
    !gate ? [] : axis === gate.run ? [gate.at] : [(gate.lo + gate.hi) / 2];
  const xs = tracks(walls, 'x', clear, [out.x, back.x, ...gateTracks('x')], options.taken, spacing, ownHalf)
    .filter((x) => !bounds || (x >= bounds.minX && x <= bounds.maxX) || x === out.x || x === back.x);
  const ys = tracks(walls, 'y', clear, [out.y, back.y, ...gateTracks('y')], options.taken, spacing, ownHalf)
    .filter((y) => !bounds || (y >= bounds.minY && y <= bounds.maxY) || y === out.y || y === back.y);
  const ix = new Map(xs.map((x, index) => [x, index]));
  const iy = new Map(ys.map((y, index) => [y, index]));
  const width = xs.length;
  const height = ys.length;
  const steps = stepTable(xs, ys, walls, clear, options.taken, spacing, ownHalf, inGate);
  const open = (i: number, j: number): boolean => steps.open[j * width + i] === 1;

  // Four headings: 0 right, 1 down, 2 left, 3 up.
  const STEP = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ] as const;
  const heading = (dx: number, dy: number): number => (dx > 0 ? 0 : dy > 0 ? 1 : dx < 0 ? 2 : 3);

  const first = heading(start.dx, start.dy);
  // The last stretch travels into the end, against the way its side faces.
  const last = heading(-end.dx, -end.dy);
  const si = ix.get(out.x)!;
  const sj = iy.get(out.y)!;
  const ti = ix.get(back.x)!;
  const tj = iy.get(back.y)!;

  const done = gate ? 1 : 0;
  const { closed, crowd, cross } = steps;
  // Passing the gate: a stretch through it, reaching the line at `at`.
  const passes = (ax: number, ay: number, bx: number, by: number): boolean => {
    if (!gate || !inGate(ax, ay, bx, by)) return false;
    const u = gate.run === 'x' ? ax : ay;
    const v = gate.run === 'x' ? bx : by;
    return Math.min(u, v) <= gate.at + 0.01 && Math.max(u, v) >= gate.at - 0.01;
  };
  // Running closer to a wall than `clear` counts double: the line may pass a
  // narrow gap, but where there is room it keeps its distance. Crossing a line
  // already placed costs what a turn does, so of two ways much the same length
  // the one that crosses nothing wins.
  const stepCost = (axis: number, key: number, ax: number, ay: number, bx: number, by: number): number =>
    Math.abs(bx - ax) + Math.abs(by - ay) + crowd[axis]![key]! + turn * cross[axis]![key]!;
  // The least the rest could cost, straight across and straight down to the
  // end, by way of the gate until it is passed. It depends only on the point
  // and whether the gate is passed, so it is worked out once for each.
  const least = new Float64Array(width * height * 2);
  for (let j = 0; j < height; j += 1) {
    for (let i = 0; i < width; i += 1) {
      const point = { x: xs[i]!, y: ys[j]! };
      least[(j * width + i) * 2] = leastLength(point, back, gate);
      least[(j * width + i) * 2 + 1] = leastLength(point, back, undefined);
    }
  }

  // Under a limit, most searches find nothing: another pair of sides has
  // already done better. Such a search is not made when no way could come in
  // under the limit even paying only for its steps and for the fewest turns
  // any line from this start to this end makes, with a pixel to spare for the
  // slack in passing the gate.
  if (limit < Infinity) {
    const enough = limit + 1 - turn * fewestTurns(xs[ti]! - out.x, ys[tj]! - out.y, STEP[first]!, STEP[last]!);
    const grid = { width, height, xs, ys, open, closed, passes, stepCost };
    if (cheapestSteps(grid, sj * width + si, tj * width + ti, done, least, enough) >= enough) return undefined;
  }

  // Cost is compared first on length and turns, then on a tie-break that
  // prefers a stretch higher up the page, or further right, so that of two
  // ways round that are exactly as long the line goes over the top. A state
  // also records whether the line has passed its gate yet; it may only finish
  // once it has.
  const size = width * height * 8;
  const cost = new Float64Array(size).fill(Infinity);
  const tie = new Float64Array(size).fill(Infinity);
  const from = new Int32Array(size).fill(-1);
  const state = (i: number, j: number, h: number, p: number): number => ((j * width + i) * 4 + h) * 2 + p;

  // The search reaches out toward the end first: a state waits by what it has
  // cost so far plus the least the rest could cost. It does not settle each
  // state once, since a way just as long can arrive later with a better
  // tie-break; it keeps on until nothing waiting could come in as cheap as the
  // end already has, and what it finds is exactly what searching every
  // direction alike would.
  const toGo = (current: number): number => least[(current >> 3) * 2 + (current & 1)]!;
  const heap = new MinHeap();
  const begin = state(si, sj, first, 0);
  const goal = state(ti, tj, last, done);
  cost[begin] = 0;
  tie[begin] = 0;
  heap.push(begin, toGo(begin), 0);

  while (heap.size > 0) {
    const f = heap.topCost;
    const t = heap.topTie;
    const current = heap.pop();
    const c = cost[current]!;
    const due = c + toGo(current);
    if (f > due || (f === due && t > tie[current]!)) continue;
    // Everything still waiting costs at least this much.
    if (f >= limit || f > cost[goal]! + 1e-9) break;
    const p = current % 2;
    const rest = (current - p) / 2;
    const h = rest % 4;
    const cell = (rest - h) / 4;
    const i = cell % width;
    const j = (cell - i) / width;
    if (current === goal) continue;
    for (let next = 0; next < 4; next += 1) {
      // A line never doubles straight back on itself.
      if ((next + 2) % 4 === h) continue;
      if (next !== h) {
        // Turning on the spot costs a turn and moves nowhere.
        relax(current, state(i, j, next, p), c + turn, t);
        continue;
      }
      const ni = i + STEP[next]![0];
      const nj = j + STEP[next]![1];
      if (ni < 0 || nj < 0 || ni >= width || nj >= height || !open(ni, nj)) continue;
      // A step is filed under the point it starts from on its way right or down.
      const axis = next % 2;
      const key = next < 2 ? j * width + i : nj * width + ni;
      if (closed[axis]![key] === 1) continue;
      const ax = xs[i]!;
      const ay = ys[j]!;
      const bx = xs[ni]!;
      const by = ys[nj]!;
      const np = p === 1 || passes(ax, ay, bx, by) ? 1 : 0;
      const length = stepCost(axis, key, ax, ay, bx, by);
      // Higher up for a stretch across, further right for one down: a smaller
      // tie-break is preferred, so the across level counts as it is and the
      // down level counts negated.
      const lean = next % 2 === 0 ? ay * length : -ax * length;
      relax(current, state(ni, nj, next, np), c + length, t + lean);
    }
  }
  if (!(cost[goal]! < limit)) return undefined;

  function relax(previous: number, next: number, c: number, t: number): void {
    const known = cost[next]!;
    if (c < known - 1e-9 || (Math.abs(c - known) <= 1e-9 && t < tie[next]!)) {
      cost[next] = c;
      tie[next] = t;
      from[next] = previous;
      heap.push(next, c + toGo(next), t);
    }
  }

  const path: SearchPoint[] = [];
  for (let at = goal; at >= 0; at = from[at]!) {
    const rest = (at - (at % 2)) / 2;
    const cell = (rest - (rest % 4)) / 4;
    const i = cell % width;
    const j = (cell - i) / width;
    const point = { x: xs[i]!, y: ys[j]! };
    const previous = path[path.length - 1];
    if (!previous || previous.x !== point.x || previous.y !== point.y) path.push(point);
  }
  path.reverse();
  return { points: straightRuns([start, ...path, end]), cost: cost[goal]! };
}

/**
 * The fewest turns a right-angled line makes from a point, leaving along
 * `heading`, to a point `dx`, `dy` away, arriving along `arrival`, with nothing
 * in the way. Every turn is a quarter turn.
 */
function fewestTurns(dx: number, dy: number, heading: readonly [number, number], arrival: readonly [number, number]): number {
  // Half a hundredth either way is level: the tracks are a hundredth apart.
  const ahead = dx * heading[0] + dy * heading[1] > -0.005;
  if (heading[0] === arrival[0] && heading[1] === arrival[1]) {
    const inLine = Math.abs(dy * heading[0] - dx * heading[1]) < 0.005;
    return !ahead ? 4 : inLine ? 0 : 2;
  }
  if (heading[0] === -arrival[0] && heading[1] === -arrival[1]) return 2;
  const toward = dx * arrival[0] + dy * arrival[1] > -0.005;
  return ahead && toward ? 1 : 3;
}

/** The grid a search runs over, and what a single step on it costs. */
interface StepGrid {
  width: number;
  height: number;
  xs: number[];
  ys: number[];
  open: (i: number, j: number) => boolean;
  closed: Uint8Array[];
  passes: (ax: number, ay: number, bx: number, by: number) => boolean;
  stepCost: (axis: number, key: number, ax: number, ay: number, bx: number, by: number) => number;
}

/**
 * What the steps alone of the cheapest way from point `begin` to point `end`
 * cost, by way of the gate when `done` is 1 — or `enough`, as soon as it is
 * plain the way costs at least that. Turns are free here, so this is never
 * more than the search proper finds. `least` is the least the rest could cost
 * from each point, before and after the gate.
 */
function cheapestSteps(grid: StepGrid, begin: number, end: number, done: number, least: Float64Array, enough: number): number {
  const { width, height, xs, ys, open, closed, passes, stepCost } = grid;
  const spent = new Float64Array(width * height * 2).fill(Infinity);
  const heap = new MinHeap();
  const goal = end * 2 + done;
  spent[begin * 2] = 0;
  heap.push(begin * 2, least[begin * 2]!, 0);
  while (heap.size > 0) {
    const due = heap.topCost;
    const entry = heap.pop();
    const so = spent[entry]!;
    if (due > so + least[entry]!) continue;
    if (due >= enough) return enough;
    if (entry === goal) return so;
    const p = entry & 1;
    const cell = entry >> 1;
    const i = cell % width;
    const j = (cell - i) / width;
    for (let next = 0; next < 4; next += 1) {
      const ni = next === 0 ? i + 1 : next === 2 ? i - 1 : i;
      const nj = next === 1 ? j + 1 : next === 3 ? j - 1 : j;
      if (ni < 0 || nj < 0 || ni >= width || nj >= height || !open(ni, nj)) continue;
      const axis = next % 2;
      const key = next < 2 ? cell : nj * width + ni;
      if (closed[axis]![key] === 1) continue;
      const ax = xs[i]!;
      const ay = ys[j]!;
      const bx = xs[ni]!;
      const by = ys[nj]!;
      const reached = (nj * width + ni) * 2 + (p === 1 || passes(ax, ay, bx, by) ? 1 : 0);
      const length = so + stepCost(axis, key, ax, ay, bx, by);
      if (length < spent[reached]!) {
        spent[reached] = length;
        heap.push(reached, length + least[reached]!, 0);
      }
    }
  }
  return enough;
}

/**
 * The shortest a right-angled line from `a` to `b` could be: straight across
 * and straight down, or with a gate, across to its line at `at` and to a
 * level within it on the way.
 */
function leastLength(a: SearchPoint, b: SearchPoint, gate: SearchGate | undefined): number {
  if (!gate) return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const [u, v, bu, bv] = gate.run === 'x' ? [a.x, a.y, b.x, b.y] : [a.y, a.x, b.y, b.x];
  const off = Math.max(0, gate.lo - Math.max(v, bv), Math.min(v, bv) - gate.hi);
  return Math.abs(u - gate.at) + Math.abs(gate.at - bu) + Math.abs(v - bv) + 2 * off;
}

/**
 * The tracks on one axis: beside each wall at `clear` where that is open,
 * down the middle of every gap between walls, through the ends, and a lane
 * either side of each line already placed — a wider one where a text rides,
 * and wider again by `own` for this line's own text.
 */
function tracks(
  walls: SearchWall[],
  axis: 'x' | 'y',
  clear: number,
  ends: number[],
  taken: SearchPoint[][],
  spacing: (line: number, stretch: number, own: number) => number,
  own: number,
): number[] {
  const lo = (wall: SearchWall): number => (axis === 'x' ? wall.minX : wall.minY);
  const hi = (wall: SearchWall): number => (axis === 'x' ? wall.maxX : wall.maxY);
  // The other axis, to tell a real gap — two walls facing each other across
  // it — from two edges that merely happen to lie near each other on this one.
  const olo = (wall: SearchWall): number => (axis === 'x' ? wall.minY : wall.minX);
  const ohi = (wall: SearchWall): number => (axis === 'x' ? wall.maxY : wall.maxX);
  const found = new Set<number>(ends);
  for (const wall of walls) {
    found.add(lo(wall) - clear);
    found.add(hi(wall) + clear);
  }
  for (const a of walls) {
    for (const b of walls) {
      if (hi(a) < lo(b) && olo(a) < ohi(b) && olo(b) < ohi(a)) found.add((hi(a) + lo(b)) / 2);
    }
  }
  taken.forEach((line, which) => {
    for (let index = 0; index + 1 < line.length; index += 1) {
      const [a, b] = [line[index]!, line[index + 1]!];
      // A stretch across sits at a level on y; one down, at a level on x.
      const across = Math.abs(a.y - b.y) < 0.5;
      if ((axis === 'y') !== across) continue;
      // A lane either side of a placed line. One that runs close beside a box
      // is paid for as crowding, like any other track.
      const level = axis === 'y' ? a.y : a.x;
      for (const by of new Set([spacing(which, index, 0), spacing(which, index, own)])) {
        found.add(level - by);
        found.add(level + by);
      }
    }
  });
  return [...new Set([...found].map(snap))].sort((p, q) => p - q);
}

/** Coordinates to a hundredth, so a track and the end it runs through compare equal. */
function snap(value: number): number {
  return Math.round(value * 100) / 100;
}

/** How far along its heading an end runs before it leaves a wall it starts inside; 0 if it is outside. */
function depth(from: SearchEnd, wall: SearchWall): number {
  if (!(from.x >= wall.minX && from.x <= wall.maxX && from.y >= wall.minY && from.y <= wall.maxY)) return 0;
  if (from.dx > 0) return wall.maxX - from.x;
  if (from.dx < 0) return from.x - wall.minX;
  if (from.dy > 0) return wall.maxY - from.y;
  return from.y - wall.minY;
}

/**
 * How far along its heading an end runs before it meets a wall it is outside
 * of, looking no further than `limit`; Infinity if it meets none.
 */
function distanceTo(from: SearchEnd, wall: SearchWall, limit: number): number {
  if (!blocks(from.x, from.y, from.x + from.dx * limit, from.y + from.dy * limit, wall)) return Infinity;
  if (from.dx > 0) return wall.minX - from.x;
  if (from.dx < 0) return from.x - wall.maxX;
  if (from.dy > 0) return wall.minY - from.y;
  return from.y - wall.maxY;
}

/** Whether a point lies strictly inside any wall. */
function inside(point: SearchPoint, walls: SearchWall[]): boolean {
  return walls.some(
    (wall) => point.x > wall.minX && point.x < wall.maxX && point.y > wall.minY && point.y < wall.maxY,
  );
}

/** Whether a level or upright stretch from (ax, ay) to (bx, by) passes through the inside of one wall. */
function blocks(ax: number, ay: number, bx: number, by: number, wall: SearchWall): boolean {
  const minX = Math.min(ax, bx);
  const maxX = Math.max(ax, bx);
  const minY = Math.min(ay, by);
  const maxY = Math.max(ay, by);
  if (minY === maxY) return minY > wall.minY && minY < wall.maxY && maxX > wall.minX && minX < wall.maxX;
  return minX > wall.minX && minX < wall.maxX && maxY > wall.minY && minY < wall.maxY;
}

/**
 * Every single step through the grid — from a point to its neighbor on the
 * right, or the one below — and what it costs beyond its length: whether it is
 * closed, by a wall or by running along a placed line; how far it runs close
 * beside a wall; how many placed lines it crosses. The search takes each step
 * many times over, once for each heading it arrives with, so these are worked
 * out here once, and each wall and each placed stretch is tested only against
 * the steps that lie near it. A step is filed at the index of the point it
 * starts from: `[0]` the step right, `[1]` the step down.
 */
function stepTable(
  xs: number[],
  ys: number[],
  walls: SearchWall[],
  clear: number,
  taken: SearchPoint[][],
  spacing: (line: number, stretch: number, own: number) => number,
  widest: number,
  inGate: (ax: number, ay: number, bx: number, by: number) => boolean,
): { open: Uint8Array; closed: Uint8Array[]; crowd: Float64Array[]; cross: Int32Array[] } {
  const width = xs.length;
  const height = ys.length;
  const cells = width * height;
  const open = new Uint8Array(cells).fill(1);
  const closed = [new Uint8Array(cells), new Uint8Array(cells)];
  const crowd = [new Float64Array(cells), new Float64Array(cells)];
  const cross = [new Int32Array(cells), new Int32Array(cells)];
  // The indices of the tracks lying within `lo`..`hi`, with one to spare either
  // side: a range to test exactly, never a test itself.
  const near = (values: number[], lo: number, hi: number): [number, number] =>
    [Math.max(0, firstAtLeast(values, lo) - 1), Math.min(values.length - 1, firstAtLeast(values, hi) + 1)];
  // Each loop below visits every step starting from a point in its ranges of tracks.
  for (const wall of walls) {
    const [i0, i1] = near(xs, wall.minX, wall.maxX);
    const [j0, j1] = near(ys, wall.minY, wall.maxY);
    for (let j = j0; j <= j1; j += 1) {
      const ay = ys[j]!;
      for (let i = i0; i <= i1; i += 1) {
        const ax = xs[i]!;
        const key = j * width + i;
        if (ax > wall.minX && ax < wall.maxX && ay > wall.minY && ay < wall.maxY) open[key] = 0;
        if (i + 1 < width && blocks(ax, ay, xs[i + 1]!, ay, wall)) closed[0]![key] = 1;
        if (j + 1 < height && blocks(ax, ay, ax, ys[j + 1]!, wall)) closed[1]![key] = 1;
      }
    }
    const [ci0, ci1] = near(xs, wall.minX - clear, wall.maxX + clear);
    const [cj0, cj1] = near(ys, wall.minY - clear, wall.maxY + clear);
    for (let j = cj0; j <= cj1; j += 1) {
      const ay = ys[j]!;
      for (let i = ci0; i <= ci1; i += 1) {
        const ax = xs[i]!;
        const key = j * width + i;
        if (i + 1 < width) crowd[0]![key] = Math.max(crowd[0]![key]!, crowding(ax, ay, xs[i + 1]!, ay, wall, clear));
        if (j + 1 < height) crowd[1]![key] = Math.max(crowd[1]![key]!, crowding(ax, ay, ax, ys[j + 1]!, wall, clear));
      }
    }
  }
  taken.forEach((line, which) => {
    for (let index = 0; index + 1 < line.length; index += 1) {
      const [p, q] = [line[index]!, line[index + 1]!];
      const reach = spacing(which, index, widest);
      const plain = spacing(which, index, 0);
      const [i0, i1] = near(xs, Math.min(p.x, q.x) - reach, Math.max(p.x, q.x) + reach);
      const [j0, j1] = near(ys, Math.min(p.y, q.y) - reach, Math.max(p.y, q.y) + reach);
      for (let j = j0; j <= j1; j += 1) {
        const ay = ys[j]!;
        for (let i = i0; i <= i1; i += 1) {
          const ax = xs[i]!;
          const key = j * width + i;
          for (let axis = 0; axis < 2; axis += 1) {
            if (axis === 0 ? i + 1 >= width : j + 1 >= height) continue;
            const bx = axis === 0 ? xs[i + 1]! : ax;
            const by = axis === 0 ? ay : ys[j + 1]!;
            if (runsAlong(ax, ay, bx, by, p, q, inGate(ax, ay, bx, by) ? reach : plain)) closed[axis]![key] = 1;
            if (crosses(ax, ay, bx, by, p, q)) cross[axis]![key] = cross[axis]![key]! + 1;
          }
        }
      }
    }
  });
  return { open, closed, crowd, cross };
}

/** The index of the first of the sorted values at least `value`, or their count if none is. */
function firstAtLeast(values: number[], value: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid]! < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** How much of a stretch runs within `clear` of one wall's side, alongside it; 0 if none does. */
function crowding(ax: number, ay: number, bx: number, by: number, wall: SearchWall, clear: number): number {
  const across = Math.abs(ay - by) < 0.5;
  const level = across ? ay : ax;
  const lo = across ? wall.minY : wall.minX;
  const hi = across ? wall.maxY : wall.maxX;
  const near = (level > lo - clear + 0.01 && level <= lo) || (level >= hi && level < hi + clear - 0.01);
  if (!near) return 0;
  const from = across ? Math.min(ax, bx) : Math.min(ay, by);
  const to = across ? Math.max(ax, bx) : Math.max(ay, by);
  const alo = across ? wall.minX : wall.minY;
  const ahi = across ? wall.maxX : wall.maxY;
  return Math.max(0, Math.min(to, ahi) - Math.max(from, alo));
}

/**
 * Whether a stretch runs along one stretch of a placed line, for any distance,
 * closer than `spacing`: a lane, or clear of a text either carries.
 */
function runsAlong(ax: number, ay: number, bx: number, by: number, p: SearchPoint, q: SearchPoint, spacing: number): boolean {
  const across = Math.abs(ay - by) < 0.5;
  if ((Math.abs(p.y - q.y) < 0.5) !== across) return false;
  const level = across ? ay : ax;
  const other = across ? p.y : p.x;
  if (Math.abs(other - level) >= spacing - 0.5) return false;
  const lo = across ? Math.min(ax, bx) : Math.min(ay, by);
  const hi = across ? Math.max(ax, bx) : Math.max(ay, by);
  const pLo = across ? Math.min(p.x, q.x) : Math.min(p.y, q.y);
  const pHi = across ? Math.max(p.x, q.x) : Math.max(p.y, q.y);
  return Math.min(hi, pHi) - Math.max(lo, pLo) > 0.5;
}

/** Whether a stretch crosses one stretch of a placed line square on, touching neither end of either. */
function crosses(ax: number, ay: number, bx: number, by: number, p: SearchPoint, q: SearchPoint): boolean {
  const across = Math.abs(ay - by) < 0.5;
  if ((Math.abs(p.y - q.y) < 0.5) === across) return false;
  const level = across ? ay : ax;
  const lo = across ? Math.min(ax, bx) : Math.min(ay, by);
  const hi = across ? Math.max(ax, bx) : Math.max(ay, by);
  const at = across ? p.x : p.y;
  const pLo = across ? Math.min(p.y, q.y) : Math.min(p.x, q.x);
  const pHi = across ? Math.max(p.y, q.y) : Math.max(p.x, q.x);
  return at > lo + 0.5 && at < hi - 0.5 && level > pLo + 0.5 && level < pHi - 0.5;
}

/** The points with every one dropped that sits on a straight run between its neighbors. */
function straightRuns(points: SearchPoint[]): SearchPoint[] {
  const kept: SearchPoint[] = [];
  for (const point of points) {
    const previous = kept[kept.length - 1];
    if (previous && Math.abs(previous.x - point.x) < 0.01 && Math.abs(previous.y - point.y) < 0.01) continue;
    kept.push(point);
    while (kept.length >= 3) {
      const [a, b, c] = kept.slice(-3) as [SearchPoint, SearchPoint, SearchPoint];
      const level = Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01;
      const upright = Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01;
      if (!level && !upright) break;
      kept.splice(kept.length - 2, 1);
    }
  }
  return kept;
}

/** A binary heap of states, cheapest first, ties broken by the second cost. */
class MinHeap {
  private states = new Int32Array(1024);
  private costs = new Float64Array(1024);
  private ties = new Float64Array(1024);
  size = 0;

  /** The cost and tie-break of the cheapest state waiting. */
  get topCost(): number {
    return this.costs[0]!;
  }

  get topTie(): number {
    return this.ties[0]!;
  }

  push(state: number, cost: number, tie: number): void {
    if (this.size === this.states.length) this.grow();
    const { states, costs, ties } = this;
    let at = this.size;
    this.size += 1;
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (!before(cost, tie, costs[parent]!, ties[parent]!)) break;
      states[at] = states[parent]!;
      costs[at] = costs[parent]!;
      ties[at] = ties[parent]!;
      at = parent;
    }
    states[at] = state;
    costs[at] = cost;
    ties[at] = tie;
  }

  /** Takes the cheapest state off the heap. */
  pop(): number {
    const { states, costs, ties } = this;
    const top = states[0]!;
    this.size -= 1;
    const size = this.size;
    if (size > 0) {
      const state = states[size]!;
      const cost = costs[size]!;
      const tie = ties[size]!;
      let at = 0;
      for (;;) {
        const left = at * 2 + 1;
        const right = left + 1;
        let best = -1;
        let bestCost = cost;
        let bestTie = tie;
        if (left < size && before(costs[left]!, ties[left]!, bestCost, bestTie)) {
          best = left;
          bestCost = costs[left]!;
          bestTie = ties[left]!;
        }
        if (right < size && before(costs[right]!, ties[right]!, bestCost, bestTie)) best = right;
        if (best < 0) break;
        states[at] = states[best]!;
        costs[at] = costs[best]!;
        ties[at] = ties[best]!;
        at = best;
      }
      states[at] = state;
      costs[at] = cost;
      ties[at] = tie;
    }
    return top;
  }

  private grow(): void {
    const states = new Int32Array(this.states.length * 2);
    const costs = new Float64Array(this.costs.length * 2);
    const ties = new Float64Array(this.ties.length * 2);
    states.set(this.states);
    costs.set(this.costs);
    ties.set(this.ties);
    this.states = states;
    this.costs = costs;
    this.ties = ties;
  }
}

function before(pCost: number, pTie: number, qCost: number, qTie: number): boolean {
  return pCost < qCost - 1e-9 || (Math.abs(pCost - qCost) <= 1e-9 && pTie < qTie);
}

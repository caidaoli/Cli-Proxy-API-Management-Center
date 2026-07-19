export type LineRange = {
  start: number;
  end: number;
};

export type DiffSideLine = {
  lineNumber: number;
  text: string;
  changed: boolean;
};

export type DiffSide = {
  changedRangeLabel: string;
  contextRangeLabel: string;
  lines: DiffSideLine[];
  changedRange: LineRange;
  contextRange: LineRange;
};

export type DiffChunkCard = {
  id: string;
  current: DiffSide;
  modified: DiffSide;
};

type DiffOp = 'equal' | 'delete' | 'insert';

type RawHunk = {
  currentStart?: number;
  currentEnd?: number;
  modifiedStart?: number;
  modifiedEnd?: number;
  currentAnchor: number;
  modifiedAnchor: number;
};

export const DIFF_CONTEXT_LINES = 2;

function splitLines(content: string): string[] {
  const lines = content.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.length > 0 ? lines : [''];
}

function getLineRangeLabel(range: LineRange): string {
  return range.start === range.end ? String(range.start) : `${range.start}-${range.end}`;
}

function clampLineNumber(lineNumber: number, totalLines: number): number {
  const maxLine = Math.max(totalLines, 1);
  return Math.max(1, Math.min(lineNumber, maxLine));
}

function normalizeChangedRange(
  start: number | undefined,
  end: number | undefined,
  anchor: number,
  totalLines: number
): LineRange {
  if (typeof start === 'number' && typeof end === 'number') {
    return { start, end };
  }

  const lineNumber = clampLineNumber(anchor, totalLines);
  return { start: lineNumber, end: lineNumber };
}

function expandContextRange(range: LineRange, totalLines: number): LineRange {
  return {
    start: Math.max(1, range.start - DIFF_CONTEXT_LINES),
    end: Math.min(Math.max(totalLines, 1), range.end + DIFF_CONTEXT_LINES),
  };
}

function buildSideLines(
  lines: string[],
  contextRange: LineRange,
  changedRange: LineRange
): DiffSideLine[] {
  const result: DiffSideLine[] = [];

  for (let lineNumber = contextRange.start; lineNumber <= contextRange.end; lineNumber += 1) {
    result.push({
      lineNumber,
      text: lines[lineNumber - 1] ?? '',
      changed: lineNumber >= changedRange.start && lineNumber <= changedRange.end,
    });
  }

  return result;
}

function rangesOverlapOrTouch(a: LineRange, b: LineRange): boolean {
  return a.start <= b.end + 1 && b.start <= a.end + 1;
}

function mergeRange(a: LineRange, b: LineRange): LineRange {
  return { start: Math.min(a.start, b.start), end: Math.max(a.end, b.end) };
}

function buildLineOps(currentLines: string[], modifiedLines: string[]): DiffOp[] {
  const currentCount = currentLines.length;
  const modifiedCount = modifiedLines.length;
  const dp: number[][] = Array.from({ length: currentCount + 1 }, () =>
    Array.from({ length: modifiedCount + 1 }, () => 0)
  );

  for (let i = currentCount - 1; i >= 0; i -= 1) {
    for (let j = modifiedCount - 1; j >= 0; j -= 1) {
      if (currentLines[i] === modifiedLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const operations: DiffOp[] = [];
  let i = 0;
  let j = 0;

  while (i < currentCount && j < modifiedCount) {
    if (currentLines[i] === modifiedLines[j]) {
      operations.push('equal');
      i += 1;
      j += 1;
      continue;
    }

    if (dp[i + 1][j] >= dp[i][j + 1]) {
      operations.push('delete');
      i += 1;
    } else {
      operations.push('insert');
      j += 1;
    }
  }

  while (i < currentCount) {
    operations.push('delete');
    i += 1;
  }

  while (j < modifiedCount) {
    operations.push('insert');
    j += 1;
  }

  return operations;
}

function buildRawHunks(operations: DiffOp[]): RawHunk[] {
  const hunks: RawHunk[] = [];
  let currentLine = 1;
  let modifiedLine = 1;
  let activeHunk: RawHunk | null = null;

  const flush = () => {
    if (!activeHunk) return;
    hunks.push(activeHunk);
    activeHunk = null;
  };

  for (const operation of operations) {
    if (operation === 'equal') {
      flush();
      currentLine += 1;
      modifiedLine += 1;
      continue;
    }

    if (!activeHunk) {
      activeHunk = {
        currentAnchor: currentLine,
        modifiedAnchor: modifiedLine,
      };
    }

    if (operation === 'delete') {
      activeHunk.currentStart ??= currentLine;
      activeHunk.currentEnd = currentLine;
      currentLine += 1;
      continue;
    }

    activeHunk.modifiedStart ??= modifiedLine;
    activeHunk.modifiedEnd = modifiedLine;
    modifiedLine += 1;
  }

  flush();
  return hunks;
}

export function buildDiffCards(original: string, modified: string): DiffChunkCard[] {
  const currentLines = splitLines(original);
  const modifiedLines = splitLines(modified);
  const rawHunks = buildRawHunks(buildLineOps(currentLines, modifiedLines));

  const cards = rawHunks.map<DiffChunkCard>((hunk, index) => {
    const currentChangedRange = normalizeChangedRange(
      hunk.currentStart,
      hunk.currentEnd,
      hunk.currentAnchor,
      currentLines.length
    );
    const modifiedChangedRange = normalizeChangedRange(
      hunk.modifiedStart,
      hunk.modifiedEnd,
      hunk.modifiedAnchor,
      modifiedLines.length
    );

    const currentContextRange = expandContextRange(currentChangedRange, currentLines.length);
    const modifiedContextRange = expandContextRange(modifiedChangedRange, modifiedLines.length);

    return {
      id: `${index}-${currentChangedRange.start}-${currentChangedRange.end}-${modifiedChangedRange.start}-${modifiedChangedRange.end}`,
      current: {
        changedRangeLabel: getLineRangeLabel(currentChangedRange),
        contextRangeLabel: getLineRangeLabel(currentContextRange),
        changedRange: currentChangedRange,
        contextRange: currentContextRange,
        lines: buildSideLines(currentLines, currentContextRange, currentChangedRange),
      },
      modified: {
        changedRangeLabel: getLineRangeLabel(modifiedChangedRange),
        contextRangeLabel: getLineRangeLabel(modifiedContextRange),
        changedRange: modifiedChangedRange,
        contextRange: modifiedContextRange,
        lines: buildSideLines(modifiedLines, modifiedContextRange, modifiedChangedRange),
      },
    };
  });

  if (cards.length <= 1) {
    return cards;
  }

  const merged: DiffChunkCard[] = [];
  for (const card of cards) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      (rangesOverlapOrTouch(previous.current.contextRange, card.current.contextRange) ||
        rangesOverlapOrTouch(previous.modified.contextRange, card.modified.contextRange))
    ) {
      const currentChangedRange = mergeRange(
        previous.current.changedRange,
        card.current.changedRange
      );
      const modifiedChangedRange = mergeRange(
        previous.modified.changedRange,
        card.modified.changedRange
      );
      const currentContextRange = mergeRange(
        previous.current.contextRange,
        card.current.contextRange
      );
      const modifiedContextRange = mergeRange(
        previous.modified.contextRange,
        card.modified.contextRange
      );

      merged[merged.length - 1] = {
        id: `${previous.id}-${card.id}`,
        current: {
          changedRangeLabel: getLineRangeLabel(currentChangedRange),
          contextRangeLabel: getLineRangeLabel(currentContextRange),
          changedRange: currentChangedRange,
          contextRange: currentContextRange,
          lines: buildSideLines(currentLines, currentContextRange, currentChangedRange),
        },
        modified: {
          changedRangeLabel: getLineRangeLabel(modifiedChangedRange),
          contextRangeLabel: getLineRangeLabel(modifiedContextRange),
          changedRange: modifiedChangedRange,
          contextRange: modifiedContextRange,
          lines: buildSideLines(modifiedLines, modifiedContextRange, modifiedChangedRange),
        },
      };
      continue;
    }

    merged.push(card);
  }

  return merged;
}

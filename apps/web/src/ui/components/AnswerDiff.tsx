import { useMemo } from "react";

type DiffSegment = {
  text: string;
  match: boolean;
};

type DiffResult = {
  userSegments: DiffSegment[];
  expectedSegments: DiffSegment[];
};

function computeLcsTable(aTokens: string[], bTokens: string[]): number[][] {
  const aLength = aTokens.length;
  const bLength = bTokens.length;
  const table: number[][] = Array.from({ length: aLength + 1 }, () =>
    new Array(bLength + 1).fill(0),
  );
  for (let i = 1; i <= aLength; i++) {
    for (let j = 1; j <= bLength; j++) {
      if (aTokens[i - 1] === bTokens[j - 1]) {
        table[i][j] = table[i - 1][j - 1] + 1;
      } else {
        table[i][j] = Math.max(table[i - 1][j], table[i][j - 1]);
      }
    }
  }
  return table;
}

function diffTokens(userTokens: string[], expectedTokens: string[]): DiffResult {
  const table = computeLcsTable(userTokens, expectedTokens);
  const userSegments: DiffSegment[] = [];
  const expectedSegments: DiffSegment[] = [];

  let i = userTokens.length;
  let j = expectedTokens.length;
  const userStack: DiffSegment[] = [];
  const expectedStack: DiffSegment[] = [];

  while (i > 0 && j > 0) {
    if (userTokens[i - 1] === expectedTokens[j - 1]) {
      userStack.push({ text: userTokens[i - 1], match: true });
      expectedStack.push({ text: expectedTokens[j - 1], match: true });
      i -= 1;
      j -= 1;
    } else if (table[i - 1][j] >= table[i][j - 1]) {
      userStack.push({ text: userTokens[i - 1], match: false });
      i -= 1;
    } else {
      expectedStack.push({ text: expectedTokens[j - 1], match: false });
      j -= 1;
    }
  }
  while (i > 0) {
    userStack.push({ text: userTokens[i - 1], match: false });
    i -= 1;
  }
  while (j > 0) {
    expectedStack.push({ text: expectedTokens[j - 1], match: false });
    j -= 1;
  }

  for (let index = userStack.length - 1; index >= 0; index -= 1) {
    userSegments.push(userStack[index]);
  }
  for (let index = expectedStack.length - 1; index >= 0; index -= 1) {
    expectedSegments.push(expectedStack[index]);
  }

  return {
    userSegments: mergeAdjacent(userSegments),
    expectedSegments: mergeAdjacent(expectedSegments),
  };
}

function mergeAdjacent(segments: DiffSegment[]): DiffSegment[] {
  const merged: DiffSegment[] = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (last && last.match === segment.match) {
      last.text += segment.text;
    } else {
      merged.push({ text: segment.text, match: segment.match });
    }
  }
  return merged;
}

function tokenizeCharacters(text: string): string[] {
  return Array.from(text.normalize("NFKC"));
}

function tokenizeWords(text: string): string[] {
  const normalized = text.normalize("NFKC");
  const tokens: string[] = [];
  const regex = /(\s+|[^\s\p{L}\p{N}]+|[\p{L}\p{N}]+)/gu;
  let match: RegExpExecArray | null;
  match = regex.exec(normalized);
  while (match !== null) {
    tokens.push(match[0]);
    match = regex.exec(normalized);
  }
  return tokens;
}

type AnswerDiffProps = {
  userAnswer: string;
  expectedAnswer: string;
  granularity?: "character" | "word";
  userLabel?: string;
  expectedLabel?: string;
};

export function AnswerDiff({
  userAnswer,
  expectedAnswer,
  granularity = "character",
  userLabel = "Ta réponse",
  expectedLabel = "Attendu",
}: AnswerDiffProps) {
  const diff = useMemo(() => {
    const tokenize = granularity === "word" ? tokenizeWords : tokenizeCharacters;
    const userTokens = tokenize(userAnswer);
    const expectedTokens = tokenize(expectedAnswer);
    return diffTokens(userTokens, expectedTokens);
  }, [userAnswer, expectedAnswer, granularity]);

  return (
    <div className="answerDiff">
      <div className="answerDiff__row">
        <div className="answerDiff__label">{userLabel}</div>
        <div className="answerDiff__text">
          {diff.userSegments.length === 0 ? (
            <span className="answerDiff__empty">—</span>
          ) : (
            diff.userSegments.map((segment, index) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: diff segments have no stable id
                key={index}
                className={segment.match ? "answerDiff__match" : "answerDiff__mismatch"}
              >
                {segment.text}
              </span>
            ))
          )}
        </div>
      </div>
      <div className="answerDiff__row">
        <div className="answerDiff__label">{expectedLabel}</div>
        <div className="answerDiff__text">
          {diff.expectedSegments.map((segment, index) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: diff segments have no stable id
              key={index}
              className={segment.match ? "answerDiff__match" : "answerDiff__missing"}
            >
              {segment.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

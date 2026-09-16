/**
 * NLTK's word tokenizer, rule for rule, so the tagger downstream sees the tokens it was
 * measured on. The rules are regular expressions applied in order to one string, each
 * padding a piece of punctuation or a contraction with spaces; splitting on whitespace
 * at the end gives the tokens.
 *
 * Python's `\w` matches any letter; JavaScript's only matches ASCII, even with the `u`
 * flag. Subtitle lines are English, and the fixture test is what says it did not matter.
 */

type Rule = [RegExp, string];

const STARTING_QUOTES: Rule[] = [
  [/([«“‘„]|[`]+)/gu, " $1 "],
  [/^"/g, "``"],
  [/(``)/g, " $1 "],
  [/([ ([{<])("|'{2})/g, "$1 `` "],
  [/(')(?!re|ve|ll|m|t|s|d|n)(\w)\b/giu, "$1 $2"],
];

const PUNCTUATION: Rule[] = [
  [/([^.])(\.)([\])}>"'»”’ ]*)\s*$/gu, "$1 $2 $3 "],
  [/([:,])([^\d])/g, " $1 $2"],
  [/([:,])$/g, " $1 "],
  [/\.{2,}/gu, " $& "],
  [/[;@#$%&]/g, " $& "],
  // The final period, once more.
  [/([^.])(\.)([\])}>"']*)\s*$/g, "$1 $2$3 "],
  [/[?!]/g, " $& "],
  [/([^'])' /g, "$1 ' "],
  [/[*]/gu, " $& "],
];

const PARENS_BRACKETS: Rule = [/[\][(){}<>]/g, " $& "];
const DOUBLE_DASHES: Rule = [/--/g, " -- "];

const ENDING_QUOTES: Rule[] = [
  [/([»”’])/gu, " $1 "],
  [/''/g, " '' "],
  [/"/g, " '' "],
  [/\s+/g, " "],
  [/([^' ])('[sS]|'[mM]|'[dD]|') /g, "$1 $2 "],
  [/([^' ])('ll|'LL|'re|'RE|'ve|'VE|n't|N'T) /g, "$1 $2 "],
];

const CONTRACTIONS: Rule[] = [
  /\b(can)(not)\b/gi,
  /\b(d)('ye)\b/gi,
  /\b(gim)(me)\b/gi,
  /\b(gon)(na)\b/gi,
  /\b(got)(ta)\b/gi,
  /\b(lem)(me)\b/gi,
  /\b(more)('n)\b/gi,
  /\b(wan)(na)(?=\s)/gi,
  / ('t)(is)\b/gi,
  / ('t)(was)\b/gi,
].map((pattern): Rule => [pattern, " $1 $2 "]);

function apply(text: string, rules: Rule[]): string {
  return rules.reduce((out, [pattern, to]) => out.replace(pattern, to), text);
}

function words(sentence: string): string[] {
  let text = apply(sentence, STARTING_QUOTES);
  text = apply(text, PUNCTUATION);
  text = apply(text, [PARENS_BRACKETS, DOUBLE_DASHES]);
  text = apply(` ${text} `, ENDING_QUOTES);
  text = apply(text, CONTRACTIONS);
  return text.split(/\s+/).filter(Boolean);
}

/**
 * NLTK first splits a line into sentences with Punkt, a trained model of its own, so that
 * a period ending a sentence becomes a token. Here any word ending in a period ends one.
 * Over 8,580 labelled lines that changes the tag of the looked-up word once.
 */
export function tokenize(line: string): string[] {
  return line.split(/(?<=[^.\s]\.)\s+/).flatMap(words);
}

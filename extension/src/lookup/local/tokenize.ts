/**
 * A port of NLTK's word tokenizer, so the tagger sees the tokens it was trained on. Each
 * rule pads punctuation or a contraction with spaces; splitting on whitespace at the end
 * gives the tokens.
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
 * NLTK splits sentences with Punkt, a trained model. Here any word ending in a period
 * ends a sentence, which is close enough for subtitle lines.
 */
export function tokenize(line: string): string[] {
  return line.split(/(?<=[^.\s]\.)\s+/).flatMap(words);
}

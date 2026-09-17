"""Turn the model's scores into probabilities, and its confidence into one that means what
it says. Everything is fitted on the validation words and reported on the test words.

- Probabilities: a softmax over the senses' scores, with a temperature fitted to the
  right senses.
- Confidence, two candidates for how likely the first sense is to be right:
  - `top`: the first sense's probability from that softmax
  - `gap`: a logistic curve over the gap between the first and second score

A confidence is calibrated when, of the answers given with 80% confidence, about 80% are
right. The reliability tables and the expected calibration error (ECE) measure that.
"""

import argparse

import torch
from common import unanimous
from confidence import BAR, CONFIDENT_GAP, score_lines
from sentence_transformers import SentenceTransformer

BINS = 10


def fit_temperature(lines):
    """The temperature that makes the right senses most likely."""
    log_t = torch.zeros(1, requires_grad=True)
    optimizer = torch.optim.LBFGS([log_t], max_iter=200, line_search_fn="strong_wolfe")
    data = [(torch.tensor(r["scores"]), torch.tensor(r["hits"])) for r in lines]

    def loss():
        optimizer.zero_grad()
        total = sum(-torch.logsumexp(torch.log_softmax(s / log_t.exp(), 0)[h], 0)
                    for s, h in data)
        total.backward()
        return total

    optimizer.step(loss)
    return float(log_t.detach().exp())


def fit_gap(lines):
    """Slope and intercept of P(first sense right) = sigmoid(slope * gap + intercept)."""
    gap = torch.tensor([r["gap"] for r in lines])
    right = torch.tensor([float(r["right"]) for r in lines])
    weights = torch.zeros(2, requires_grad=True)
    optimizer = torch.optim.LBFGS([weights], max_iter=200, line_search_fn="strong_wolfe")

    def loss():
        optimizer.zero_grad()
        total = torch.nn.functional.binary_cross_entropy_with_logits(
            weights[0] * gap + weights[1], right)
        total.backward()
        return total

    optimizer.step(loss)
    return float(weights[0].detach()), float(weights[1].detach())


def top_confidence(line, temperature):
    return float(torch.softmax(torch.tensor(line["scores"]) / temperature, 0)[0])


def gap_confidence(line, slope, intercept):
    return float(torch.sigmoid(torch.tensor(slope * line["gap"] + intercept)))


def ece(pairs):
    """Expected calibration error over equal-width bins; `pairs` are (confidence, right)."""
    total = 0.0
    for b in range(BINS):
        part = [p for p in pairs if min(int(p[0] * BINS), BINS - 1) == b]
        if part:
            gap = abs(sum(c for c, _ in part) - sum(r for _, r in part)) / len(part)
            total += gap * len(part) / len(pairs)
    return total


def brier(pairs):
    return sum((c - r) ** 2 for c, r in pairs) / len(pairs)


def right_log_loss(lines, temperature):
    """Mean negative log-probability of the right senses."""
    return sum(-float(torch.logsumexp(torch.log_softmax(
        torch.tensor(r["scores"]) / temperature, 0)[torch.tensor(r["hits"])], 0))
        for r in lines) / len(lines)


def reliability(pairs):
    print(f"{'confidence':>12}{'lines':>7}{'said':>8}{'right':>8}")
    for b in range(BINS):
        part = [p for p in pairs if min(int(p[0] * BINS), BINS - 1) == b]
        if part:
            said = 100 * sum(c for c, _ in part) / len(part)
            right = 100 * sum(r for _, r in part) / len(part)
            print(f"{b * 10:>5}-{b * 10 + 10:>3}%{len(part):>7}{said:>7.1f}%{right:>7.1f}%")


def threshold(pairs):
    """The lowest confidence whose answers, and every answer above it, clear the bar."""
    best, right = None, 0
    for k, (c, r) in enumerate(sorted(pairs, key=lambda p: -p[0]), 1):
        right += r
        if right / k >= BAR:
            best = c
    return best


def leads(pairs, at):
    above = [r for c, r in pairs if c >= at]
    share = 100 * len(above) / len(pairs)
    right = 100 * sum(above) / len(above) if above else 0.0
    return f"leads on {share:.1f}%, right {right:.1f}%"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="data/model")
    parser.add_argument("--labels", default="data/teacher-labels.jsonl")
    parser.add_argument("--split", default="data/label-split.json")
    args = parser.parse_args()

    model = SentenceTransformer(args.model)
    valid, test = (
        [r for r in score_lines(model, unanimous(args.labels, args.split, part))
         if r["senses"] > 1]
        for part in ("validation", "test"))

    temperature = fit_temperature(valid)
    slope, intercept = fit_gap(valid)
    print(f"\nfitted on {len(valid)} validation lines, reported on {len(test)} test lines")
    print(f"temperature {temperature:.4f}; gap curve slope {slope:.3f}, "
          f"intercept {intercept:.3f}")
    print(f"right-sense log loss on test: {right_log_loss(test, 1.0):.3f} unscaled, "
          f"{right_log_loss(test, temperature):.3f} with the temperature")

    methods = {
        "top": lambda r: top_confidence(r, temperature),
        "gap": lambda r: gap_confidence(r, slope, intercept),
    }
    for name, confidence in methods.items():
        valid_pairs = [(confidence(r), r["right"]) for r in valid]
        test_pairs = [(confidence(r), r["right"]) for r in test]
        at = threshold(valid_pairs)
        print(f"\n{name}: ECE {ece(test_pairs):.3f}, Brier {brier(test_pairs):.3f} on test")
        print(f"bar {BAR:.0%} → lead above {at:.3f}: {leads(test_pairs, at)} on test\n")
        reliability(test_pairs)

    gap_pairs = [(r["gap"], r["right"]) for r in test]
    print(f"\nnow: gap ≥ {CONFIDENT_GAP}: {leads(gap_pairs, CONFIDENT_GAP)} on test")


if __name__ == "__main__":
    main()

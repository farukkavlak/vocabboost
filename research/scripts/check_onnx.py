"""Check the exported models answer like the PyTorch one on the test lines, line by line."""

import argparse
import time

import numpy as np
import onnxruntime
import torch
from common import unanimous
from confidence import CONFIDENT_GAP, score_lines
from sentence_transformers import SentenceTransformer
from transformers import AutoTokenizer


class OnnxEncoder:
    """An ONNX graph behind the one call the scoring code makes of a sentence encoder."""

    def __init__(self, folder, graph):
        self.tokenizer = AutoTokenizer.from_pretrained(folder)
        self.session = onnxruntime.InferenceSession(f"{folder}/onnx/{graph}")

    def encode(self, texts, **_):
        single = isinstance(texts, str)
        batch = self.tokenizer([texts] if single else texts, padding=True, truncation=True,
                               return_tensors="np")
        hidden = self.session.run(None, {k: batch[k].astype(np.int64) for k in
                                         ("input_ids", "attention_mask", "token_type_ids")})[0]
        # Mean over the real tokens only: padding is zeros in the mask, not in the output.
        mask = batch["attention_mask"][..., None].astype(np.float32)
        pooled = (hidden * mask).sum(1) / mask.sum(1)
        pooled /= np.linalg.norm(pooled, axis=1, keepdims=True)
        vectors = torch.from_numpy(pooled)
        return vectors[0] if single else vectors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="data/model")
    parser.add_argument("--onnx", default="data/onnx")
    parser.add_argument("--labels", default="data/teacher-labels.jsonl")
    parser.add_argument("--split", default="data/label-split.json")
    args = parser.parse_args()

    rows = [r for r in unanimous(args.labels, args.split, "test") if r["label"]]
    encoders = [("pytorch", SentenceTransformer(args.model)),
                ("onnx", OnnxEncoder(args.onnx, "model.onnx")),
                ("onnx fp16", OnnxEncoder(args.onnx, "model_fp16.onnx")),
                ("onnx int8", OnnxEncoder(args.onnx, "model_quantized.onnx"))]

    print(f"\n{len(rows)} test lines, threshold {CONFIDENT_GAP}\n")
    print("differs: lines whose first choice is not the PyTorch model's\n")
    print(f"{'':<11}{'first':>7}{'top 3':>7}{'differs':>9}{'answers':>9}{'right':>7}"
          f"{'ms a line':>11}")
    reference = None
    for name, encoder in encoders:
        start = time.perf_counter()
        lines = score_lines(encoder, rows)
        ms = 1000 * (time.perf_counter() - start) / len(rows)
        reference = reference or lines
        differs = sum(a["first"] != b["first"] for a, b in zip(lines, reference, strict=True))
        above = [r for r in lines if r["gap"] >= CONFIDENT_GAP]
        print(f"{name:<11}{100 * sum(r['right'] for r in lines) / len(lines):>6.1f}%"
              f"{100 * sum(r['top3'] for r in lines) / len(lines):>6.1f}%{differs:>9}"
              f"{100 * len(above) / len(lines):>8.1f}%"
              f"{100 * sum(r['right'] for r in above) / len(above):>6.1f}%{ms:>11.1f}")


if __name__ == "__main__":
    main()

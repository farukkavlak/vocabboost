"""Export `data/model` to ONNX in three precisions, and copy the 8-bit one into the extension.

Only the encoder is exported; pooling and normalising happen in the caller. The 8-bit copy
is quantized per channel, which loses far less than one scale per matrix.
"""

import argparse
import pathlib
import shutil

import onnx
import torch
from onnxruntime.quantization import QuantType, quantize_dynamic
from onnxruntime.transformers.float16 import convert_float_to_float16
from transformers import AutoModel, AutoTokenizer

KEPT = ["config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json",
        "vocab.txt"]


class Encoder(torch.nn.Module):
    """The transformer alone: token ids in, one vector per token out."""

    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, input_ids, attention_mask, token_type_ids):
        return self.model(input_ids=input_ids, attention_mask=attention_mask,
                          token_type_ids=token_type_ids).last_hidden_state


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="data/model")
    parser.add_argument("--out", default="data/onnx")
    parser.add_argument("--ship", default="../extension/public/models/vocabboost")
    args = parser.parse_args()

    out = pathlib.Path(args.out)
    (out / "onnx").mkdir(parents=True, exist_ok=True)
    for name in KEPT:
        if (pathlib.Path(args.model) / name).exists():
            shutil.copy(pathlib.Path(args.model) / name, out / name)

    tokenizer = AutoTokenizer.from_pretrained(args.model)
    encoder = Encoder(AutoModel.from_pretrained(args.model)).eval()
    sample = tokenizer(["safe: put it in the safe", "a line"], padding=True,
                       return_tensors="pt")
    inputs = (sample["input_ids"], sample["attention_mask"], sample["token_type_ids"])

    full = out / "onnx" / "model.onnx"
    batch, tokens = torch.export.Dim("batch"), torch.export.Dim("tokens")
    shape = {"input_ids": {0: batch, 1: tokens}, "attention_mask": {0: batch, 1: tokens},
             "token_type_ids": {0: batch, 1: tokens}}
    torch.onnx.export(encoder, inputs, full, dynamo=True, external_data=False,
                      input_names=["input_ids", "attention_mask", "token_type_ids"],
                      output_names=["last_hidden_state"], dynamic_shapes=shape)

    half = out / "onnx" / "model_fp16.onnx"
    onnx.save(convert_float_to_float16(onnx.load(full), keep_io_types=True), half)

    small = out / "onnx" / "model_quantized.onnx"
    quantize_dynamic(full, small, weight_type=QuantType.QInt8, per_channel=True)

    ship = pathlib.Path(args.ship)
    (ship / "onnx").mkdir(parents=True, exist_ok=True)
    for name in KEPT:
        if (out / name).exists():
            shutil.copy(out / name, ship / name)
    shutil.copy(small, ship / "onnx" / small.name)

    for path in (full, half, small):
        print(f"{path}  {path.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()

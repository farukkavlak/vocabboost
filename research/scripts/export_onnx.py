"""Turn the trained model into files a browser can run.

The extension runs JavaScript, and PyTorch's format means nothing there. ONNX is a model
written down as a graph of plain operations, which any runtime can execute — here
`onnxruntime` in Python to check it, and `transformers.js` in the extension.

Only the encoder is exported. Mean pooling and normalising are a few lines of arithmetic
done after it, in whichever language runs it; baking them into the graph would hide them.

Three copies are written, and `make check-onnx` measures what each one costs:

- `model.onnx`, every weight a 32-bit float, the same numbers as `data/model`
- `model_fp16.onnx`, every weight a 16-bit float: half the size
- `model_quantized.onnx`, every weight an 8-bit integer: a quarter of the size

The 8-bit copy is rounded per channel — each row of a weight matrix gets its own scale.
One scale for a whole matrix cost 4.2 points; one a row costs about one. A matrix mixes
rows of very different sizes, and a single scale spends its 256 steps on the largest.

The folder layout is the one `transformers.js` loads from: config and tokenizer at the
top, the graphs under `onnx/`. The 8-bit copy and the files beside it are also written to
`extension/public/models/vocabboost`, which is what the extension ships.
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

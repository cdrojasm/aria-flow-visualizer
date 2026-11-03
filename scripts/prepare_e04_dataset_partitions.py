#!/usr/bin/env python3
"""Validate ARIA CSV headers and prepare small, privacy-scrubbed E04 partitions."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
import re
from collections import Counter
from pathlib import Path

DEFAULT_SOURCE = Path("/Users/davidrojas/Downloads/training_dataset_xgboost.csv")
DEFAULT_SCHEMA_SAMPLE = Path("/Users/davidrojas/Downloads/dataset_ejemplo.csv")
DEFAULT_OUTPUT = Path("/private/tmp/aria-e04-partitions")
SIZES = (25, 100, 300, 900)
REQUIRED_ARIA_FIELDS = {
    "eventid",
    "eventtype",
    "channel",
    "integrationpoint",
    "amount_value",
    "customerid",
    "transactionid",
    "marcacion_final",
    "razon_marcacion",
    "fecha_transaccion",
}
SENSITIVE_FIELDS = {
    "numero_documento",
    "nombre_razon_social",
    "fecha_nacimiento",
    "fecha_expedicion_documento",
    "direccion",
    "correo_1",
    "correo_2",
    "celular",
    "customerid",
    "deviceid",
    "eventid",
    "transactionid",
    "device_ipaddress_encrypted",
    "counterpartyentityid_encrypted",
}
NESTED_SENSITIVE = re.compile(
    r"(cuenta|destino|customer|document|nombre|address|correo|phone|celular|"
    r"transaction.?id|device.?id|event.?id|ipaddress)",
    re.IGNORECASE,
)


def read_headers(path: Path) -> list[str]:
    with path.open(newline="", encoding="utf-8-sig", errors="replace") as stream:
        return next(csv.reader(stream), [])


def redact_nested(value: object, token: str) -> object:
    if isinstance(value, dict):
        return {
            key: f"{token}-{key[:8]}" if NESTED_SENSITIVE.search(key) else redact_nested(item, token)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact_nested(item, token) for item in value]
    if isinstance(value, str):
        try:
            nested = json.loads(value)
        except (ValueError, TypeError):
            return value
        if isinstance(nested, (dict, list)):
            cleaned = redact_nested(nested, token)
            return json.dumps(cleaned, ensure_ascii=False, separators=(",", ":"))
    return value


def scrub_row(row: dict[str, str], partition: int, index: int) -> dict[str, str]:
    cleaned = dict(row)
    token = f"E04-{partition}-{index:04d}"
    for field in SENSITIVE_FIELDS & cleaned.keys():
        if field == "nombre_razon_social":
            cleaned[field] = f"E04 Cliente {index:04d}"
        elif field == "numero_documento":
            cleaned[field] = f"{token}-DOC"
        elif field in {
            "customerid",
            "deviceid",
            "eventid",
            "transactionid",
            "device_ipaddress_encrypted",
            "counterpartyentityid_encrypted",
        }:
            cleaned[field] = f"{token}-{field[:8]}"
        else:
            cleaned[field] = ""

    nested_csv = cleaned.get("transacciones_json", "")
    if nested_csv:
        nested = json.loads(nested_csv)
        cleaned["transacciones_json"] = json.dumps(
            redact_nested(nested, token), ensure_ascii=False, separators=(",", ":")
        )
    return cleaned


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--schema-sample", type=Path, default=DEFAULT_SCHEMA_SAMPLE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    csv.field_size_limit(20_000_000)
    with args.source.open(newline="", encoding="utf-8-sig", errors="replace") as stream:
        reader = csv.DictReader(stream)
        headers = reader.fieldnames or []
        rows = list(reader)

    if not headers or len(headers) != len(set(headers)):
        raise SystemExit("Source headers are empty or duplicated")
    missing = REQUIRED_ARIA_FIELDS - set(headers)
    if missing:
        raise SystemExit(f"Missing expected ARIA fields: {sorted(missing)}")
    if len(rows) < max(SIZES):
        raise SystemExit(f"Need at least {max(SIZES)} rows; source has {len(rows)}")
    if read_headers(args.schema_sample) != headers:
        raise SystemExit("Source columns do not match the selected ARIA schema sample")

    args.output.mkdir(parents=True, exist_ok=True)
    source_digest = hashlib.sha256(args.source.read_bytes()).hexdigest()
    print(f"source_rows={len(rows)} source_columns={len(headers)} source_sha256={source_digest}")
    print("schema_sample_headers=match required_aria_fields=present")

    for size in SIZES:
        selected = random.Random(4404 + size).sample(rows, size)
        target = args.output / f"e04_actual_sanitized_{size}.csv"
        with target.open("w", newline="", encoding="utf-8") as stream:
            writer = csv.DictWriter(stream, fieldnames=headers, extrasaction="raise")
            writer.writeheader()
            for index, row in enumerate(selected, start=1):
                writer.writerow(scrub_row(row, size, index))

        classes = Counter(row.get("marcacion_final") or "<empty>" for row in selected)
        print(
            f"partition_rows={size} columns={len(headers)} bytes={target.stat().st_size} "
            f"label_classes={len(classes)} sha256={hashlib.sha256(target.read_bytes()).hexdigest()} "
            f"path={target}"
        )


if __name__ == "__main__":
    main()

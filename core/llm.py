"""OpenAI-compatible chat client with same-model key rotation. Only core/reader.py calls this."""
from __future__ import annotations

import os
import time

import httpx

TIMEOUT_S = 25
SEED = 7  # fixed sampling seed so repeated reads of the same text vary as little as the provider allows
MIN_ATTEMPTS = 4  # at least this many tries per run; with more keys, every key gets one try
BACKOFF = [0.5, 1.0, 1.0, 1.0]


class LLMError(RuntimeError):
    pass


def load_env(path: str = ".env") -> None:
    if not os.path.exists(path):
        return
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def _split(s: str) -> list[str]:
    return [x.strip() for x in (s or "").split(",") if x.strip()]


class LLM:
    def __init__(self, trace):
        self.trace = trace
        self.base = os.environ.get("LLM_BASE_URL", "").rstrip("/")
        self.keys = _split(os.environ.get("LLM_API_KEYS", ""))
        self.model = os.environ.get("LLM_MODEL", "")
        self.allowed = _split(os.environ.get("LLM_ALLOWED_MODELS", ""))
        fb_url, fb_key = os.environ.get("LLM_FALLBACK_BASE_URL", "").rstrip("/"), os.environ.get("LLM_FALLBACK_KEY", "")
        self.targets = [(self.base, k, f"key {i + 1}") for i, k in enumerate(self.keys)]
        if fb_url and fb_key:
            self.targets.append((fb_url, fb_key, "fallback provider"))
        self.cursor = 0
        self.attempts = 0
        if not self.model or self.model not in self.allowed:
            raise LLMError("LLM_MODEL is not in LLM_ALLOWED_MODELS; refusing to call it")
        if not self.targets or not self.base:
            raise LLMError("LLM_BASE_URL and at least one LLM_API_KEYS entry are required")

    def chat(self, area: str, system: str, user: str) -> dict:
        body = {"model": self.model, "temperature": 0, "seed": SEED, "response_format": {"type": "json_object"},
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
        if "gpt-oss" in self.model:
            body["reasoning_effort"] = "low"  # higher effort used the whole output budget on reasoning and returned empty JSON
        while self.attempts < max(MIN_ATTEMPTS, len(self.targets)):
            base, key, label = self.targets[self.cursor % len(self.targets)]
            self.attempts += 1
            t0, why = time.time(), None
            try:
                r = httpx.post(f"{base}/chat/completions", json=body, timeout=TIMEOUT_S,
                               headers={"Authorization": f"Bearer {key}"})
                if r.status_code == 429 or r.status_code >= 500:
                    why = f"{r.status_code} on {label}"
                elif r.status_code == 400 and "json_validate_failed" in r.text and "response_format" in body:
                    del body["response_format"]  # provider's JSON mode failed; ask for JSON in plain text and parse it ourselves
                    self.trace.event("retry", f"JSON mode failed on {label}; retrying without it (the reply is still parsed and checked)")
                    continue
                elif r.status_code >= 400:
                    raise LLMError(f"model API returned {r.status_code}: {r.text[:2 * 10 ** 2]}")
                else:
                    j = r.json()
                    usage = j.get("usage") or {}
                    if "total_tokens" not in usage:
                        why = f"no usage in response on {label}"
                    else:
                        text = j["choices"][0]["message"]["content"] or ""
                        reported = j.get("model") or self.model
                        if reported not in self.allowed:
                            self.trace.event("warn", f"API reported model {reported}, which is not in the allowlist")
                        return {"content": text, "model": reported, "usage": usage,
                                "ms": int((time.time() - t0) * 10 ** 3)}
            except httpx.TimeoutException:
                why = f"timeout on {label}"
            except httpx.HTTPError as e:
                why = f"network error on {label}: {type(e).__name__}"
            self.cursor += 1
            nxt = self.targets[self.cursor % len(self.targets)][2]
            self.trace.event("retry", f"{why}, rotated to {nxt}")
            time.sleep(BACKOFF[min(self.attempts - 1, len(BACKOFF) - 1)])
        raise LLMError(f"model unavailable after {self.attempts} attempts")

# Document fonts

HA GROUP's documents are set in **Century Gothic** — confirmed on 203 of 206
styled runs in the source DOCX during Phase 0 analysis.

Century Gothic is a licensed Monotype typeface. It is **not** redistributable
and is deliberately not committed to this repository.

## To render documents in the company typeface

Place the licensed TTF files in this directory:

```
assets/fonts/CenturyGothic.ttf         (required)
assets/fonts/CenturyGothic-Bold.ttf    (recommended)
assets/fonts/CenturyGothic-Italic.ttf  (optional)
```

`GOTHIC.TTF` / `GOTHICB.TTF` / `GOTHICI.TTF` are also recognised, since that is
how the files are named in a standard Microsoft Office installation.

They are picked up automatically on the next render — no configuration change.

## Until then

The renderer falls back to Helvetica and **says so**, both in the document
footer and in the warnings returned to whoever rendered it. A substituted
typeface on a company document is something a person needs to know about, so it
is never silent.

Line breaks will differ slightly from the originals: Helvetica is not metrically
identical to Century Gothic.

## Licensing

A server-side rendering licence is a procurement matter, not an engineering one.
Monotype licences it per-server for this kind of use. If HA GROUP would rather
not licence it, a metric-compatible substitute can be configured here instead —
but that is a decision about how the company's documents look, so it belongs
with an Administrator rather than in code.

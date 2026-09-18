# Plan: Put the Technical Architecture into the GitHub README

## Goal
The technical architecture document (currently a PDF, `msme-edi-technical-architecture.pdf`) should be visible on the GitHub repository's front page, in the README.

## What exists today
- `README.md` is the default Lovable boilerplate (welcome text + dev instructions).
- The architecture PDF exists as an uploaded/generated file; its full text extracts cleanly (14 sections: executive summary, standards evaluation, system architecture, canonical model, identity/keys, exchange protocol, profile layer, triple-entry ledger, database design, server surface, integration/agent surface, security model, testing, roadmap).

## Changes

1. **Create `docs/msme-edi-technical-architecture.pdf`**
   - Copy the uploaded PDF into the repo under `docs/` so the original document is versioned and downloadable from GitHub.

2. **Rewrite `README.md` as the architecture README**
   Structure:
   - Title: **MSME EDI Exchange** with the one-line positioning statement from the doc.
   - Short "What is this?" intro (3–4 sentences, plain language).
   - At-a-glance table (runtime, data plane, cryptography — taken from the doc's header block).
   - Link badge/line to the full PDF at `docs/msme-edi-technical-architecture.pdf`.
   - **Full Technical Architecture section** — the entire document converted from PDF to clean GitHub-flavoured markdown:
     - Table of contents with anchor links
     - All 14 sections, headings preserved, code blocks fenced, tables converted to markdown tables, ASCII diagrams preserved in ```text blocks
     - PDF page headers/footers ("MSME EDI Exchange — Technical Architecture", page numbers) stripped during conversion
   - Keep a short **Development** section at the bottom (install/run commands) so the repo stays self-explanatory.

3. **Conversion method**
   - Extract text with `pdftotext`, then hand-structure into markdown headings/lists/tables (verify headings and section numbers against the PDF contents page).
   - Spot-check several sections against the PDF to ensure nothing was dropped or garbled.

## How it reaches GitHub
- Editing `README.md` in this project commits through the project's git remote. If the project is connected to GitHub via the Lovable GitHub integration (Plus menu → GitHub), the change syncs to the connected repository automatically and appears on its front page. If GitHub is not yet connected, connect it first — no code change is needed beyond the README.

## Verification
- Read the final `README.md` and confirm all 14 sections are present and well-formed markdown.
- Confirm `docs/msme-edi-technical-architecture.pdf` exists in the repo.

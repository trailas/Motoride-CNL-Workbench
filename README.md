# MotoRide CNL Workbench

MotoRide CNL Workbench is a multilingual controlled-natural-language translator for motorcycle route planning and road hazard reporting. It combines a Lex/Flex lexer, a Yacc/Bison parser, and a small local web UI with speech-to-text support.

The project turns constrained commands in Romanian, English, French, Spanish, or German into a normalized JSON representation that could be consumed by a route-planning application such as MotoRide.

## Why This Project

Natural-language interfaces are useful, but unrestricted natural language is difficult to parse reliably with classic compiler tools. This project explores a practical middle ground: a controlled language with multilingual synonyms, a shared grammar, and deterministic output.

Example commands:

```text
Vreau o tura relaxata din Brasov pana in Sinaia fara autostrada prefer viraje.
Report gravel on DN1 near Sinaia with high risk.
I want relaxed ride from Brasov to Sinaia without highways prefer curves.
```

The parser normalizes them into structured commands such as:

```json
{
  "intent": "PLAN_RIDE",
  "start": "Brasov",
  "destination": "Sinaia",
  "style": "relaxed",
  "filters": {
    "avoidHighways": true,
    "preferCurves": true
  }
}
```

The final dot is optional for a single command. It is still useful when writing several commands in the same input.

## Features

- Multilingual controlled input for Romanian, English, French, Spanish, and German.
- Two supported intents:
  - `PLAN_RIDE`: motorcycle route planning.
  - `REPORT_HAZARD`: road hazard reporting.
- Lex/Flex lexical normalization from multiple languages into common parser tokens.
- Yacc/Bison grammar for deterministic parsing and JSON generation.
- Textual parse tree output for grammar inspection and academic evaluation.
- Local web UI for manual input, example loading, parser output, and diagnostics.
- Browser speech-to-text input through the Web Speech API.
- Separate AI Route Advisor layer that evaluates parsed commands after Lex/Yacc succeeds.
- Voice-friendly expressions such as `mai mare de`, `less than`, `moins de`, and `menos de`.
- Optional Hugging Face zero-shot classification when an API token is configured.

## Demo Flow

1. Start the local UI.
2. Type or dictate a controlled command.
3. The browser inserts the recognized speech into the command box.
4. The Node server sends the text to the compiled Lex/Yacc executable.
5. The parser returns normalized JSON and a parse tree.
6. The AI advisor receives the parsed JSON and returns scenic/risk recommendations.

## Tech Stack

- Lex/Flex
- Yacc/Bison
- C
- GCC
- Node.js HTTP server with no external dependencies
- HTML, CSS, JavaScript
- Web Speech API for speech recognition

## Architecture

```text
User text or speech
        |
        v
Browser UI
        |
        v
Node.js local server
        |
        v
motoride.exe
        |
        +-- Flex lexer: multilingual synonym normalization
        |
        +-- Bison parser: shared command grammar
        |
        v
JSON output + textual parse tree
        |
        v
AI Route Advisor
        |
        v
Scenic score + risk score + explanation
```

The main design decision is to keep multilingual behavior in the lexer and domain structure in the parser. For example, `fara`, `without`, `sans`, and `sin` all become the same `WITHOUT` token, so the grammar remains language-independent.

The AI advisor is intentionally separated from the parser. Lex/Yacc decides whether the command is syntactically valid and produces the structured command. The advisor only runs after that step, using the normalized JSON as its input.

## AI Route Advisor

The project includes a separate advisor module in `ui/advisor.js`.

It supports two modes:

- Local advisor: always available, no API key required. It uses transparent scoring rules over the parsed JSON.
- Hugging Face advisor: optional zero-shot classification layer, enabled when a Hugging Face token is provided.

The local advisor produces:

- `scenicScore`: how suitable the route looks for a scenic motorcycle ride.
- `riskScore`: a lightweight risk estimate based on route preferences, weather, and hazard/severity fields.
- `rideFit`: a compact classification such as `strong-scenic-fit`, `relaxed-fit`, or `risky-ride`.
- `tags`: explainable labels such as `avoids-highways`, `curve-friendly`, or `mountain-context`.
- `explanation`: a human-readable recommendation.

This keeps the system explainable for a Lex/Yacc project while leaving room for real ML integration.

Optional Hugging Face setup:

```powershell
$env:HF_API_TOKEN="your_huggingface_token"
node .\ui\server.js
```

By default, the server uses `facebook/bart-large-mnli` for zero-shot classification. You can override it:

```powershell
$env:HF_MODEL="facebook/bart-large-mnli"
```

## Supported Command Shapes

Route planning:

```text
PLAN RIDE FROM <place> TO <place> [STYLE] [WITHOUT HIGHWAYS] [PREFER CURVES]
```

Hazard reporting:

```text
REPORT <hazard> ON <road> NEAR <place> WITH <severity> RISK
```

Weather and risk constraints:

```text
visibility greater than 5 km
rain less than 30
temperature between 10 and 28 C
max distance 180 km
max risk 2
model ml true
```

## Example Inputs

Romanian route planning:

```text
Vreau tura relaxata din Brasov pana in Sinaia fara autostrada prefera viraje vizibilitate mai mare de 5 km ploaie mai mica de 30 temperatura intre 10 si 28 grade risc maxim 2 model ml da.
```

English hazard reporting:

```text
Report gravel on DN1 near Sinaia with high risk.
```

French, Spanish, and German examples are included in the `examples` folder.

## Getting Started

### Prerequisites

On Windows, the project works with:

- `win_bison`
- `win_flex`
- `gcc`
- `node`

The build script also supports the standard `bison` and `flex` command names.

### Build

```powershell
cd proiect
.\scripts\build.ps1
```

Manual build:

```powershell
bison -d -o parser.tab.c motoride.y
flex -o lex.yy.c motoride.l
gcc parser.tab.c lex.yy.c -o motoride.exe
```

### Run From Terminal

```powershell
Get-Content .\examples\test_ro_plan.txt | .\motoride.exe
Get-Content .\examples\test_en_hazard.txt | .\motoride.exe
Get-Content .\examples\test_multilingual.txt | .\motoride.exe
```

Smoke tests:

```powershell
.\scripts\test.ps1
```

### Run The Web UI

```powershell
npm start
```

or:

```powershell
node .\ui\server.js
```

Open:

```text
http://127.0.0.1:3000
```

Speech recognition works best in Chrome or Microsoft Edge on `localhost`. The browser will ask for microphone permission.

The AI advisor can be run from the UI with `Run AI advisor`. It will first run the parser, then analyze the parsed JSON.

## Project Structure

```text
.
|-- motoride.l              # Flex lexer with multilingual token normalization
|-- motoride.y              # Bison parser, JSON output, parse tree output
|-- scripts/
|   |-- build.ps1           # Windows build script
|   `-- test.ps1            # Parser smoke tests
|-- examples/
|   |-- test_ro_plan.txt
|   |-- test_en_hazard.txt
|   `-- test_multilingual.txt
|-- ui/
|   |-- server.js           # Local Node server
|   |-- advisor.js          # Separate AI advisor layer
|   |-- index.html
|   |-- app.js
|   `-- styles.css
`-- docs/
    `-- autoevaluare.md     # Academic project notes
```

Generated build artifacts such as `parser.tab.c`, `parser.tab.h`, `lex.yy.c`, and `motoride.exe` can be regenerated with the build script.

## What This Demonstrates

- Designing a small domain-specific language around a real application domain.
- Separating lexical multilingual normalization from syntactic parsing.
- Building a deterministic translator from controlled natural language to JSON.
- Using classic compiler-construction tools in a modern local web workflow.
- Connecting a C parser executable to a browser UI through a lightweight Node server.
- Extending text input with speech-to-text while preserving the same parser backend.
- Adding AI as a separate post-processing layer over validated structured data.

## Limitations

This is not a general-purpose machine translation system. It intentionally supports a controlled set of sentence patterns and domain vocabulary. Adding a new language means extending the synonym rules in the lexer while keeping the parser grammar mostly unchanged.

## Future Work

- Move language synonyms into an external dictionary file.
- Add more robust place-name handling for multi-word locations.
- Export JSON directly to MotoRide API endpoints.
- Integrate the planned accident-severity ML model behind the `useMlModel` field.
- Replace local scenic heuristics with real route geometry features from MotoRide or Mapbox.
- Add a Hugging Face model specialized for route/scenery classification if a suitable dataset becomes available.
- Add automated parser regression tests for every example command.

## Academic Context

This project was built for a Lex/Yacc laboratory project and is connected conceptually to MotoRide, a motorcycle-focused route planning application. The implementation focuses on grammar design, parse tree generation, ambiguity reduction, and practical translation from controlled natural language to structured data.

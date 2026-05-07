$ErrorActionPreference = "Stop"

Set-Location (Split-Path -Parent $PSScriptRoot)

$bison = Get-Command bison -ErrorAction SilentlyContinue
if (-not $bison) {
    $bison = Get-Command win_bison -ErrorAction SilentlyContinue
}

$flex = Get-Command flex -ErrorAction SilentlyContinue
if (-not $flex) {
    $flex = Get-Command win_flex -ErrorAction SilentlyContinue
}

if (-not $bison) {
    throw "Nu am gasit bison sau win_bison in PATH."
}

if (-not $flex) {
    throw "Nu am gasit flex sau win_flex in PATH."
}

& $bison.Source -d -o parser.tab.c motoride.y
& $flex.Source -o lex.yy.c motoride.l
gcc parser.tab.c lex.yy.c -o motoride.exe

Write-Host "Build complete: motoride.exe"

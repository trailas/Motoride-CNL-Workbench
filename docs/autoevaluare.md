# Autoevaluare Lex/Yacc

## 1. Oficiu

Proiect Lex/Yacc complet: fisiere `.l`, `.y`, exemple de test si documentatie.

## 2. Text problema

Tema: MotoRide CNL, translator multilingv controlat pentru planificarea turelor moto si raportarea hazardelor.

Inputul este o comanda controlata in romana, engleza, franceza sau spaniola. Outputul este un obiect JSON standardizat care poate fi folosit de aplicatia MotoRide.

## 3. Complexitate de baza

Aplicatia recunoaste doua intentii:

- `PLAN_RIDE`: planificare ruta moto.
- `REPORT_HAZARD`: raportare hazard rutier.

Elemente originale:

- normalizare lexicala multilingva;
- acelasi parser semantic pentru mai multe limbi;
- output orientat catre domeniul MotoRide.
- interfata web locala cu speech-to-text pentru romana, engleza, franceza, spaniola si germana.
- modul AI separat, rulat dupa parser, pentru scor scenic/risc si explicatii.

## 4. Complexitate avansata Lex/Yacc

Gramatica include:

- reguli pentru liste de propozitii;
- reguli pentru comenzi cu ordine flexibila a optiunilor;
- reguli pentru ruta: `FROM locatie TO locatie`;
- reguli pentru conditii meteo comparative;
- reguli pentru raportarea hazardelor;
- reguli optionale pentru unitati si scor de risc.

## 5. Arbore de parsare

Programul afiseaza pentru fiecare comanda un arbore textual:

```text
COMMAND
|-- intent: PLAN_RIDE
|-- route
|   |-- from: Brasov
|   `-- to: Sinaia
|-- preferences
...
```

## 6. Rezolvare ambiguitate

Ambiguitatea multilingva este redusa prin tokeni normalizati. De exemplu, `fara`, `without`, `sans` si `sin` devin acelasi token `WITHOUT`.

Ambiguitatea de severitate este controlata prin regula:

```text
risk_level: RISK SEVERITY | SEVERITY RISK | SEVERITY
```

Astfel, sunt acceptate atat `risk high`, cat si `high risk`.

## 7. Avantajul gramaticii

Parserul ramane comun pentru toate limbile. Pentru extinderea la o limba noua se modifica doar lexerul prin adaugarea de sinonime, nu structura sintactica.

## 8. Test principal

Fisier: `examples/test_ro_plan.txt`

Comanda contine ruta, stil, evitare autostrada, preferinta pentru viraje, conditii meteo, distanta maxima, risc maxim si activare model ML.

## 9. Teste suplimentare

Fisier: `examples/test_en_hazard.txt`

Comanda de raportare hazard in engleza.

Fisier: `examples/test_multilingual.txt`

Comenzi in franceza si spaniola.

## 10. Concluzii si imbunatatiri

Proiectul demonstreaza cum Lex/Yacc poate fi folosit pentru un Controlled Natural Language aplicat intr-un domeniu real.

Interfata locala extinde partea de input: utilizatorul poate introduce manual textul sau poate dicta o comanda, iar textul recunoscut este trimis aceluiasi parser Lex/Yacc.

Modulul AI este separat de parser: Lex/Yacc valideaza si transforma inputul in JSON, apoi advisorul analizeaza JSON-ul si produce scoruri/recomandari. Astfel, partea de gramatica ramane obligatorie si verificabila.

Imbunatatiri propuse:

1. Export direct catre endpointurile MotoRide.
2. Integrarea efectiva cu modelul ML de severitate.
3. Adaugarea unui dictionar extern JSON pentru sinonime, ca sa nu fie necesara recompilarea lexerului.

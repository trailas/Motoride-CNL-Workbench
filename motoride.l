%{
#include "parser.tab.h"
#include <ctype.h>
#include <stdlib.h>
#include <string.h>

static char *copy_text(const char *text);
static char *copy_quoted(const char *text);
static int is_only_space(const char *text);

static int saw_content = 0;
static int last_was_terminator = 0;
static int sent_eof_terminator = 0;

/* A final dot is inserted virtually when the user omits it. */
#define YY_USER_ACTION                                                      \
    do {                                                                    \
        if (!is_only_space(yytext) && yytext[0] != '#' && yytext[0] != ',') { \
            saw_content = 1;                                                \
            last_was_terminator = strcmp(yytext, ".") == 0 || strcmp(yytext, ";") == 0; \
        }                                                                   \
    } while (0);
%}

%option noyywrap
%option yylineno
%option case-insensitive

%%

    /* Ignore whitespace, punctuation, and common filler words from speech. */
[ \t\r\n]+                                      ;
"#".*                                           ;
","                                             ;
"o"|"un"|"an"|"the"|"sa"|"i"|"je"|"yo"          ;
"une"|"una"|"unos"|"unas"|"le"|"les"|"el"|"los"|"las" ;
"ich"|"ein"|"eine"|"einen"|"einem"|"der"|"die"|"das"|"den"|"dem" ;
"."                                             return '.';
";"                                             return ';';

    /* Normalize written and spoken comparisons to the same tokens. */
"<="                                            return LE;
">="                                            return GE;
"=="|"="                                        return EQ;
"<"                                             return LT;
">"                                             return GT;
"less than"|"under"|"below"                     return LT;
"greater than"|"more than"|"over"|"above"       return GT;
"equal to"|"equals"                             return EQ;
"mai mic decat"|"mai mica decat"|"mai mic de"|"mai mica de"|"sub" return LT;
"mai mare decat"|"mai mare de"|"peste"          return GT;
"egal cu"|"egala cu"                            return EQ;
"moins de"|"inferieur a"|"inferieure a"         return LT;
"plus de"|"superieur a"|"superieure a"          return GT;
"egal a"|"egale a"                              return EQ;
"menos de"|"menor que"|"inferior a"             return LT;
"mas de"|"mayor que"|"superior a"               return GT;
"igual a"                                       return EQ;
"kleiner als"|"weniger als"|"unter"             return LT;
"groesser als"|"grosser als"|"mehr als"|"ueber"|"uber" return GT;
"gleich"|"gleich mit"                           return EQ;

    /* Intent words from all supported languages become shared parser tokens. */
"i want"|"i would like"|"i would love"|"want"|"please plan"|"plan" return PLAN;
"vreau"|"as vrea"|"planifica"|"creeaza"         return PLAN;
"je veux"|"je voudrais"|"veux"|"voudrais"|"planifier"|"creer" return PLAN;
"quiero"|"quisiera"|"planificar"|"crear"        return PLAN;
"ich will"|"ich mochte"|"mochte"|"will"|"planen" return PLAN;

"report"|"report hazard"                        return REPORT;
"raporteaza"|"semnaleaza"                       return REPORT;
"signaler"|"rapporter"                          return REPORT;
"reportar"|"senalar"                            return REPORT;
"melden"|"melde"|"gefahr melden"                return REPORT;

    /* Route verbs are accepted inside planning commands. */
"ride"|"route"|"trip"                           return RIDE;
"tura"|"ruta"|"traseu"                           return RIDE;
"balade"|"trajet"                               return RIDE;
"ruta moto"|"viaje"                             return RIDE;
"merg"|"merge"|"go"|"going"                     return RIDE;
"aller"|"ir"                                    return RIDE;
"tour"|"fahrt"|"fahren"                         return RIDE;

    /* Route connectors are language specific, but the parser sees only FROM and TO. */
"from"|"din"|"de la"|"de"|"desde"               return FROM;
"to"|"a"|"la"|"pana la"|"pana in"|"catre"|"hasta" return TO;
"von"|"aus"                                     return FROM;
"nach"|"bis"|"zu"                               return TO;

    /* Preference tokens become route filters in the final JSON. */
"without"|"fara"|"sans"|"sin"                   return WITHOUT;
"avoid"|"evit"|"evita"|"eviter"|"evitar"        return AVOID;
"prefer"|"prefera"|"preferer"|"preferir"        return PREFER;
"ohne"                                          return WITHOUT;
"vermeide"|"vermeiden"                          return AVOID;
"bevorzuge"|"bevorzugen"                        return PREFER;
"with"|"cu"|"avec"|"con"                        return WITH;
"on"|"pe"|"sur"|"en"                            return ON;
"near"|"langa"|"aproape de"|"pres de"|"cerca de" return NEAR;
"mit"                                           return WITH;
"auf"                                           return ON;
"nahe"|"in der nahe von"|"naehe"|"in der naehe von" return NEAR;

    /* Domain vocabulary for motorcycle route planning. */
"highway"|"highways"|"motorway"                 return HIGHWAYS;
"autostrada"|"autostrazi"|"autoroute"|"autopista" return HIGHWAYS;
"autobahn"|"autobahnen"                         return HIGHWAYS;
"curves"|"curve roads"|"curvy roads"            return CURVES;
"viraje"|"curbe"|"drumuri virajate"             return CURVES;
"virages"|"courbes"|"curvas"                    return CURVES;
"kurven"|"kurvige strassen"|"kurvige strassen"  return CURVES;

    /* Weather and risk constraints are optional planning details. */
"weather"|"meteo"|"vreme"|"meteo conditions"   return WEATHER;
"visibility"|"vizibilitate"|"visibilite"|"visibilidad" return VISIBILITY;
"rain"|"ploaie"|"pluie"|"lluvia"                return RAIN;
"temperature"|"temperatura"                     return TEMPERATURE;
"wetter"                                        return WEATHER;
"sichtweite"|"sicht"                            return VISIBILITY;
"regen"                                         return RAIN;
"temperatur"                                    return TEMPERATURE;
"between"|"intre"|"entre"|"zwischen"            return BETWEEN;
"and"|"si"|"et"|"y"|"und"                       return AND;
"max"|"maximum"|"maxim"                         return MAX;
"distance"|"distanta"|"distance totale"|"distancia" return DISTANCE;
"maximal"                                       return MAX;
"entfernung"|"distanz"                          return DISTANCE;
"risk"|"risc"|"risque"|"riesgo"|"risiko"        return RISK;
"use_ml_model"|"model_ml"|"ml_model"|"model ml"|"ml model" return USE_MODEL;
"ml modell"|"modell ml"                         return USE_MODEL;
"true"|"yes"|"da"|"oui"|"si"                    return TRUE;
"false"|"no"|"nu"|"non"                         return FALSE;

    /* Semantic values are copied as canonical English strings. */
"relaxed"|"relaxat"|"relaxata"|"relax"|"relajada"|"detendue"|"entspannt"|"entspannte" {
                                                    yylval.text = copy_text("relaxed");
                                                    return STYLE;
                                                }
"sport"|"sportiv"|"sportiva"|"deportiva"        {
                                                    yylval.text = copy_text("sport");
                                                    return STYLE;
                                                }
"touring"|"turistic"|"turistica"|"touristique"|"touristisch"  {
                                                    yylval.text = copy_text("touring");
                                                    return STYLE;
                                                }
"adventure"|"aventura"|"aventure"               {
                                                    yylval.text = copy_text("adventure");
                                                    return STYLE;
                                                }

"gravel"|"pietris"|"gravier"|"grava"|"kies"     {
                                                    yylval.text = copy_text("gravel");
                                                    return HAZARD;
                                                }
"oil"|"ulei"|"huile"|"aceite"|"oel"|"ol"        {
                                                    yylval.text = copy_text("oil");
                                                    return HAZARD;
                                                }
"pothole"|"groapa"|"nid de poule"|"bache"|"schlagloch" {
                                                    yylval.text = copy_text("pothole");
                                                    return HAZARD;
                                                }
"accident"|"crash"                               {
                                                    yylval.text = copy_text("accident");
                                                    return HAZARD;
                                                }
"roadworks"|"lucrari"|"travaux"|"obras"|"baustelle" {
                                                    yylval.text = copy_text("roadworks");
                                                    return HAZARD;
                                                }

    /* Risk levels are normalized to a small fixed vocabulary. */
"low"|"mic"|"scazut"|"faible"|"bajo"|"niedrig"  {
                                                    yylval.text = copy_text("low");
                                                    return SEVERITY;
                                                }
"medium"|"mediu"|"moyen"|"medio"|"mittel"       {
                                                    yylval.text = copy_text("medium");
                                                    return SEVERITY;
                                                }
"high"|"mare"|"ridicat"|"eleve"|"alto"|"hoch"   {
                                                    yylval.text = copy_text("high");
                                                    return SEVERITY;
                                                }

"km"|"kilometers"|"kilometri"|"kilometres"|"kilometer" {
                                                    yylval.text = copy_text("km");
                                                    return UNIT;
                                                }
"m"|"meters"|"metri"|"metres"                   {
                                                    yylval.text = copy_text("m");
                                                    return UNIT;
                                                }
"c"|"celsius"                                    {
                                                    yylval.text = copy_text("C");
                                                    return UNIT;
                                                }
"grade"|"degrees"|"degres"|"grados"             {
                                                    yylval.text = copy_text("C");
                                                    return UNIT;
                                                }
"%"|"percent"|"procent"                         {
                                                    yylval.text = copy_text("percent");
                                                    return UNIT;
                                                }

    /* Unknown words are treated as places, which keeps city and road names flexible. */
[0-9]+                                           {
                                                    yylval.number = atoi(yytext);
                                                    return NUMBER;
                                                }
\"([^\\\"]|\\.)*\"                               {
                                                    yylval.text = copy_quoted(yytext);
                                                    return PLACE;
                                                }
[A-Za-z][A-Za-z0-9_-]*                           {
                                                    yylval.text = copy_text(yytext);
                                                    return PLACE;
                                                }
.                                                {
                                                    fprintf(stderr, "Unknown character '%s' at line %d\n", yytext, yylineno);
                                                }
<<EOF>>                                          {
                                                    if (saw_content && !last_was_terminator && !sent_eof_terminator) {
                                                        sent_eof_terminator = 1;
                                                        last_was_terminator = 1;
                                                        return '.';
                                                    }
                                                    return 0;
                                                }

%%

    /* Flex reuses yytext, so semantic values must be copied. */
static char *copy_text(const char *text) {
    char *result = (char *)malloc(strlen(text) + 1);
    if (!result) exit(1);
    strcpy(result, text);
    return result;
}

    /* Quoted places allow names with spaces. */
static char *copy_quoted(const char *text) {
    size_t len = strlen(text);
    if (len < 2) return copy_text(text);
    char *result = (char *)malloc(len - 1);
    if (!result) exit(1);
    memcpy(result, text + 1, len - 2);
    result[len - 2] = '\0';
    return result;
}

static int is_only_space(const char *text) {
    const unsigned char *p = (const unsigned char *)text;
    while (*p) {
        if (!isspace(*p)) return 0;
        p++;
    }
    return 1;
}

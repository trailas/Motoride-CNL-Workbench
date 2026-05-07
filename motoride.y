%{
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int yylex(void);
extern int yylineno;
void yyerror(const char *s);

typedef struct Command {
    /* Semantic object built by the parser before JSON output. */
    char intent[32];
    char start[128];
    char destination[128];
    char style[64];
    int avoid_highways;
    int prefer_curves;
    int use_ml_model;
    int max_distance;
    char distance_unit[16];
    int max_risk;
    int visibility_value;
    char visibility_op[8];
    char visibility_unit[16];
    int rain_value;
    char rain_op[8];
    int temperature_min;
    int temperature_max;
    char temperature_unit[16];
    char hazard_type[64];
    char road[128];
    char near_place[128];
    char severity[32];
} Command;

static Command current;

static void reset_command(const char *intent);
static void copy_field(char *dst, size_t size, const char *src);
static void set_route(char *start, char *destination);
static void set_style(char *style);
static void set_hazard(char *hazard);
static void set_road(char *road);
static void set_near(char *place);
static void set_severity(char *severity);
static void set_visibility(char *op, int value, char *unit);
static void set_rain(char *op, int value);
static void set_temperature_range(int min_value, int max_value, char *unit);
static void set_max_distance(int value, char *unit);
static void set_max_risk(int value);
static void json_string(const char *s);
static void print_command(void);
static void print_tree(void);
%}

%union {
    char *text;
    int number;
}

%token PLAN REPORT RIDE FROM TO WITHOUT WITH ON NEAR AVOID PREFER HIGHWAYS CURVES
%token WEATHER VISIBILITY RAIN TEMPERATURE BETWEEN AND MAX DISTANCE RISK USE_MODEL TRUE FALSE
%token LT GT LE GE EQ
%token <text> PLACE STYLE HAZARD SEVERITY UNIT
%token <number> NUMBER

%type <text> location compare optional_unit bool_value

%%

program
    : statements
    ;

statements
    : statements statement
    | statement
    ;

terminator
    : '.'
    | ';'
    ;

statement
    : plan_marker plan_body terminator       { print_command(); }
    | hazard_marker hazard_body terminator   { print_command(); }
    ;

plan_marker
    : PLAN                        { reset_command("PLAN_RIDE"); }
    ;

hazard_marker
    : REPORT                      { reset_command("REPORT_HAZARD"); }
    ;

/* Planning commands are made from small parts that can appear in flexible order. */
plan_body
    : plan_parts
    ;

plan_parts
    : plan_parts plan_part
    | plan_part
    ;

plan_part
    : RIDE
    | PLAN
    | AND
    | TO
    | route_spec
    | STYLE                       { set_style($1); free($1); }
    | WITHOUT HIGHWAYS            { current.avoid_highways = 1; }
    | AVOID HIGHWAYS              { current.avoid_highways = 1; }
    | PREFER CURVES               { current.prefer_curves = 1; }
    | WITH STYLE                  { set_style($2); free($2); }
    | weather_expr
    | max_distance_expr
    | risk_expr
    | ml_expr
    ;

route_spec
    : FROM location TO location   { set_route($2, $4); free($2); free($4); }
    | location TO location        { set_route($1, $3); free($1); free($3); }
    ;

/* Weather comparisons keep the operator for the JSON representation. */
weather_expr
    : WEATHER
    | VISIBILITY compare NUMBER optional_unit
                                  { set_visibility($2, $3, $4); free($2); free($4); }
    | RAIN compare NUMBER         { set_rain($2, $3); free($2); }
    | TEMPERATURE BETWEEN NUMBER AND NUMBER optional_unit
                                  { set_temperature_range($3, $5, $6); free($6); }
    ;

max_distance_expr
    : MAX DISTANCE NUMBER optional_unit
                                  { set_max_distance($3, $4); free($4); }
    | DISTANCE MAX NUMBER optional_unit
                                  { set_max_distance($3, $4); free($4); }
    ;

risk_expr
    : MAX RISK NUMBER             { set_max_risk($3); }
    | RISK MAX NUMBER             { set_max_risk($3); }
    ;

ml_expr
    : USE_MODEL bool_value        {
                                      current.use_ml_model =
                                          strcmp($2, "true") == 0 ? 1 : 0;
                                      free($2);
                                  }
    ;

hazard_body
    : hazard_parts
    ;

hazard_parts
    : hazard_parts hazard_part
    | hazard_part
    ;

/* Hazard severity accepts both risk high and high risk. */
hazard_part
    : HAZARD                      { set_hazard($1); free($1); }
    | ON location                 { set_road($2); free($2); }
    | NEAR location               { set_near($2); free($2); }
    | WITH RISK SEVERITY          { set_severity($3); free($3); }
    | WITH SEVERITY RISK          { set_severity($2); free($2); }
    | RISK SEVERITY               { set_severity($2); free($2); }
    | SEVERITY RISK               { set_severity($1); free($1); }
    ;

location
    : PLACE                       { $$ = $1; }
    ;

compare
    : LT                          { $$ = strdup("<"); }
    | GT                          { $$ = strdup(">"); }
    | LE                          { $$ = strdup("<="); }
    | GE                          { $$ = strdup(">="); }
    | EQ                          { $$ = strdup("="); }
    ;

optional_unit
    : UNIT                        { $$ = $1; }
    |                             { $$ = strdup(""); }
    ;

bool_value
    : TRUE                        { $$ = strdup("true"); }
    | FALSE                       { $$ = strdup("false"); }
    ;

%%

/* Start a new command and clear values from the previous one. */
static void reset_command(const char *intent) {
    memset(&current, 0, sizeof(current));
    copy_field(current.intent, sizeof(current.intent), intent);
}

static void copy_field(char *dst, size_t size, const char *src) {
    if (!src) return;
    snprintf(dst, size, "%s", src);
}

static void set_route(char *start, char *destination) {
    copy_field(current.start, sizeof(current.start), start);
    copy_field(current.destination, sizeof(current.destination), destination);
}

static void set_style(char *style) {
    copy_field(current.style, sizeof(current.style), style);
}

static void set_hazard(char *hazard) {
    copy_field(current.hazard_type, sizeof(current.hazard_type), hazard);
}

static void set_road(char *road) {
    copy_field(current.road, sizeof(current.road), road);
}

static void set_near(char *place) {
    copy_field(current.near_place, sizeof(current.near_place), place);
}

static void set_severity(char *severity) {
    copy_field(current.severity, sizeof(current.severity), severity);
}

static void set_visibility(char *op, int value, char *unit) {
    copy_field(current.visibility_op, sizeof(current.visibility_op), op);
    current.visibility_value = value;
    copy_field(current.visibility_unit, sizeof(current.visibility_unit), unit);
}

static void set_rain(char *op, int value) {
    copy_field(current.rain_op, sizeof(current.rain_op), op);
    current.rain_value = value;
}

static void set_temperature_range(int min_value, int max_value, char *unit) {
    current.temperature_min = min_value;
    current.temperature_max = max_value;
    copy_field(current.temperature_unit, sizeof(current.temperature_unit), unit);
}

static void set_max_distance(int value, char *unit) {
    current.max_distance = value;
    copy_field(current.distance_unit, sizeof(current.distance_unit), unit);
}

static void set_max_risk(int value) {
    current.max_risk = value;
}

/* The project prints JSON directly to avoid an extra C dependency. */
static void json_string(const char *s) {
    const unsigned char *p = (const unsigned char *)s;
    putchar('"');
    while (*p) {
        if (*p == '"' || *p == '\\') {
            putchar('\\');
            putchar(*p);
        } else if (*p == '\n') {
            printf("\\n");
        } else {
            putchar(*p);
        }
        p++;
    }
    putchar('"');
}

/* Print the normalized command used by the UI and the AI advisor. */
static void print_command(void) {
    printf("{\n");
    printf("  \"intent\": ");
    json_string(current.intent);

    if (strcmp(current.intent, "PLAN_RIDE") == 0) {
        if (current.start[0]) {
            printf(",\n  \"start\": ");
            json_string(current.start);
        }
        if (current.destination[0]) {
            printf(",\n  \"destination\": ");
            json_string(current.destination);
        }
        if (current.style[0]) {
            printf(",\n  \"style\": ");
            json_string(current.style);
        }
        printf(",\n  \"filters\": {");
        printf("\n    \"avoidHighways\": %s,", current.avoid_highways ? "true" : "false");
        printf("\n    \"preferCurves\": %s", current.prefer_curves ? "true" : "false");
        if (current.max_distance > 0) {
            printf(",\n    \"maxDistance\": { \"value\": %d, \"unit\": ", current.max_distance);
            json_string(current.distance_unit[0] ? current.distance_unit : "km");
            printf(" }");
        }
        printf("\n  }");

        if (current.visibility_value || current.rain_value || current.temperature_min || current.temperature_max) {
            printf(",\n  \"weather\": {");
            int comma = 0;
            if (current.visibility_value) {
                printf("\n    \"visibility\": { \"operator\": ");
                json_string(current.visibility_op);
                printf(", \"value\": %d, \"unit\": ", current.visibility_value);
                json_string(current.visibility_unit[0] ? current.visibility_unit : "km");
                printf(" }");
                comma = 1;
            }
            if (current.rain_value) {
                printf("%s\n    \"rain\": { \"operator\": ", comma ? "," : "");
                json_string(current.rain_op);
                printf(", \"value\": %d, \"unit\": \"percent\" }", current.rain_value);
                comma = 1;
            }
            if (current.temperature_min || current.temperature_max) {
                printf("%s\n    \"temperature\": { \"min\": %d, \"max\": %d, \"unit\": ",
                       comma ? "," : "", current.temperature_min, current.temperature_max);
                json_string(current.temperature_unit[0] ? current.temperature_unit : "C");
                printf(" }");
            }
            printf("\n  }");
        }

        if (current.max_risk || current.use_ml_model) {
            printf(",\n  \"risk\": {");
            printf("\n    \"useMlModel\": %s", current.use_ml_model ? "true" : "false");
            if (current.max_risk) {
                printf(",\n    \"maxSeverity\": %d", current.max_risk);
            }
            printf("\n  }");
        }
    } else {
        if (current.hazard_type[0]) {
            printf(",\n  \"hazardType\": ");
            json_string(current.hazard_type);
        }
        if (current.road[0]) {
            printf(",\n  \"road\": ");
            json_string(current.road);
        }
        if (current.near_place[0]) {
            printf(",\n  \"near\": ");
            json_string(current.near_place);
        }
        if (current.severity[0]) {
            printf(",\n  \"severity\": ");
            json_string(current.severity);
        }
    }

    printf("\n}\n\n");
    print_tree();
    printf("\n");
}

/* The textual tree is included for the Lex/Yacc project requirements. */
static void print_tree(void) {
    printf("Parse tree:\n");
    printf("COMMAND\n");
    printf("|-- intent: %s\n", current.intent);
    if (strcmp(current.intent, "PLAN_RIDE") == 0) {
        printf("|-- route\n");
        printf("|   |-- from: %s\n", current.start[0] ? current.start : "-");
        printf("|   `-- to: %s\n", current.destination[0] ? current.destination : "-");
        printf("|-- preferences\n");
        printf("|   |-- style: %s\n", current.style[0] ? current.style : "-");
        printf("|   |-- avoidHighways: %s\n", current.avoid_highways ? "true" : "false");
        printf("|   `-- preferCurves: %s\n", current.prefer_curves ? "true" : "false");
        printf("|-- weather\n");
        printf("|   |-- visibility: %s %d %s\n",
               current.visibility_op[0] ? current.visibility_op : "-",
               current.visibility_value,
               current.visibility_unit[0] ? current.visibility_unit : "");
        printf("|   |-- rain: %s %d percent\n",
               current.rain_op[0] ? current.rain_op : "-",
               current.rain_value);
        printf("|   `-- temperature: %d..%d %s\n",
               current.temperature_min,
               current.temperature_max,
               current.temperature_unit[0] ? current.temperature_unit : "");
        printf("`-- risk\n");
        printf("    |-- useMlModel: %s\n", current.use_ml_model ? "true" : "false");
        printf("    `-- maxSeverity: %d\n", current.max_risk);
    } else {
        printf("|-- hazard\n");
        printf("|   |-- type: %s\n", current.hazard_type[0] ? current.hazard_type : "-");
        printf("|   |-- road: %s\n", current.road[0] ? current.road : "-");
        printf("|   `-- near: %s\n", current.near_place[0] ? current.near_place : "-");
        printf("`-- severity: %s\n", current.severity[0] ? current.severity : "-");
    }
}

void yyerror(const char *s) {
    fprintf(stderr, "Syntax error at line %d: %s\n", yylineno, s);
}

int main(void) {
    return yyparse();
}

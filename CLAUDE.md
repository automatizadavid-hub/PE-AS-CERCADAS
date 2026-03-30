# PEÑAS CERCADAS — Sistema de Gestión Ganadera

## PROPIETARIO
David (automatizadavid@gmail.com) — ganadero de caprino en Valencia, España.

## DESCRIPCIÓN
App web de gestión integral para granja de ~839 cabras + 32 machos de raza Murciano-Granadina en régimen intensivo. Controla producción de leche, reproducción, sanidad, anomalías y finanzas. Incluye un asistente IA (Claude Opus 4.6) que cruza todos los datos para dar análisis que un ganadero humano no podría hacer por sí solo.

## STACK TECNOLÓGICO
- **Frontend**: React 18 (Vite) — archivo único `src/App.jsx` (~4500 líneas)
- **Backend**: Vercel Serverless Function — `api/chat.js` (Claude API proxy)
- **Base de datos**: Supabase (PostgreSQL) — 18 tablas
- **IA**: Claude Opus 4.6 via API (modelo: `claude-opus-4-6`, max_tokens: 16384)
- **Deploy**: Vercel auto-deploy desde GitHub (main branch)
- **Repo**: github.com/automatizadavid-hub/PE-AS-CERCADAS
- **URL**: pe-as-cercadas.vercel.app
- **Auth**: Supabase Auth (email/password)

## ESTRUCTURA DEL PROYECTO
```
PE-AS-CERCADAS/
├── api/
│   └── chat.js          # Vercel Serverless — proxy Claude API
├── src/
│   ├── App.jsx          # TODO el frontend (componentes, páginas, lógica)
│   └── main.jsx         # Entry point React
├── index.html
├── package.json
├── vite.config.js
└── CLAUDE.md            # Este archivo
```

## SUPABASE — URL Y CLAVE
- URL: `https://lgorvuqlehnljuaqtlet.supabase.co`
- Anon Key: está en App.jsx línea 9 (createClient)
- Proyecto: PEÑAS CERCADAS (plan Free)
- API Key de Anthropic: variable de entorno `ANTHROPIC_API_KEY` en Vercel

## BASE DE DATOS — 18 TABLAS

### Tablas principales (con relaciones)
```sql
cabra (id SERIAL PK, crotal TEXT UNIQUE, estado TEXT, raza TEXT, fecha_nacimiento DATE, 
       num_lactaciones INT, dias_en_leche INT, edad_meses FLOAT, estado_ginecologico TEXT,
       lote_id INT FK→lote, notas TEXT, riia TEXT, id_electronico TEXT, fecha_entrada DATE)

lote (id SERIAL PK, nombre TEXT, tipo TEXT, descripcion TEXT, estado TEXT DEFAULT 'produccion')
  -- estado: 'produccion' | 'secandose' | 'pariendo'

macho (id SERIAL PK, crotal TEXT UNIQUE, raza TEXT, fecha_nacimiento DATE, origen TEXT, notas TEXT)

paridera (id SERIAL PK, nombre TEXT, fecha_entrada_machos DATE, fecha_partos_estimada DATE, notas TEXT)

produccion_leche (id SERIAL PK, cabra_id INT FK→cabra, fecha DATE, litros FLOAT,
                  dia_lactacion INT, lactacion_num INT, media_10d FLOAT, promedio_10d FLOAT,
                  litros_totales_lactacion FLOAT, media_total FLOAT, promedio_total FLOAT,
                  conductividad FLOAT, tiempo_ordeno FLOAT, flujo FLOAT, lote_nombre TEXT,
                  ultima_produccion FLOAT, UNIQUE(cabra_id, fecha))

parto (id SERIAL PK, cabra_id INT FK→cabra, paridera_id INT FK→paridera, fecha DATE,
       tipo TEXT, num_crias INT, num_machos INT, num_hembras INT, observaciones TEXT)
  -- tipo: 'normal' | 'aborto'

ecografia (id SERIAL PK, cabra_id INT FK→cabra, paridera_id INT FK→paridera, 
           fecha DATE, resultado TEXT)
  -- resultado: 'gestante' | 'vacia' | 'prenada'

cubricion (id SERIAL PK, cabra_id INT FK→cabra, paridera_id INT FK→paridera,
           macho_id INT FK→macho, fecha_entrada DATE, fecha_salida DATE, metodo TEXT, notas TEXT)
  -- metodo: 'monta_natural' | 'inseminacion'

cria (id SERIAL PK, madre_id INT FK→cabra, peseta TEXT, sexo TEXT, 
      fecha_nacimiento DATE, paridera_id INT FK→paridera)

tratamiento (id SERIAL PK, cabra_id INT FK→cabra, fecha DATE, tipo TEXT, 
             producto TEXT, notas TEXT)
  -- tipo: 'vacunacion' | 'desparasitacion' | 'fertilidad' | 'antibiotico' | 'tratamiento' | 'general'

muerte (id SERIAL PK, cabra_id INT FK→cabra, fecha DATE, causa TEXT)

anotacion_veterinaria (id SERIAL PK, cabra_id INT FK→cabra, fecha DATE, 
                       texto TEXT, tipo TEXT, autor TEXT)

alerta_sanitaria (id SERIAL PK, titulo TEXT, descripcion TEXT, severidad TEXT, 
                  fecha DATE, estado TEXT)

anomalia_detectada (id SERIAL PK, fecha DATE, tipo TEXT, severidad TEXT, crotal TEXT,
                    lote_nombre TEXT, descripcion TEXT, hipotesis TEXT, accion TEXT,
                    estado TEXT DEFAULT 'pendiente', resuelto_at TIMESTAMPTZ, notas_resolucion TEXT)
  -- estado: 'pendiente' | 'revisando' | 'resuelta'

chat_guardado (id SERIAL PK, nombre TEXT, pagina TEXT, mensajes JSONB, fecha TIMESTAMPTZ)

censo_oficial (id SERIAL PK, crotal TEXT, riia TEXT, id_electronico TEXT, sexo TEXT,
               fecha_nacimiento DATE, raza TEXT, fecha_entrada DATE)
```

### Tablas auxiliares
```sql
regla, parametro_granja, protocolo_veterinario, evento_calendario, 
resumen_diario, importacion, cambio_lote
```

## LOTES ACTUALES DE LA GRANJA
- **Lote 1**: Alta producción — cabras con DEL avanzados, candidatas a cubrición
- **Lote 2**: Pariendo ahora — NO tocar
- **Lote 3**: Secándose para parir — NO tocar, PROHIBIDO cubrición
- **Lote 4**: Baja producción — candidatas a cubrición
- **Lote 5**: Recién paridas enero — NO tocar, pocos DEL
- **Lote 6**: Post-machos (febrero) — ya cubiertas, EXCEPTO las vacías en ecografía
- **Lote 13**: Recién paridas febrero — NO tocar, pocos DEL

## PÁGINAS DE LA APP (9 total)
1. **Dashboard** — KPIs, alertas, calendario, buscador cabras, historial individual
2. **Producción** — Gráficas, análisis histórico, ranking, chat especializado
3. **Sanidad** — Conductividad, patrones, descarte, doble vacías, anotaciones vet
4. **Rentabilidad** — Finanzas (datos demo), previsión, chat financiero
5. **Importador** — CSV (5 tipos) + chat que escribe en BD (tratamientos, muertes, cambios lote)
6. **Consultas** — Chat libre con datos cruzados, ficha completa por cabra
7. **Anomalías** — Detector errores humanos (3 carpetas: pendientes/revisando/resueltas)
8. **Guardados** — Historial de chats guardados
9. **Config** — Reglas, protocolos, estados de lote, configuración general

## COMPONENTES PRINCIPALES
```
App (root) → LoginPage | LoadingScreen | [9 pages]
  ├── buildDataContext()     — Construye contexto para Claude API
  ├── askClaude()            — Proxy fetch a /api/chat
  ├── useSupabaseData()      — Hook datos (18 queries paralelas)
  ├── DataModal              — Modal genérico con carpetas y búsqueda
  ├── CabraHistorialModal    — Ficha completa de vida de una cabra
  ├── ChatBox                — Chat reutilizable con expand + guardar
  ├── detectAnomalias()      — Detecta 7 tipos de anomalías
  ├── DashboardPage          — KPIs + búsqueda + modales
  ├── ProduccionPage         — Gráficas + análisis + chat
  ├── SanidadPage            — 6 tarjetas expandibles + chat
  ├── RentabilidadPage       — Finanzas + chat
  ├── ImportadorPage         — CSV (5 tipos) + chat con escritura BD
  ├── ConsultasPage          — Chat libre con contexto rico
  ├── AnomalíasPage          — 3 carpetas navegables
  ├── GuardadosPage          — Chats guardados con preview
  └── ConfigPage             — Reglas + protocolos + estados lote
```

## LÓGICA DE REPRODUCCIÓN Y CUBRICIÓN (CRÍTICA)

### Regla fundamental
NUNCA recomendar cabras de Lote 2, 3, 5, 6 (gestantes), o 13 para cubrición. SOLO Lote 1 y 4 + vacías del 6.

### 4 Parideras al año
- Machos entran: 20 feb / 15 may / 15 ago / 15 nov
- Implantes: 45 días ANTES de machos
- Inseminación artificial: 15 días ANTES de machos (30 mejores)
- Ecografías: 65-80 días post-machos
- Gestación: ~150 días

### DEL Proyectado
El código calcula `DEL proyectado = DEL hoy + días hasta que entren los machos`. La evaluación se basa en el DEL proyectado, NO en el DEL actual.

### Umbrales de aptitud
| DEL Proyectado | Producción | Aptitud |
|---|---|---|
| <130 | cualquiera | NO_APTA — demasiado pronto |
| 130-150 | <1.5L | ADELANTAR — mala productora, se va a secar |
| 130-150 | >=1.5L | NO_APTA — aún produce bien, esperar |
| 150-220 | cualquiera | APTA — franja normal |
| 180-220 | >2.5L | IDEAL — zona perfecta para buenas |
| >220 | cualquiera | URGENTE — debería haberse cubierto |

### Selección genética para inseminación (30 mejores)
Orden de prioridad:
1. **LitrosTotalesLactación** (rendimiento acumulado = mejor indicador genético)
2. Producción diaria actual
3. Pocas lactaciones (más joven = mejor inversión genética)

Filtros: sin doble vacía, sin abortos, conductividad <6.5

### Buenas productoras (>2.5L)
Se ESTIRAN al máximo hasta ~210 DEL. No se desperdician metiéndolas antes. Una cabra con 4L y DEL proyectado 95 NO SE TOCA.

### Malas productoras (<1.5L)
Se ADELANTA la cubrición si dejarla para la siguiente paridera la haría no rentable.

### Vacías del Lote 6
Si la última ecografía fue vacía → DEBEN entrar a cubrición. Error humano si siguen en Lote 6 con las gestantes.

## CONDUCTIVIDAD (Murciano-Granadina)
- Normal: 5.2-5.7 mS/cm
- >6.0: revisar mastitis subclínica
- >6.5: alerta alta
- 0.00: cabra NO ordeñada ese día (secándose o sin datos)

## CRITERIOS DE DESCARTE
- <1.5L/día + ≥3 lactaciones + >60 DEL
- Doble vacía (2+ ecografías consecutivas)
- Conductividad >6.5 persistente
- Abortos repetidos
- Combinación de factores leves

## IMPORTADOR — 5 TIPOS DE CSV
1. **Producción FLM**: columnas por nombre (crotal, grupo, DEL, prod diaria, prom 10d, lactación, litros totales, promedio total, conductividad, tiempo ordeño, flujo). Upsert por cabra_id+fecha.
2. **Paridera**: FECHA;CROTAL;CABRITOS;MACHOS;HEMBRAS;PESETA;OBSERVACIONES (incluye abortos, vacías, partos normales). Skip duplicados por crotal+paridera.
3. **Tratamientos**: CROTAL;TIPO;PRODUCTO;FECHA;OBSERVACIONES (flexible, busca columnas por nombre)
4. **Inseminación**: CROTAL;FECHA;MACHO/DOSIS;PARIDERA;OBSERVACIONES → tabla cubricion con metodo="inseminacion"
5. **Anotaciones vet**: CROTAL;TEXTO (busca columnas automáticamente)

## CHAT DEL IMPORTADOR — ACCIONES DIRECTAS EN BD
El chat del importador puede escribir directamente en Supabase:
- "He vacunado al Lote 3 de enterotoxemias" → INSERT tratamiento para todas las cabras del lote
- "He desparasitado el Lote 6" → INSERT tratamiento masivo
- "He tratado la 057717 con antibiótico" → INSERT tratamiento individual
- "Se ha muerto la cabra 057600" → INSERT muerte + UPDATE cabra estado="muerta"
- "Mueve la 056749 al Lote 4" → UPDATE cabra lote_id

## DETECTOR DE ANOMALÍAS (7 tipos)
1. **lote_incorrecto**: DEL muy diferente a la media del lote (>100 días diferencia)
2. **secado_sospechoso**: produce >3L en lote marcado como "secándose"
3. **lote_incorrecto (recién paridas)**: >150 DEL en Lote 5 o 13
4. **parto_no_registrado**: >100 DEL en Lote 2 (pariendo)
5. **vacia_sin_mover**: última eco vacía pero sigue en Lote 6
6. **secado_pendiente**: gestante confirmada en Lote 1/4 con >250 DEL
7. **sin_lote**: produce leche pero no tiene lote asignado

Las anomalías se auto-persisten diariamente en Supabase y se gestionan con 3 estados: pendiente → revisando → resuelta.

## ANTI-INVENCIÓN DE DATOS
- `buildDataContext` envía los 839 crotales válidos en CADA consulta
- System prompt con "REGLA ABSOLUTA" de tolerancia cero
- Si un crotal no está en la lista → "NO EXISTE en el sistema"
- Cuando es query de cubrición, se bloquea la sección de producción general para evitar que la IA recomiende cabras de lotes prohibidos

## FORMATO DEL CSV DE PRODUCCIÓN (FLM)
Nombre archivo: `INFORME APP DIARIO_YYYY-MM-DD HH_MM_SS.csv`
Separador: `;`
Encoding: UTF-8 o Windows-1252 (auto-detect)
Columnas: Crotal, Grupo, DEL, Producción diaria, Última producción, Promedio 10 días, Lactación, Litros totales, Promedio total, Conductividad, Tiempo ordeño, Flujo

## FORMATO DEL CSV DE PARIDERA
Nombre archivo: `PARIDERA_FEBRERO_ampliacion.csv`
Separador: `;`
Formato: FECHA;CROTAL;CABRITOS;MACHOS;HEMBRAS;PESETA;OBSERVACIONES
- Fecha: "DD MM YY" (espacios variables)
- Sin fecha + obs "vacia" = cabra vacía
- Sin fecha + obs "aborto" = aborto
- Pesetas múltiples separadas por espacios: "062   128"

## REGLAS DE DESARROLLO

### Arquitectura
- TODO el frontend está en UN SOLO archivo: `src/App.jsx`
- NO crear archivos CSS separados — todo inline styles
- NO crear componentes en archivos separados
- Fuentes: Outfit (texto) + Space Mono (números/datos)
- Colores: #E8950A (dorado/brand), #1E293B (texto), #059669 (positivo), #DC2626 (negativo), #7C3AED (morado), #94A3B8 (gris)

### API
- `api/chat.js` es una Vercel Serverless Function
- Modelo: `claude-opus-4-6`
- max_tokens: 16384
- ANTHROPIC_API_KEY en variables de entorno de Vercel
- El frontend construye el dataContext y lo envía en cada request

### Deploy
- Push a main → Vercel auto-deploy
- Build: `vite build`
- No hay tests configurados
- Si hay error de build, suele ser: variable duplicada, carácter unicode corrupto, o braces desbalanceados

### Verificación antes de commit
1. Contar braces: `grep -o '{' src/App.jsx | wc -l` debe ser igual a `grep -o '}' src/App.jsx | wc -l`
2. Verificar syntax chat.js: `node -c api/chat.js`
3. No usar caracteres especiales en template literals del system prompt (sin tildes, sin ñ)

## ERRORES COMUNES A EVITAR
1. **NUNCA inventar crotales** — solo usar los que existen en la BD
2. **NUNCA recomendar cabras de Lote 3/5/13 para cubrición** — error garrafal
3. **DEL proyectado, no DEL de hoy** para decisiones de cubrición
4. **Conductividad 0.00 = no ordeñada**, no es un valor real
5. **Buenas productoras se estiran, no se meten antes** a cubrición
6. **Regex con caracteres unicode literales causa error de build en Vercel** — usar `\uXXXX`
7. **Variable `prod` declarada dos veces** en la misma función → error de build
8. **El importador NO recrea cabras eliminadas del censo** — protección intencional

## PARÁMETROS DE LA GRANJA
- 839 cabras + 32 machos Murciano-Granadina intensivo
- Ubicación: Valencia, España
- Precio leche: 1,31 €/L
- Gastos mensuales: 20-25k€ (pienso 56%, personal 23%, vet 8%)
- Lactación productiva: hasta 210 días (buenas), menos (malas)
- Secado: 90 días de gestación (60 días antes del parto)
- Umbral alta producción: >2.5 L/día
- Umbral baja producción: <1.5 L/día

## PENDIENTES / ROADMAP
- [ ] Importador de ecografías CSV
- [ ] Módulo finanzas real (actualmente datos demo)
- [ ] Conectar n8n para alertas WhatsApp
- [ ] Mejorar ficha individual con gráficas de tendencia
- [ ] Exportar informes a PDF

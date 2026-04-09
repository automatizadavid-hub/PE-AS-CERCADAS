# GUIA DE COLABORACION -- PENAS CERCADAS

Guia practica para cualquier agente IA o desarrollador que trabaje en este proyecto.
Ultima actualizacion: Abril 2026.

---

## 1. REGLAS CRITICAS PARA NO ROMPER NADA

### PROHIBIDO hacer esto:
- **NO crear archivos CSS separados** -- todo el estilo es inline en App.jsx
- **NO crear componentes en archivos separados** -- todo vive en `src/App.jsx`
- **NO usar caracteres unicode literales** (tildes, ene) en template literals del system prompt -- usar `\uXXXX` o el build de Vercel falla
- **NO declarar la misma variable dos veces** en el mismo scope (ej: `const prod` duplicado) -- error de build
- **NO inventar crotales** -- la IA solo puede referenciar crotales que existen en la tabla `cabra`
- **NO recomendar cabras de Lote 2, 3, 5, 6 gestantes, o 13 para cubricion** -- solo Lote 1, Lote 4 y vacias del Lote 6
- **NO hardcodear posiciones de columnas en CSV** -- siempre auto-detectar por contenido
- **NO asumir que RLS permite INSERT/UPDATE** en tablas nuevas -- verificar politicas antes
- **NO silenciar errores de Supabase** -- mostrar errores visibles al usuario

### Antes de hacer commit:
```bash
# 1. Verificar balance de llaves
grep -o '{' src/App.jsx | wc -l
grep -o '}' src/App.jsx | wc -l
# Ambos numeros deben ser IGUALES

# 2. Verificar sintaxis del backend
node -c api/chat.js

# 3. Probar build
npx vite build
```

---

## 2. ESTADO ACTUAL DEL PROYECTO

### Lo que funciona:
- 9 paginas completas: Dashboard, Produccion, Sanidad, Rentabilidad, Importador, Consultas, Anomalias, Guardados, Config
- Importador CSV para 6 tipos: produccion FLM, paridera, tratamientos, inseminacion, anotaciones vet, ecografias
- Chat IA (Claude Opus 4.6) en varias paginas con contexto de datos reales
- Chat del importador escribe directamente en BD (tratamientos masivos por lote/paridera, muertes, cambios de lote)
- Detector de 7 tipos de anomalias con persistencia en Supabase
- Dashboard estructurado por parideras con tarjetas de colores
- Ficha individual de cabra con historial completo

### Cambios recientes:
- **Dashboard por parideras**: tarjetas grandes a 2 columnas con bordes de colores (azul=Febrero, verde=Mayo, amarillo=Julio, rosa=Octubre)
- **Rediseno visual**: fondo beige calido (#F5F3EF), tarjetas blancas sin borde, sin emojis en navegacion
- **Escala UI aumentada**: texto mas grande en toda la app para coincidir con estilo paridera
- **Produccion con p10d**: se usa `promedio_10d` (precalculado por software de ordeno) en vez de litros diarios
- **Chat handler por paridera**: "he vacunado a la paridera de mayo" trata todas las cabras vinculadas
- **Selector de paridera** en todos los tipos de importacion CSV
- **Ecografia import**: auto-deteccion de columnas, soporte para rondas (1a, 2a eco), subcarpetas en dashboard

---

## 3. ARQUITECTURA

### Un solo archivo frontend
Todo el frontend esta en `src/App.jsx` (~6300 lineas). No hay archivos de componentes separados, no hay CSS externo.

### Estructura interna de App.jsx:
```
Lineas 1-11:     Imports + Supabase client
Lineas 12-260:   askClaude() + buildDataContext() -- contexto IA
Lineas 260-400:  analizarTendencias(), evaluarTratamientos(), calcularTimelineReproductivo()
Lineas 400-940:  useSupabaseData() hook (18 queries paralelas)
Lineas 940-1070: Componentes base: Badge, Card, SectionTitle, KPI, DataModal
Lineas 1070-1460: CabraHistorialModal, ChatBox, LoadingScreen, LoginPage
Lineas 1460-2120: DashboardPage (parideras, busqueda, modales, inteligencia)
Lineas 2120-3400: ImportadorPage (6 importadores CSV + chat con escritura BD)
Lineas 3400-4200: ConsultasPage + ConfigPage
Lineas 4200-5100: ProduccionPage + SanidadPage
Lineas 5100-5400: RentabilidadPage
Lineas 5400-5800: AnomaliasPage + GuardadosPage
Lineas 5800-6300: App root (router, nav, auth)
```

### Backend: api/chat.js
Vercel Serverless Function que hace proxy a la API de Claude.
- Recibe: system prompt + messages + dataContext del frontend
- Envia a: Claude Opus 4.6 (max_tokens 16384)
- Variable de entorno: ANTHROPIC_API_KEY en Vercel

---

## 4. SUPABASE -- TABLAS Y RLS

### Tablas principales:

| Tabla | Clave | Relaciones FK | Columnas recientes |
|-------|-------|--------------|-------------------|
| cabra | crotal UNIQUE | lote_id -> lote | id_electronico |
| lote | id | -- | estado |
| paridera | id | -- | anio (NOT NULL) |
| produccion_leche | cabra_id+fecha UNIQUE | cabra_id | promedio_10d, media_10d |
| parto | id | cabra_id, paridera_id | -- |
| ecografia | id | cabra_id, paridera_id | ronda TEXT, resultado_ecografia ENUM |
| cubricion | id | cabra_id, paridera_id, macho_id | -- |
| cria | id | madre_id, paridera_id | -- |
| tratamiento | id | cabra_id | **paridera_id** (nuevo) |
| anotacion_veterinaria | id | cabra_id | **paridera_id** (nuevo) |
| muerte | id | cabra_id | -- |
| anomalia_detectada | id | -- | crotal, tipo, estado |
| alerta_sanitaria | id | -- | -- |
| chat_guardado | id | -- | mensajes JSONB |

### RLS -- CRITICO:
Supabase tiene RLS activado en TODAS las tablas. Si añades columna o usas tabla nueva, verificar que existen politicas INSERT/UPDATE para `authenticated`. Si faltan, los inserts fallan SILENCIOSAMENTE.

```sql
-- Ver politicas existentes
SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public';

-- Crear politica si falta:
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='MI_TABLA' AND policyname='auth_insert') THEN
    CREATE POLICY "auth_insert" ON MI_TABLA FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;
```

---

## 5. PARIDERAS -- 4 POR ANO

| ID | Nombre | Machos entran | Partos est. | Color borde |
|----|--------|--------------|-------------|-------------|
| 1 | Paridera Febrero 2026 | 15 ago 2025 | 12 ene 2026 | Azul #3B82F6 |
| 2 | Paridera Mayo 2026 | 10 dic 2025 | 9 may 2026 | Verde #059669 |
| 5 | Paridera Julio 2026 | 20 feb 2026 | 20 jul 2026 | Amarillo #E8950A |
| 3 | Paridera Octubre 2026 | 15 may 2026 | 15 oct 2026 | Rosa #EC4899 |

### Como se enlazan datos a parideras:
- `parto.paridera_id`, `ecografia.paridera_id`, `cubricion.paridera_id` -- FK directas
- `tratamiento.paridera_id`, `anotacion_veterinaria.paridera_id` -- columnas nuevas (nullable)
- Crias se vinculan via `parto -> paridera_id`

---

## 6. IMPORTADOR CSV

### 6 tipos, todos con selector de paridera:
1. **Produccion FLM**: UPSERT por cabra+fecha. Columnas por nombre.
2. **Paridera**: partos, abortos, vacias, crias.
3. **Tratamientos**: columnas flexibles.
4. **Inseminacion**: metodo="inseminacion" en tabla cubricion.
5. **Anotaciones vet**: auto-detect crotal + texto.
6. **Ecografias**: auto-detect columnas en CUALQUIER posicion. Soporte rondas 1a/2a.

### LECCION: CSV flexible
Los CSV del usuario cambian de formato. NUNCA asumir posiciones fijas. Escanear TODAS las columnas para detectar por contenido.

### LECCION: Errores visibles
Usar `window.alert()` o mensajes muy visibles para mostrar resultados de importacion.

### Chat del importador:
- "He vacunado a la paridera de mayo de enterotoxemias" -> INSERT masivo con paridera_id
- "He vacunado al Lote 3" -> INSERT masivo, auto-detecta paridera
- "Se ha muerto la 057600" -> INSERT muerte + UPDATE cabra
- "Mueve la 056749 al Lote 4" -> UPDATE lote_id + cambio_lote

---

## 7. CONTEXTO IA

### buildDataContext():
Envia a Claude: crotales validos, produccion por cabra (p10d, litTotal, DEL, lactacion, cond, flujo), ecografias, partos, tratamientos, anotaciones, anomalias.

### Regla p10d:
El campo `promedio_10d` viene PRECALCULADO por el software de ordeno. Es el dato de produccion MAS FIABLE. SIEMPRE usar p10d, NUNCA litros diarios para analisis.

### System prompt (api/chat.js):
- No inventar crotales
- No recomendar cubricion de lotes prohibidos
- Usar DEL proyectado
- Conductividad 0.00 = no ordenada (ignorar)
- SIEMPRE usar p10d para produccion

---

## 8. ESTILO VISUAL

- **Fondo**: #F5F3EF (beige calido)
- **Tarjetas**: blanco puro, sin borde, sombra suave
- **Texto**: #1A1A1A titulos, #64748B secundario
- **Brand**: #E8950A (dorado)
- **Positivo**: #059669 | **Negativo**: #DC2626 | **Morado**: #7C3AED
- **Fuentes**: Outfit (texto) + Space Mono (numeros)
- **Sin emojis** en navegacion ni elementos UI
- **Escala grande**: titulos 20-28px, numeros 24-36px, labels 14px
- **Tarjetas paridera**: 2 columnas, borde de color, padding 28x30

---

## 9. DEPLOY

1. Push a GitHub
2. Crear PR hacia `main`
3. Merge -> Vercel auto-deploy (~60s)
4. Verificar en https://pe-as-cercadas.vercel.app

---

## 10. CHECKLIST PRE-COMMIT

```
[ ] grep -o '{' src/App.jsx | wc -l == grep -o '}' src/App.jsx | wc -l
[ ] node -c api/chat.js
[ ] npx vite build (sin errores)
[ ] No tildes/ene en template literals del system prompt
[ ] No variables duplicadas en mismo scope
[ ] Si tabla nueva: verificar RLS policies
[ ] Si importacion: errores visibles (window.alert)
[ ] Si CSV: deteccion por contenido, no posicion
[ ] Si cubricion: solo Lote 1, 4, vacias Lote 6
[ ] Si produccion: usar p10d, no litros diarios
```

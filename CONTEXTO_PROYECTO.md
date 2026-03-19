# PEÑAS CERCADAS — Contexto del Proyecto

## Qué es
App web de gestión integral para una granja de ~580 cabras de raza Murciano-Granadina en régimen intensivo. Propietario: David.

## Arquitectura
- **Frontend**: React (Vite) desplegado en Vercel
- **Base de datos**: PostgreSQL en Supabase (proyecto "PEÑAS CERCADAS", West EU Ireland)
- **Asistente IA**: Claude API (Sonnet) — genera SQL desde lenguaje natural, NUNCA inventa datos
- **Automatizaciones**: n8n (futuro) para alertas WhatsApp

## Base de datos Supabase (18 tablas)
- cabra, lote, macho, paridera, cubricion, ecografia, parto, cria
- produccion_leche, tratamiento, cambio_lote, importacion
- regla, parametro_granja, usuario, muerte, protocolo_veterinario

## Datos importados
- 580 cabras (526 FLM + 54 desde otros Excel)
- 5 machos de inseminación
- 3 parideras (Febrero, Mayo, Octubre 2026)
- 226 partos + 147 crías hembra con peseta
- 296 ecografías (7 cabras vacías en dos ecografías consecutivas)
- 230 cubriciones (88 monta natural dic + 106 feb + 36 inseminaciones)
- 98 tratamientos (57 implantes + 41 esponjas)
- 62 reglas activas (anomalía, pre-acción, decisión, protocolo)
- 13 protocolos veterinarios

## Parámetros de la granja
- 4 parideras/año: machos entran 20 feb / 15 may / 15 ago / 15 nov
- Ecografías: 65-80 días post-macho
- Gestación: ~150 días
- Lactación productiva: hasta 210 días (buenas productoras)
- Secado: a los 90 días de gestación
- Crotalado crías: 2-3 meses post nacimiento
- Umbral alta producción: >2 L/día

## Lotes
- Lote 1: Alta producción (74 cabras)
- Grupo 13: Adultas paridera febrero (99)
- Lote 2: Pariendo ahora (11)
- Lote 3: Gestantes secándose (98)
- Lote 4: Baja producción (28)
- Lote 5: Chotas nuevas primera paridera (107)
- Lote 6: Con machos desde 20 feb (109)

## Ciclo de una cabra
1. Parto → lactación
2. ~210 días → machos (antes si mala producción)
3. ~275 días → ecografía
4. ~300 días → secado
5. ~360 días → nuevo parto

## Importador de Excel
El chat del asistente interpreta Excel + mensaje del usuario. Formatos:
- Producción: FLM con identificador, grupo, DEL, litros
- Ecografías: lector crotales (ID electrónico 23 dígitos, últimos 6 = crotal)
- Tratamientos: solo lista de crotales, sin cabeceras
- Paridera: fecha, crotal, cabritos, machos, hembras, peseta, observaciones
- Cubriciones: lista de crotales

## Reglas (62 activas)
- 18 sanidad, 16 reproducción, 8 producción, 6 identificación
- 9 protocolo veterinario, 3 muertes, 2 decisión productiva
- Tipos: anomalía (post-evento), pre_accion (antes de actuar), decisión

## Roles
- Admin (David): acceso total, importar, modificar
- Consulta (veterinario, jefe asociación): solo ver y preguntar

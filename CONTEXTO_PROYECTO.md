# PEÑAS CERCADAS — Contexto Completo del Proyecto
## Para pegar en nuevas conversaciones de Claude

---

## SOBRE EL PROYECTO
App web de gestión ganadera para la granja PEÑAS CERCADAS. ~580 cabras Murciano-Granadina en régimen intensivo en Valencia, España. El ganadero es David (automatizadavid@gmail.com).

## STACK TECNOLÓGICO
- **Frontend**: React (Vite) → desplegado en Vercel (pe-as-cercadas.vercel.app)
- **Backend**: Supabase (PostgreSQL) → West EU (Ireland)
- **API**: Claude API (Sonnet) via serverless function en /api/chat.js
- **Repositorio**: GitHub → automatizadavid-hub/PE-AS-CERCADAS (público)
- **Flujo de deploy**: David sube zip a GitHub → Vercel auto-deploy

## CREDENCIALES
- Supabase URL: https://lgorvuqlehnljuaqtlet.supabase.co
- Supabase Project ID: lgorvuqlehnljuaqtlet
- Supabase anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxnb3J2dXFsZWhubGp1YXF0bGV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2ODYyNzcsImV4cCI6MjA4OTI2MjI3N30.xnkFU8Eo9-XRnVtiDghlyHi-ENl3cd1Iak1f8x60lLw
- Anthropic API key: guardada como ANTHROPIC_API_KEY en Vercel env vars
- Login app: automatizadavid@gmail.com (contraseña en Supabase Auth)

## ESTRUCTURA DEL REPOSITORIO
```
/index.html
/package.json (react, react-dom, recharts, @supabase/supabase-js)
/vite.config.js
/CONTEXTO_PROYECTO.md
/api/chat.js          ← Serverless function para Claude API (system prompt completo)
/src/App.jsx           ← App completa (~2066 líneas)
/src/main.jsx
```

## PARÁMETROS DE LA GRANJA
- 4 parideras/año: machos entran 20 feb / 15 may / 15 ago / 15 nov
- Ecografías: 65-80 días post-macho
- Gestación: ~150 días
- Lactación: hasta 210 días (buenas), menos (malas)
- Secado: 90 días gestación
- Crotalado crías: 2-3 meses
- Umbral alta producción: >2 L/día
- Precio leche: 1,31€/L
- Granja intensiva: crías van a nodriza (calostro + leche en polvo), NO están con madre
- Gastos mensuales: 20.000-25.000€ (pienso ~56%, personal ~23%, vet ~8%)

## LOTES (el número es el primer dígito de la columna "Grupo" del CSV del FLM)
- **Lote 1**: Alta producción (74 cabras)
- **Lote 2**: Pariendo ahora (11 cabras)
- **Lote 3**: Secas, paren abril/mayo (98 cabras)
- **Lote 4**: Baja producción (28 cabras)
- **Lote 5**: Chotas en producción, paridas ene/feb (107 cabras)
- **Lote 6**: Recién quitado machos (109 cabras)
- **Lote 13**: Adultas paridas en febrero (99 cabras)

## PARIDERAS ACTIVAS
- Paridera Febrero 2026: machos 15 ago 2025, partos ene-mar 2026 (en curso)
- Paridera Mayo 2026: machos 10 dic 2025, partos abr-may 2026 (gestación)
- Paridera Octubre 2026: machos 20 feb 2026, partos jul 2026 (cubrición)

## BASE DE DATOS SUPABASE — 20+ TABLAS
### Tablas principales:
- **cabra**: id, crotal, estado, raza, fecha_nacimiento, num_lactaciones, dias_en_leche, edad_meses, estado_ginecologico, lote_id, notas
- **lote**: id, nombre, tipo, descripcion, capacidad, umbral_produccion_min
- **macho**: id, crotal, raza, estado, fecha_nacimiento
- **paridera**: id, nombre, fecha_entrada_machos, fecha_partos_estimada, estado
- **cubricion**: id, cabra_id, paridera_id, macho_id, fecha_entrada, metodo
- **ecografia**: id, cabra_id, paridera_id, fecha, resultado
- **parto**: id, cabra_id, paridera_id, fecha, tipo, num_crias, num_machos, num_hembras
- **cria**: id, madre_id, parto_id, peseta, sexo, fecha_nacimiento
- **produccion_leche**: id, cabra_id, fecha, litros, dia_lactacion, media_10d, litros_totales_lactacion, media_total, lactacion_num, lote_nombre, ultima_produccion, conductividad, tiempo_ordeno, flujo, promedio_10d, promedio_total (UNIQUE: cabra_id + fecha)
- **tratamiento**: id, cabra_id, fecha, tipo, producto
- **cambio_lote**: id, cabra_id, lote_origen_id, lote_destino_id, fecha
- **regla**: id, nombre, descripcion, categoria, tipo, severidad, parametros, mensaje_template
- **parametro_granja**: id, clave, valor, descripcion
- **usuario**: id, email, rol, nombre
- **muerte**: id, cabra_id, fecha, causa
- **protocolo_veterinario**: id, fase, momento, tratamiento, producto, dosis, destino_animal, dias_desde_nacimiento, notas, obligatorio, activo
- **evento_calendario**: id, titulo, fecha, tipo, descripcion, urgente, completado
- **resumen_diario**: id, fecha, total_cabras, litros_totales, media_litros, media_conductividad, cabras_alta_conductividad, archivo_origen
- **importacion**: id, fecha, tipo, archivo, registros

### Datos importados:
- 580 cabras + 5 machos
- 226 partos + 147 crías hembra con peseta
- 296 ecografías (7 cabras doble vacías)
- 230 cubriciones (88 monta natural + 106 feb + 36 inseminaciones)
- 98 tratamientos (57 implantes + 41 esponjas)
- 67 reglas activas
- 13 protocolos veterinarios
- 7 eventos calendario
- ~526 registros producción diaria (del CSV FLM)

## PÁGINAS DE LA APP (6 páginas)
1. **Dashboard**: KPIs reales, alertas, calendario desde evento_calendario, distribución lotes, parideras. Tarjetas clicables con sistema de carpetas (por lote/paridera)
2. **Producción & Análisis**: KPIs producción, gráfica por lote, distribución histograma, top 15 productoras, candidatas descarte, estrellas emergentes, alertas sanitarias (conductividad), chat Claude API
3. **Rentabilidad**: Gráficas ingresos/gastos (demo), previsión 12 meses, reposición, chat financiero Claude API
4. **Importador**: Subida CSV funcional (arrastrar/clic), parser nativo (sin SheetJS), detección automática informe FLM, botón "Importar a Supabase" que procesa cada cabra (actualiza lote, inserta producción, genera alertas), vista previa, chat Claude API
5. **Consultas**: Chat Claude API con contexto inteligente. Detecta palabras clave y carga datos cruzados relevantes (abortos+producción, ecografías, lotes, fichas individuales)
6. **Configuración**: 4 pestañas — Calendario (visual mensual + lista eventos + formulario añadir + completar/eliminar), Reglas, Protocolo veterinario (añadir/editar/eliminar), Parámetros

## CSV DEL FLM — Formato Diario
- Delimitador: punto y coma (;), decimales con punto (.)
- 12 columnas: Identificador del animal; Grupo; DEL; Producción diaria; Última producción; Promedio 10 días; LACTACIÓN; LITROS TOTALES; PROMEDIO TOTAL; MEDIA CONDUCTIVIDAD; TIEMPO DE ORDEÑO; FLUJO
- Última fila es sumario (Contar/Suma) → se filtra
- ~526 cabras por informe
- El número del lote se extrae del primer dígito de la columna Grupo

## CONDUCTIVIDAD ELÉCTRICA (Murciano-Granadina)
- Normal: 5.2-5.7 mS/cm
- Multíparas > primíparas
- Aumenta con lactación (5.38 → 6.03 del mes 1 al 7)
- >6.0 = revisar posible mastitis subclínica
- >6.5 = alerta alta

## SYSTEM PROMPT DE CLAUDE API (/api/chat.js)
Incluye: identidad, reglas (nunca inventar), parámetros granja, ciclo de cabra, lotes, parideras, protocolo veterinario, formato de respuesta estructurado (## secciones, **negrita**, listas, emojis alerta). Las respuestas se renderizan como tarjetas en la app (FormattedMessage component).

## FUNCIONALIDADES CLAVE IMPLEMENTADAS
- Login con Supabase Auth
- Datos en vivo de Supabase (useSupabaseData hook con Promise.all)
- Sistema de carpetas en modales (por lote, paridera, tipo)
- Importación CSV con detección automática del formato FLM
- Auto-creación de lotes si no existen
- Actualización de lotes de cabras según último CSV
- Alertas: conductividad >6.0, caída producción >30%, flujo bajo, doble vacías
- Chat con contexto inteligente que cruza datos según la pregunta
- Calendario editable con eventos en Supabase
- Protocolo veterinario CRUD completo
- Respuestas formateadas como tarjetas (FormattedMessage)

## PROBLEMAS CONOCIDOS / PENDIENTE
- [ ] Importación lenta (3-5 min para 526 cabras, 1 a 1) → pendiente optimizar con batch inserts
- [ ] La página de Producción necesita más gráficas y análisis profundo
- [ ] Falta histórico de producción para curvas de tendencia
- [ ] Rentabilidad usa datos demo — falta tabla de finanzas real
- [ ] Automatizar descarga CSV del FLM (hablar con informático)
- [ ] Conectar n8n para alertas WhatsApp y facturas Gmail
- [ ] David debe cambiar contraseña Supabase y regenerar API key Anthropic
- [ ] Favicon de la cabra (pendiente icono profesional)

## CÓMO HACER CAMBIOS
1. David trabaja desde Claude (web/desktop)
2. Claude genera el código actualizado en un zip
3. David descomprime, entra dentro de la carpeta, Cmd+A
4. GitHub → Add file → Upload files → arrastra contenido → quita duplicados sueltos (App.jsx y main.jsx sin /src/) → Commit
5. Vercel auto-deploy en 1-2 minutos
6. SQL de Supabase: pestaña nueva en SQL Editor → pega → Run

## IMPORTANTE PARA NUEVAS CONVERSACIONES
- David es ganadero, no programador. Instrucciones claras y paso a paso
- macOS a veces renombra archivos (índice.html, paquete.json) → vigilar
- Siempre quitar duplicados sueltos App.jsx y main.jsx al subir a GitHub
- Los archivos que ya existen se sobreescriben al subir — no hace falta borrar
- Siempre dar el zip completo, nunca archivos sueltos
- El código COMPLETO está en un único archivo: /src/App.jsx (~2066 líneas)

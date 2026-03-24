export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API key not configured' });

  const { message, dataContext, chatType } = req.body;

  const SYSTEM_PROMPT = `Eres el asistente de gestión de la granja PEÑAS CERCADAS. Experto ganadero de élite en caprino Murciano-Granadina intensivo.

=== REGLA ABSOLUTA — LEE ESTO ANTES DE RESPONDER ===
NUNCA, BAJO NINGUNA CIRCUNSTANCIA, inventes un número de crotal.
NUNCA menciones una cabra si su crotal NO aparece explícitamente en los DATOS que te proporciono.
Si el usuario pregunta por un crotal que NO está en los datos → responde: "La cabra [crotal] NO EXISTE en el sistema de Peñas Cercadas."
Si necesitas dar ejemplos de cabras, usa SOLO crotales que aparezcan literalmente en el contexto de datos.
Si no tienes datos suficientes para responder, di "No tengo datos sobre esto" — NUNCA rellenes con información inventada.
Un solo crotal inventado destruye la confianza del ganadero. Es INACEPTABLE.
=========================================================

REGLAS:
1. SOLO usa datos que aparezcan en el contexto. CERO invención.
2. Responde en español, claro y directo.
3. Números exactos, sin redondear.
4. Cruza TODOS los datos disponibles de cada cabra (producción + reproducción + sanidad + anotaciones).
5. Si detectas algo anómalo, menciónalo proactivamente.
6. Clasifica cabras como: ⭐ ESTRELLA, ✅ PRODUCTIVA, ⚠️ VIGILAR, 🔴 DESCARTAR

ANÁLISIS DE HISTORIAL DE VIDA:
Cuando te den ficha completa de una cabra, analiza TODO:
- Producción vs edad y lactaciones
- Tendencia de conductividad
- Ecografías vacías = fertilidad
- Anotaciones vet + producción = descarte?
- Abortos + recuperación posterior
- Da SIEMPRE recomendación: seguir, vigilar, tratar, secar, o descartar.

FORMATO:
- ## para títulos
- **negrita** para datos clave
- Listas con - para datos tabulares
- ⚠️ alertas, ✅ positivo, 🔴 negativo
- Esquemático, NO párrafos largos

PARÁMETROS:
- 839 cabras + 32 machos Murciano-Granadina intensivo
- 4 parideras/año: machos 20 feb / 15 may / 15 ago / 15 nov
- Ecografías: 65-80 días post-macho
- Gestación: ~150 días
- Lactación: hasta 210 días (buenas), menos (malas)
- Secado: 90 días gestación
- Umbral alta producción: >2 L/día
- Precio leche: 1,31€/L

CONDUCTIVIDAD (Murciano-Granadina):
- Normal: 5.2-5.7 mS/cm
- >6.0 = revisar mastitis subclínica
- >6.5 = alerta alta
- Subida entre días = señal temprana infección

CRITERIOS DESCARTE:
- <1.5L/día + ≥3 lactaciones + >60 DEL
- Doble vacía (2+ ecografías)
- Conductividad >6.5 persistente
- Abortos repetidos
- Combinación de factores leves

LOTES:
- Lote 1: Alta producción / Lote 2: Pariendo / Lote 3: Secas
- Lote 4: Baja producción / Lote 5: Chotas / Lote 6: Post-machos / Lote 13: Adultas feb

${chatType === 'finance' ? 'CONTEXTO FINANCIERO:\n- Gastos: 20-25k€/mes (pienso 56%, personal 23%, vet 8%)\n- Precio leche: 1,31€/L\n- Ingresos: leche + cabritos + PAC\n' : ''}

DATOS ACTUALES:
${dataContext || 'No hay datos disponibles.'}

RECUERDA: Si un crotal NO aparece en los datos de arriba, NO EXISTE. No lo inventes.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: message }]
      })
    });

    const data = await response.json();
    if (data.error) return res.status(400).json({ error: data.error.message || 'Error de API' });
    const text = data.content?.map(c => c.text || '').join('') || 'Sin respuesta';
    return res.status(200).json({ response: text });
  } catch (err) {
    return res.status(500).json({ error: 'Error conectando con Claude API: ' + err.message });
  }
}

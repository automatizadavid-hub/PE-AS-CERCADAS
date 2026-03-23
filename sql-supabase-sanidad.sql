-- =============================================
-- PEÑAS CERCADAS — SQL para Supabase
-- Ejecutar en SQL Editor ANTES de subir el código
-- =============================================

-- 1. Añadir estado a la tabla lote (produccion / secandose / pariendo)
ALTER TABLE lote ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'produccion';

-- Poner todos los lotes existentes como "produccion" por defecto
UPDATE lote SET estado = 'produccion' WHERE estado IS NULL;

-- 2. Tabla de anotaciones veterinarias
CREATE TABLE IF NOT EXISTS anotacion_veterinaria (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cabra_id UUID REFERENCES cabra(id) ON DELETE SET NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  texto TEXT NOT NULL,
  autor TEXT DEFAULT 'Veterinario',
  tipo TEXT DEFAULT 'individual',
  lote_id UUID REFERENCES lote(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabla de alertas sanitarias persistentes
CREATE TABLE IF NOT EXISTS alerta_sanitaria (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo TEXT NOT NULL,
  severidad TEXT DEFAULT 'media',
  titulo TEXT NOT NULL,
  descripcion TEXT,
  cabras_afectadas TEXT[],
  lote_nombre TEXT,
  paridera_nombre TEXT,
  estado TEXT DEFAULT 'activa',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- 4. Permisos RLS (igual que las demás tablas)
ALTER TABLE anotacion_veterinaria ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerta_sanitaria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anotacion_vet_all" ON anotacion_veterinaria FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "alerta_san_all" ON alerta_sanitaria FOR ALL USING (true) WITH CHECK (true);

-- 5. Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_anotacion_fecha ON anotacion_veterinaria(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_anotacion_cabra ON anotacion_veterinaria(cabra_id);
CREATE INDEX IF NOT EXISTS idx_alerta_estado ON alerta_sanitaria(estado);
CREATE INDEX IF NOT EXISTS idx_alerta_fecha ON alerta_sanitaria(fecha DESC);

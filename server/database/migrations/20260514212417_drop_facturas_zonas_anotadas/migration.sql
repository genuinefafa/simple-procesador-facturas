-- Migration: Drop orphan table facturas_zonas_anotadas (#182)
--
-- La tabla fue introducida para anotar zonas de un PDF/imagen como parte de
-- una feature de entrenamiento que nunca se llegó a usar. Está vacía en
-- producción y no hay código vivo que la lea/escriba — quedaba solo la
-- definición en schema.ts.

DROP TABLE IF EXISTS `facturas_zonas_anotadas`;

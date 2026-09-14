ALTER TABLE vehicle ADD COLUMN vehicle_class text
  CHECK (vehicle_class IN ('car', 'suv', 'van', 'camper', 'motorcycle'));
ALTER TABLE vehicle ADD COLUMN fuel text
  CHECK (fuel IN ('petrol', 'diesel', 'hybrid', 'electric', 'lpg', 'other'));

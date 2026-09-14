-- Pickup is the only end date of an inquiry. Keep only the drop-off/pickup order.
ALTER TABLE repair_request
  DROP CONSTRAINT repair_request_travel_date_order_check;
ALTER TABLE repair_request DROP COLUMN stay_ends_on;
ALTER TABLE repair_request
  ADD CONSTRAINT repair_request_travel_date_order_check
  CHECK (
    earliest_dropoff_on IS NULL
    OR latest_pickup_on IS NULL
    OR earliest_dropoff_on <= latest_pickup_on
  );

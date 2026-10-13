-- Add unique constraints for batch upserts

-- Spend: unique per user + channel + month
ALTER TABLE spend
DROP CONSTRAINT IF EXISTS spend_channel_month_unique;

ALTER TABLE spend
ADD CONSTRAINT spend_user_channel_month_unique
UNIQUE (user_id, channel_id, month);

-- Shared costs: unique per user + name + month
ALTER TABLE shared_costs
ADD CONSTRAINT shared_costs_user_name_month_unique
UNIQUE (user_id, name, month);

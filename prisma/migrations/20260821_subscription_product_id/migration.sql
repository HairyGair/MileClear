-- Record which product a subscriber is on.
--
-- Admin revenue review, 21 Aug 2026. MRR was every isPremium row x £4.99,
-- but 13 of 19 Apple subscribers are on the annual product (£44.99/yr,
-- £3.75/mo equivalent) and nothing stored which. The billing webhooks
-- stamp this from now on; existing rows stay NULL and the revenue view
-- infers the period from how far out premiumExpiresAt sits.
ALTER TABLE `users` ADD COLUMN `subscriptionProductId` VARCHAR(64) NULL;

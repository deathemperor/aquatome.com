# Affiliate links

Every product link on the site is a `/go/{shopee|lazada|tiki}/?k=keyword&c=category&e=kind:id` link. The Worker redirects it:
1. to the best active product for that placement in the D1 `products` catalog, if one was checked in the last 48 h;
2. otherwise to the marketplace search for the keyword.

Either target is wrapped in the network's deeplink template when the secret `AFF_TEMPLATE_SHOPEE` (and the `_LAZADA` / `_TIKI` equivalents) is set, e.g. `wrangler secret put AFF_TEMPLATE_SHOPEE` with `https://go.isclix.com/deep_link/<id>?url={url}`. Search links never go dead.

Clicks are counted per day and placement in D1: only a reader's click on one of our pages, as the browser's Sec-Fetch headers say (`fromOurPage` in go.ts), and never the owner's. Every request still goes on to the shop. The daily cron checks products through each network's API: two failed checks in a row set a product `inactive` and the redirect falls through automatically, while `unknown` (no API credentials yet) never deactivates.

To add listings once an account exists, run `scripts/aff-add.sh products.json`. Results show on the `/_ab/` dashboard.

You compile what {{SHOPS}} in {{COUNTRY}} actually sell, for an aquarium handbook written in {{LANG}}. The list decides which species the handbook covers first and which local names it shows, so accuracy matters more than length.

{{TASK}}

Never open Shopee, Lazada, Tokopedia, Tiki, Bukalapak or any other marketplace. Shop websites, shop blogs, public Facebook posts, hobby forums and hobby articles are fine. Search in {{LANG}} and in English.

For every item return:
- trade: the item exactly as the shop writes it.
- name: the common name hobbyists in {{COUNTRY}} use for the species, in {{LANG}}, written the way shops and buyers write it{{NAME_FORM}}. The species, not a colour form, size or fin type ("Molly Platinum Short" is a molly). null when you are not sure.
- scientificName: the species as a binomial (Genus species). null when the trade name covers several species ("all corydoras"), when it is an undescribed form (an L-number with no species name), or when you are not sure.
- confidence: 0 to 1, how sure you are that scientificName is what shops in {{COUNTRY}} sell under that trade name.
- evidence: a URL where a shop or hobby page uses that trade name next to a photo or the scientific name; "" when it comes from general knowledge.

Also return sources: the shop lists you used (url, title). Leave out {{LEAVE_OUT}}. Reply only with JSON.

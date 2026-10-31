/** Letters only Vietnamese uses, or its words for fish and shrimp ("Cá Ping Pong – …", "Tép Blue Dream"): plain á, é… alone are Spanish and Portuguese too. */
export const isVietnamese = (s: string) => /[ăĩũạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹđơư]|(?<!\p{L})(cá|tép)(?!\p{L})/iu.test(s)

/**
 * Two names a reader can't tell apart get the same key: the tank-mates picker's folding (accents off, đ → d, lower case,
 * punctuation dropped; Thai keeps its marks) with the spaces dropped too, since Thai writes one name with or without them
 * ("อนูเบียสนานา", "อนูเบียส นานา").
 */
export const nameKey = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '')

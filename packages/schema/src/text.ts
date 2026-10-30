/** Letters only Vietnamese uses, or its words for fish and shrimp ("Cá Ping Pong – …", "Tép Blue Dream"): plain á, é… alone are Spanish and Portuguese too. */
export const isVietnamese = (s: string) => /[ăĩũạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹđơư]|(?<!\p{L})(cá|tép)(?!\p{L})/iu.test(s)

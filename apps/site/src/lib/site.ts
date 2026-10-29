/** Google AdSense publisher (not secret: it appears in every page and in ads.txt). */
export const ADSENSE_CLIENT = 'ca-pub-3032018142512489'
export const CONTACT_EMAIL = 'contact@aquatome.com'
export const adsTxt = (client: string) => `google.com, ${client.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`

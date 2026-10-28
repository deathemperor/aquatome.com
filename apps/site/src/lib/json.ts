/** JSON safe to embed inside a <script> element: `<` is escaped so the content can never close the tag. */
export const jsonForScript = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c')

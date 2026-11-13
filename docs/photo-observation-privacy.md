# Photo observations without photographed wording

The 11 November rule applies to every writer that reads a photograph: no signature,
label, caption or other lettering is transcribed into state, generated review
notes or logs. Photographer names belong only in proper photo credits. The image
and its original are retained under their existing rules.

The watermark record keeps confidence, a controlled position, the number of
letters/digits used by the existing review threshold, whether a credit or URL
marker was found, and a SHA-256 fingerprint. It retains the watermark verdict,
kind, controlled locations and the existing permitted-own-mark record. Words are
not needed by the public loader or the image planner. Both use the same review
predicate as before. Without a watermark verdict, an unreadable or invalid observation remains pending.

The judge receives the image and those measurements; it reads the image when
needed and returns a kind and controlled positions. It receives no cached OCR
words in its prompt. The native image-judgment CLI does not persist a session.
This uses the installed CLI's documented option and changes no login transport.
No image or model call is made by the migration.

`photo-observations.ts` projects photo verdicts into controlled outcomes, retaining
every decision field, the question version, and a hash of the discarded note.
The old dead/person recheck cues and the manual artwork predicate become booleans before prose is discarded.
Rejection records retain their URL membership, truth value and exact
`watermark:` prefix condition, which the permitted Glaser-logo exception reads.
The video-still, guide and manual unfit-photo writers use the same persistence boundary. Still failure/kept diagnostics are guarded as fingerprints or the controlled rejected token. Failed species checks and image steps retain controlled stop kinds or hashed failures, never upstream answer text. A source
re-read or a URL mirror cannot restore an older transcription.

`photo-privacy.ts --root <checkout> --write --report <private-proof>` is the
engine-owned, model-free migration. Without `--write` it computes the plan and
changes no file. It validates decision and waiting predicates before writing,
then validates the actual recheck set and the privacy guard; a failure restores
its original input bytes. No content, photo, original, approval fingerprint or
source permission is rewritten. History is untouched.

`pnpm engine photo-privacy --write` uses the repository root, regardless of the
package working directory. It prints one controlled summary line and exits
nonzero on validation failure after restoring the input. The publication hook must call it
after merging current main and kept work, before verification, commit and push.

The checked report records counts and fingerprints for each affected state file
and the generated review. The baseline is the commit named in the report; every
decision difference and waiting difference must be zero. A second run is
idempotent. The first scheduled Mac photos cycle after merge is read back to
confirm the migration caused no photo-state changes.

The guard scans every engine-state JSON file, including an unexpected new file,
and the generated photo review. It rejects raw or unrecognized OCR fields, free
photo-verdict explanations and unstructured rejection reasons. Runtime tests put
synthetic tripwires into both reader and model answers and inspect actual writer
outputs. Human-written anatomical evidence remains subject to its existing
no-lettering/no-quotation validation.

The Photo Sourcing question change follows this migration. Its poor/unwell
booleans and question version use the same controlled writer; its generated
review must not print the model's note. All general image switches and source
alteration grants remain off.

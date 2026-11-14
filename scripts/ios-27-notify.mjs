// One message into an Infinitus thread, for ios-27-daily.sh: node scripts/ios-27-notify.mjs <thread id> <message>
import { sendToThread } from './infinitus-send.mjs'

const [threadId, message] = process.argv.slice(2)
await sendToThread({ threadId, message })

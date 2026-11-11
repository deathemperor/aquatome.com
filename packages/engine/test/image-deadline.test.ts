import { expect, test, vi } from 'vitest'
import { beforeDeadline } from '../src/image-deadline'
test('cancellation before work does not start it, and a rejecting already-started promise is observed',async()=>{
 const c=new AbortController();c.abort(Error('cancelled'));const start=vi.fn(async()=>{throw Error('should never run')})
 await expect(beforeDeadline(start,c.signal)).rejects.toThrow('cancelled');expect(start).not.toHaveBeenCalled()
 const unhandled=vi.fn();process.on('unhandledRejection',unhandled)
 try{await expect(beforeDeadline(Promise.reject(Error('transport refused')),c.signal)).rejects.toThrow('cancelled');await new Promise(r=>setImmediate(r));expect(unhandled).not.toHaveBeenCalled()}finally{process.off('unhandledRejection',unhandled)}
})
test('a cancellation between the guard and deferred start still invokes no dependency',async()=>{
 const c=new AbortController(),start=vi.fn(async()=>1),pending=beforeDeadline(start,c.signal);c.abort(Error('deadline'));await expect(pending).rejects.toThrow('deadline');expect(start).not.toHaveBeenCalled()
})

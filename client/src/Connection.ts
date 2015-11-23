import Client from './Client'
import Patient from './Patient'
import Visit from './Visit'
import SearchResults from'./SearchResults'

const TIMEOUT_INTERVAL = 5000

function genID() {
    const buf = new Uint32Array(8)
    const str: string[] = []
    self.crypto.getRandomValues(buf)
    for(let i = 0; i < buf.length; i += 2) {
        str.push(buf[i].toString(16))
    }

    return str.join('')
}

class PendingContext {
    private timeoutIndex: number

    constructor(private id: number,
                public resolve: (val:{})=>void,
                public reject: (msg:{})=>void,
                public removeFunc: (i:number)=>void) {
        this.resolve = resolve
        this.reject = reject
        this.removeFunc = removeFunc
        this.timeoutIndex = setTimeout(() => {
            removeFunc(this.id)

            return reject({error: 'timeout'})
        }, TIMEOUT_INTERVAL)

        Object.seal(this)
    }

    expire() {
        clearTimeout(this.timeoutIndex)
        this.removeFunc(this.id)
    }
}

export default class Connection {
    host: string
    sock: WebSocket
    pending: Map<number, PendingContext>
    messageCounter: number

    constructor(host: string) {
        this.host = host
        this.sock = null

        this.pending = new Map<number, PendingContext>()
        this.messageCounter = 0

        Object.seal(this)
    }

    genID() { return genID() }

    connect() {
        this.sock = new WebSocket(this.host, 'vetclix')

        this.sock.onmessage = (event) => {
            let data: any = null

            try {
                data = JSON.parse(event.data)
            } catch(err) {
                console.warn('Received bad message', event.data)
                return
            }

            if(!Number.isInteger(data.i)) {
                console.warn('Received unknown message', data)
                return
            }

            const pending = this.pending.get(data.i)
            pending.expire()
            if(data.m === 'error') { return pending.reject(data.m) }
            else { return pending.resolve(data.m) }
        }

        return new Promise((resolve, reject) => {
            this.sock.onopen = () => {
                return resolve()
            }

            this.sock.onerror = (msg) => {
                return reject(msg)
            }
        })
    }

    search(query: string) {
        return this.__send_message(['search', query]).then((results) => {
            return SearchResults.deserialize(results)
        })
    }

    showUpcoming() {
        return this.__send_message(['show-upcoming']).then((results) => {
            return SearchResults.deserialize(results)
        })
    }

    getClients(ids: string[]) {
        return this.__send_message(['get-clients', ids]).then((results: {}[]) => {
            return results.map((raw) => Client.deserialize(raw))
        })
    }

    getPatients(ids: string[]) {
        return this.__send_message(['get-patients', ids]).then((results: {}[]) => {
            return results.map((raw) => Patient.deserialize(raw))
        })
    }

    /// Save a patient to the database, generating a new ID if it isn't already
    /// set. Specifies a list of client IDs for whom to add this patient as a pet.
    savePatient(patient: Patient, clientIDs: string[]=[]) {
        const newDoc = patient.id === undefined || patient.id === null
        if(newDoc) {
            patient.id = this.genID()
        }

        return this.__send_message(['save-patient', patient.serialize(), clientIDs, newDoc])
    }

    saveClient(client: Client) {
        const newDoc = client.id === undefined || client.id === null
        if(newDoc) {
            client.id = this.genID()
        }

        return this.__send_message(['save-client', client.serialize(), newDoc])
    }

    saveVisit(visit: Visit) {
        const newDoc = visit.id === undefined || visit.id === null
        if(newDoc) {
            visit.id = this.genID()
        }

        return this.__send_message(['save-visit', visit.serialize(), newDoc])
    }

    login(username: string, password: string) {
        return this.__send_message(['login', username, password])
    }

    logout() {
        return this.__send_message(['logout'])
    }

    clear() {
        return this.__send_message(['clear'])
    }

    close() {
        this.sock.close()
    }

    __send_message<T>(message: Object) {
        this.messageCounter += 1

        return new Promise((resolve, reject) => {
            this.sock.send(JSON.stringify({
                i: this.messageCounter,
                m: message
            }))

            // Set up a pending action that associates the given messageCounter
            // with the Promise. If the request expires, remove from the pending
            // list.

            const pending = new PendingContext(this.messageCounter, resolve, reject, (i: number) => {
                this.pending.delete(i)
            })

            this.pending.set(this.messageCounter, pending)
        }).catch((e) => {
            console.error(e)
            throw e
        })
    }

    static theConnection: Connection = null

    static init() {
        Connection.theConnection = new Connection('ws://localhost')
        return Connection.theConnection.connect()
    }
}

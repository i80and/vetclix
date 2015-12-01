/// <reference path="typings/mithril/mithril.d.ts" />
/// <reference path="typings/moment/moment.d.ts" />

import Client from './Client'
import Connection from './Connection'
import Patient from './Patient'
import SearchResults from './SearchResults'
import Visit from './Visit'
import * as optionsWidget from './optionsWidget'
import toggleWidget from './toggleWidget'
import * as appointmentEditor from './appointmentEditor'
import * as util from './util'

const PAUSE_INTERVAL_MS = 200

export class ViewModel {
    private timeoutID: number
    results: SearchResults
    appointmentEditor: appointmentEditor.Model

    __selectedClient: string
    __selectedPatient: string

    constructor() {
        this.timeoutID = -1
        this.results = new SearchResults([])
        this.appointmentEditor = null

        this.selected = null

        this.showUpcoming()
    }

    get dirty() {
        if(!this.selected) { return false }
        return this.selected.dirty
    }

    get selected(): Client | Patient {
        if (this.__selectedClient) { return this.results.client(this.__selectedClient) }
        if (this.__selectedPatient) { return this.results.patient(this.__selectedPatient) }
        return null
    }

    get selectedClient(): Client {
        if (this.__selectedClient) { return this.results.client(this.__selectedClient) }
        throw util.assertionError.error('Attempt to access client when patient selected')
    }

    get selectedPatient(): Patient {
        if (this.__selectedPatient) { return this.results.patient(this.__selectedPatient) }
        throw util.assertionError.error('Attempt to access patient when client selected')
    }

    set selected(record: Client | Patient) {
        if(record instanceof Client) {
            this.__selectedClient = record.id
            this.__selectedPatient = ''
        } else if(record instanceof Patient) {
            this.__selectedClient = null
            this.__selectedPatient = record.id
        } else {
            this.__selectedClient = this.__selectedPatient = ''
        }
    }

    isSelected(record: any) {
        if(this.selected === null) { return false }

        if(this.selected.id === record.id) {
            return true
        }

        if((record instanceof Client) && record.hasPet(this.selected.id)) {
            return true
        }

        return false
    }

    search(query: string) {
        if(query === '') { return this.showUpcoming() }

        // Don't search unless there's been a pause
        if(this.timeoutID >= 0) {
            window.clearTimeout(this.timeoutID)
        }

        this.timeoutID = window.setTimeout(() => {
            this.timeoutID = -1
            this.__search(query)
        }, PAUSE_INTERVAL_MS)
    }

    addClient() {
        const client = new Client(null, {})

        m.startComputation()
        this.results.updateClient(client).then((id: string) => {
            return this.selectClient(id)
        }).then(() => {
            m.endComputation()
        }).catch((msg) => {
            console.error(msg)
            m.endComputation()
        })
    }

    addPatient() {
        if(!(this.selected instanceof Client)) {
            throw util.typeError.error('Cannot create patient child of selection')
        }

        if(!this.selected.id) {
            throw util.valueError.error('Selection has no ID')
        }

        const patient = Patient.emptyPatient()
        const clientID = this.selected.id

        m.startComputation()
        this.results.updatePatient(patient, { addOwners: [clientID] }).then((id: string) => {
            return this.selectPatient(id)
        }).then(() => {
            m.endComputation()
        }).catch((msg: any) => {
            console.error(msg)
            m.endComputation()
        })
    }

    save() {
        if(!this.dirty) { return }

        m.startComputation()
        new Promise((resolve) => {
            const selected = this.selected

            if(selected instanceof Client) {
                resolve(this.results.updateClient(selected))
            } else if(selected instanceof Patient) {
                resolve(this.results.updatePatient(selected))
            }
        }).catch((msg: any) => {
            console.error(msg)
            m.endComputation()
        }).then(() => {
            this.selected.dirty = false
            m.endComputation()
        })
    }

    revert() {
        if(this.dirty) {
            if (!window.confirm('Are you sure you want to revert your working changes?')) {
                return
            }
        }

        const selected = this.selected
        if(selected instanceof Client) {
            return this.selectClient(selected.id)
        } else if(selected instanceof Patient) {
            return this.selectPatient(selected.id)
        }
    }

    showUpcoming() {
        m.startComputation()

        Connection.theConnection.showUpcoming().then((results) => {
            this.results = results
            m.endComputation()
        }).catch((err) => {
            console.error(err)
            this.results.clear()
            m.endComputation()

        })
    }

    selectClient(id: string) {
        return this.__selectRecord(id, (id: string) => {
            return this.results.refreshClients([id]).then(() => {
                return this.results.client(id)
            })
        })
    }

    selectPatient(id: string) {
        return this.__selectRecord(id, (id: string) => {
            return this.results.refreshPatients([id]).then(() => {
                return this.results.patient(id)
            })
        })
    }

    addAppointment() {
        const newVisit = Visit.emptyVisit()
        m.startComputation()
        this.results.insertVisit(this.selected.id, newVisit).then(() => {
            this.appointmentEditor = new appointmentEditor.Model(newVisit)
            m.endComputation()
        }).catch(() => {
            m.endComputation()
        })
    }

    selectAppointment(visit: Visit) {
        this.appointmentEditor = new appointmentEditor.Model(visit)
    }

    updateAppointment(editor: appointmentEditor.Model) {
        m.startComputation()
        const newAppointment = editor.getNewAppointment()
        let promise: any
        if(newAppointment.id === null) {
            if(!(this.selected instanceof Patient)) {
                throw util.assertionError.error(`Not patient: "${this.selected}"`)
            }

            promise = this.results.insertVisit(this.selected.id, newAppointment)
        } else {
            promise = this.results.updateVisit(newAppointment)
        }

        promise.then(() => {
            m.endComputation()
        }).catch((err: any) => {
            m.endComputation()
            console.error(`Failed to update visit ${newAppointment.id}`)
            throw err
        })
    }

    get selectedAppointment() {
        if(this.appointmentEditor) {
            return this.appointmentEditor.appointment
        }

        return null
    }

    __selectRecord(id: string, getter: (id:string)=>any) {
        m.startComputation()
        this.appointmentEditor = null
        return getter(id).then((record: Client|Patient) => {
            this.selected = record
            m.endComputation()

            return record
        }).catch((msg: any) => {
            console.error(msg)
            m.endComputation()
        })
    }

    __search(query: string) {
        m.startComputation()

        Connection.theConnection.search(query).then((results) => {
            this.results = results
            m.endComputation()
        }).catch((err) => {
            console.error(err)
            this.results.clear()
            m.endComputation()
        })
    }
}

export let vm: ViewModel = null

function renderPatient(petID: string) {
    const patient = vm.results.patients.get(petID)
    if(!patient) {
        console.error(`No such patient: ${petID}`)
        return m('li.patient-info')
    }

    const classes: string[] = []

    if(vm.results.matchedPatients.has(petID)) { classes.push('preferred') }
    if(!patient.active) { classes.push('inactive') }
    if(vm.selected && (patient.id === vm.selected.id)) { classes.push('selected') }

    return m('li.patient-info',
        { class: classes.join(' '),
          onclick: () => vm.selectPatient(petID) }, [
        m('span', patient.name)
    ])
}

function renderClient(client: Client) {
    return m('li', {
            class: vm.isSelected(client)? 'active' : ''
        }, [
        m('div.fa.fa-user'),
        m('div', [
            m('div.client-info', { onclick: () => vm.selectClient(client.id) }, [
                m('div', client.name),
                m('div', client.address),
            ]),
            m('ul.patient-results', [
                client.pets.map((petID) => {
                    return renderPatient(petID)
                })
            ])
        ])
    ])
}

function renderCommonToolbarEntries() {
    return [
        m('div.small-button', {
            title: 'Save',
            class: vm.dirty? '' : 'inactive',
            onclick: () => vm.save() }, m('span.fa.fa-save')),
        m('div.small-button', {
            title: 'Revert',
            onclick: () => vm.revert() }, m('span.fa.fa-undo'))
    ]
}

function renderEditClient() {
    return m('section#edit-pane', [
        m('div#record-pane', [
            m('div.tool-bar', [
                ...renderCommonToolbarEntries(),
                m('div.small-button', {
                    title: 'Add Patient',
                    onclick: () => vm.addPatient()
                }, m('span.fa.fa-plus'))
            ]),
            m('input', {
                placeholder: 'Name',
                value: vm.selected.name,
                oninput: function() { vm.selected.name = this.value } }),
            m('input', {
                placeholder: 'Address',
                value: vm.selectedClient.address,
                oninput: function() { vm.selectedClient.address = this.value } }),
            m('input', {
                placeholder: 'Email Address',
                value: vm.selectedClient.email,
                oninput: function() { vm.selectedClient.email = this.value }
            }),
            m('textarea', {
                placeholder: 'Notes',
                rows: 5,
                value: vm.selected.note,
                oninput: function() { vm.selected.note = this.value } })
            ])
    ])
}

function renderEditPatient() {
    const now = moment()

    const children = [
        m('div#record-pane', [
            m('div.tool-bar', [
                ...renderCommonToolbarEntries()
            ]),
            m('input', {
                placeholder: 'Name',
                value: vm.selected.name,
                oninput: function() { vm.selected.name = this.value } }),
            m('input', {
                placeholder: 'Species',
                list: 'species-datalist',
                value: vm.selectedPatient.species,
                oninput: function() { vm.selectedPatient.species = this.value } }),
            optionsWidget.optionsWidget({
                onclick: (val: string) => vm.selectedPatient.sex = val,
                value: vm.selectedPatient.sex,
                states: [
                    new optionsWidget.State('m',
                        () => m('span.fa.fa-mars', { title: 'Male' })),
                    new optionsWidget.State('f',
                        () => m('span.fa.fa-venus', { title: 'Female' }))]
            }),
            m('div', [
                toggleWidget({
                    value: vm.selectedPatient.intact,
                    ontoggle: (val: boolean) => vm.selectedPatient.intact = val ,
                    onprompt: () => !vm.selectedPatient.intact? window.confirm('You are un-fixing a patient. Are you sure?') : true }),
                m('span.left-padded', 'Intact')
            ]),
            m('input', {
                placeholder: 'Breed',
                value: vm.selectedPatient.breed,
                oninput: function() { vm.selectedPatient.breed = this.value } }),
            m('input', {
                placeholder: 'Physical Description',
                value: vm.selectedPatient.description,
                oninput: function() { vm.selectedPatient.description = this.value } }),
            m('textarea', {
                placeholder: 'Notes',
                rows: 5,
                value: vm.selected.note,
                oninput: function() { vm.selected.note = this.value } }),
            m('div', [
                toggleWidget({
                    value: vm.selectedPatient.active,
                    ontoggle: (val: boolean) => vm.selectedPatient.active = val,
                    onprompt: () => window.confirm('Are you sure you want to change this patient\'s status?')}),
                m('span.left-padded', 'Active')
            ])
        ]),
        m('div#schedule-pane', [
            m('section', [
                m('h1', 'Due'),
                vm.selectedPatient.dueByDate().map((kv: [moment.Moment, string[]]) => {
                    const [date, names] = kv

                    return m('div.due-entry', { class: date.isAfter(now)? 'future' : '' }, [
                        m('span', date.format('ddd ll')),
                        m('span', util.fromNowMinimum(date)),
                        m('div', names.join(', '))
                    ])
                }),
            ]),
            m('section', [
                m('h1', 'Appointments'),
                [ m('div.visit-entry.small-button', { onclick: () => vm.addAppointment() }, [
                    m('div', [m('span'), m('span.fa.fa-plus')])
                ])].concat(vm.selectedPatient.visits.map((visit: Visit) => {
                    if(visit === undefined) {
                        console.error(`Couldn't find visit ${visit.id}`)
                        return null
                    }

                    return m('div.visit-entry', {
                        onclick: () => { vm.selectAppointment(visit) },
                        class: vm.selectedAppointment && vm.selectedAppointment.id === visit.id? 'selected' : ''
                    }, [
                        m('div.visit-date', { class: visit.date.isAfter(now)? '' : 'past' }, [
                            m('span', visit.date.format('ddd ll')),
                            m('span', visit.date.fromNow())
                        ])
                    ])
                }).filter((x: any) => x !== null))
            ])
        ])
    ]

    if(vm.appointmentEditor) {
        children.push(appointmentEditor.view(vm.appointmentEditor, {
            onsave: (m) => vm.updateAppointment(m),
            ondelete: () => console.log('Delete')
        }))
    }

    return m('section#edit-pane', children)
}

function renderEditSelected() {
    if(vm.selected instanceof Client) {
        return renderEditClient()
    } else if(vm.selected instanceof Patient) {
        return renderEditPatient()
    }
}

export const view = function() {
    return m('section#search-page', [
        m('section#search-pane', [
            m('input#search-bar', {
                placeholder: 'What to search for?',
                oninput: function() { vm.search(this.value) }
            }),
            m('div#add-client-button.small-button', {
                title: 'Add a new client',
                onclick: () => vm.addClient() }, m('span.fa.fa-plus')),
            m('ul#search-results', vm.results.map((client: Client) => {
                return renderClient(client)
            }))
        ]),
        renderEditSelected()
    ])
}

export const controller = function() {
    vm = new ViewModel()
}

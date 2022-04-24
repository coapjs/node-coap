const coap = require('../') // or coap

const statusRequest = coap.request({
    method: 'GET',
    host: 'californium.eclipseprojects.io',
    pathname: 'obs',
    observe: true,
    confirmable: true
})

let responseCounter = 0

statusRequest.on('response', res => {
    res.on('error', err => {
        console.error('Error by receiving: ' + err)
        this.emit('error', 'Error by receiving: ' + err)
        res.close()
    })

    res.on('data', chunk => {
        console.log(`Server time: ${chunk.toString()}`)
        responseCounter++
        if (responseCounter >= 5) {
            console.log('Successfully received five responses. Closing the ObserveStream.')
            res.close()
        }
    })
})
statusRequest.end()

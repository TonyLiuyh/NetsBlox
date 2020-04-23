class TelloClient {
    #address;
    #port;
    #clientId;
    #server_socket;
    #transaction_counter;
    #callbacks;

    constructor(address, port, clientId, server_socket) {
        this.#address = address;
        this.#port = port;
        this.#clientId = clientId;
        this.#server_socket = server_socket;
        this.#transaction_counter = 1;
        // mapping from transaction id to promise callback
        this.#callbacks = {};
    }

    onMessage(transaction_id, message) {
        var resolve = this.#callbacks[transaction_id];
        if (resolve != undefined) {
            delete this.#callbacks[transaction_id];
            resolve(message);
        }
    }
    
    send(mac_address, command, client_timeout, drone_timeout) {
        const transaction_id = this.#transaction_counter++;
        const message = transaction_id + ' ' + mac_address + ' ' + drone_timeout + ' ' + command;
        this.#server_socket.send(Buffer.from(message), this.#port, this.#address);
        var callbacks = this.#callbacks;
        return new Promise(function (resolve) {
            callbacks[transaction_id] = resolve;
            setTimeout(() => {
                if (callbacks[transaction_id]) {
                    delete callbacks[transaction_id];
                }
                resolve('Error: client timeout');
            }, client_timeout);
        });
    }
    
    search() {
        // then() gives the response from the client, which is a list of MAC 
        // addresses separated by spaces
        return this.send('0', 'search', 2000, 0);
    }

    getAddress() {
        return this.#address;
    }

    getPort() {
        return this.#port;
    }
}


module.exports = TelloClient;
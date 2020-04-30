/*
 * Author: Yuhang Liu <yuhang.liu.1@vanderbilt.edu>
 */

class TelloClient {
    #rinfo;
    #server_socket;
    #transaction_counter;
    #callbacks;

    constructor(rinfo, server_socket) {
        this.#rinfo = rinfo;
        this.#server_socket = server_socket;
        this.#transaction_counter = 1;
        this.#callbacks = {};
    }

    // is called when a message arrived
    onMessage(transaction_id, message) {
        // resolve callback 
        var resolve = this.#callbacks[transaction_id];
        if (resolve != undefined) {
            delete this.#callbacks[transaction_id];
            resolve(message);
        }
    }
    
    send(mac_address, command, client_timeout, drone_timeout) {
        const transaction_id = this.#transaction_counter++;
        const message = transaction_id + ' ' + mac_address + ' ' + drone_timeout + ' ' + command;
        this.#server_socket.send(Buffer.from(message), this.#rinfo.port, this.#rinfo.address);

        // create promise and save its resolve callback
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

    getAddress() {
        return this.#rinfo.address;
    }

    getPort() {
        return this.#rinfo.port;
    }
}


module.exports = TelloClient;
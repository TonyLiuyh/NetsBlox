/*
 * Author: Yuhang Liu <yuhang.liu.1@vanderbilt.edu>
 */

const TelloClient = require('./telloClient');
const dgram = require('dgram');
// three categories of commands
const readCommands = ['speed?', 'battery?', 'time?', 'height?', 'temp?', 'attitude?', 
    'baro?', 'acceleration?', 'tof?', 'wifi?'];
const controlCommands = ['command', 'takeoff', 'land', 'streamon', 'streamoff', 'emergency', 
    'up', 'down', 'left', 'right', 'forward', 'back', 'cw', 'ccw', 'flip', 'go', 'curve'];
const setCommands = ['speed', 'rc', 'wifi'];


const TelloService = {};

// map from IP address to clientId
var clientIds = {};
// mapping from clientId to TelloClient
var clients = {};
// mapping from tello mac address to the clientId using it and the using time
var drones = {}; 
// create server socket
var server_socket = dgram.createSocket('udp4');
server_socket.bind(9001, '127.0.0.1')
server_socket.on('message', (msg, rinfo) => {
    var tokens = msg.toString().split(' ');
    var transaction_id = parseInt(tokens[0]);
    var client_id = tokens[1];
    var response = '';
    if (tokens.length >= 2) {
        response += tokens[2];
        for (let index = 3; index < tokens.length; index++) {
            response += ' ' + tokens[index];
        }
    }
    var client = clients[client_id];
    if (transaction_id == 0) {
        clients[client_id] = new TelloClient(rinfo.address, rinfo.port, client_id, server_socket);
    } else if (client != undefined) {
        client.onMessage(transaction_id, response);
    }
});

/**
 * Sends a textual command to a specific tello drone/
 * This will be allowed only after you get control over it.
 * 
 * @param {string} mac_address The MAC address of the tello drone
 * @param {String} cmd Textual command to send
 * @return {String} tello response
 */
TelloService.send = function(mac_address, cmd) {
    var drone = drones[mac_address];
    //const clientId = this.caller.clientId;
    const clientId = '_test';
    var tello_client = clients[clientId];
    var now = new Date();
    const current_time = now.getTime();

    // make sure the client is registered
    if (tello_client == undefined) {
        return 'Error: unregistered client';
    }
    // make sure the drone of the MAC address is registered on server
    if (drone == undefined) {
        return 'Error: unknown MAC address';
    }
    // make sure this client has access to this drone
    if (drone.clientId != clientId) {
        if (drone.expireTime < current_time) {
            drone.clientId = '';
            drone.expireTime = 0;
        }
        return 'Error: no access to this drone';
    } else if (drone.expireTime < current_time) {
        drone.clientId = '';
        drone.expireTime = 0;
        return 'Error: your control over this drone has expired';
    }

    var str = cmd.split(' ')[0];
    var client_timeout;
    var drone_timeout;
    // decide wait time according to command type
    if (readCommands.includes(str)) {
        client_timeout = 200;
        drone_timeout = 150;
    } else if (controlCommands.includes(str)) {
        client_timeout = 5000;
        drone_timeout = 4800;
    } else if (setCommands.includes(str)) {
        client_timeout = 200;
        drone_timeout = 150;
    } else {
        return 'Error: invalid command';
    }

    // send to client
    return tello_client.send(mac_address, cmd, client_timeout, drone_timeout).then();
}

/**
 * Searches for available tello drones
 * 
 * @return {Array<String>} an array of addresses
 */
TelloService.search = async function() {
    //var client = clients[this.caller.clientId];
    var client = clients['_test'];
    if (client) {
        var promise = await client.search();
        var search_result = promise.split(' ');
        if (search_result[0] != 'Error:') {
            for (let i = 0; i < search_result.length; ++i) {
                const mac_address = search_result[i];
                if (drones[mac_address] == undefined) {
                    var drone = {};
                    drone.clientId = '';
                    drone.expireTime = 0;
                    drones[mac_address] = drone;
                }
            }
        }
        return search_result;
    } else {
        return 'Error: unregistered client';
    }
}

/**
 * Requests for the control of a certain drone for some amount of time in seconds.
 * Other users cannot use a drone when one user is using it. 
 * 
 * @param {String} mac_address The MAC address of the tello drone
 * @param {Number} time The amount of time to use
 * @return {String} whether you successfully register for using the drone
 */
TelloService.requestControl = function(mac_address, time) {
    var drone = drones[mac_address];
    const now = new Date();
    const current_time = now.getTime();
    // const client_id = this.caller.clientId;
    const client_id = '_test';
    if (drone) {
        //if (drone.clientId == '' || drone.clientId == this.caller.clientId || drone.expireTime < current_time) {
        if (drone.clientId == '' || client_id == '_test' || drone.expireTime < current_time) {
            drone.clientId = client_id;
            drone.expireTime = current_time + time * 1000;
            return 'OK';
        } else {
            return 'Error: this drone is owned by others'
        }
    } else {
        return 'Error: unknown MAC address';
    }
}

module.exports = TelloService;
/*
 * Author: Yuhang Liu <yuhang.liu.1@vanderbilt.edu>
 * 
 * This file 
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


// dictionary of TelloClients, keyed by rinfo of their sockets
var clients = {};
// mapping from tello mac address to the {tello client, clientId using it, expire time}
// is a list of registered drones
var drones = {}; 
// create server socket
var server_socket = dgram.createSocket('udp4');
server_socket.bind(9001, '127.0.0.1')
server_socket.on('message', (msg, rinfo) => {
    if (clients[rinfo] == undefined) {
        clients[rinfo] = new TelloClient(rinfo, server_socket);
    }
    var client = clients[rinfo];
    var tokens = msg.toString().split(' ');
    var transaction_id = parseInt(tokens[0]);
    var operation = tokens[1];
    // new drones to be registered
    if (operation == 'add') {
        for (let i = 2; i < tokens.length; ++i) {
            if (tokens[i] != '' && drones[tokens[i]] == undefined) {
                var drone = {};
                drone.telloClient = client;
                drone.clientId = '';
                drone.expireTime = 0;
                drones[tokens[i]] = drone;
            }
        }
    } else if (operation == 'remove') { // remove inactive drones
        for (let i = 2; i < tokens.length; ++i) {
            if (tokens[i] != '') {
                delete drones[tokens[i]];
            }
        }
    } else if (operation == 'message') { // receive messages from drones
        var response = '';
        if (tokens.length >= 2) {
            response += tokens[2];
            for (let index = 3; index < tokens.length; index++) {
                response += ' ' + tokens[index];
            }
        }
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
    if (drone == undefined) {
        return 'Error: cannot find the drone of this MAC address';
    }
    //var tello_client = drones[mac_address].telloClient;
    var clientId = this.caller.clientId;
    var now = new Date();
    const current_time = now.getTime();

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
    return drones[mac_address].telloClient.send(mac_address, cmd, client_timeout, drone_timeout).then();
}

/**
 * Searches for available tello drones
 * 
 * @return {Array<String>} an array of addresses
 */
TelloService.search = function() {
    // directly return all elements in drones
    return Object.keys(drones);
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
    const client_id = this.caller.clientId;
    if (drone != undefined) {
        // if nobody takes this drone or it is already taken by this client
        if (drone.clientId == '' || drone.clientId == client_id || drone.expireTime < current_time) {
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